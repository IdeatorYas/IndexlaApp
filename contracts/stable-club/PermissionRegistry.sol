// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PermissionRegistry — scoped, expiring, revocable automation permissions.
/// @notice Step 1: strategy permissions are reusable; each execution consumes a unique execution nonce.
contract PermissionRegistry {
    uint256 public constant MAX_SLIPPAGE_BPS = 5_000; // 50%

    enum Action {
        DepositAndAddLiquidity,
        Swap,
        AddLiquidity,
        RemoveLiquidity,
        WithdrawAll,
        PauseAutomation,
        RevokePermission,
        EmergencyExit,
        // Step 2 automation actions (bits 8+)
        Harvest,
        Compound,
        Rebalance
    }

    struct Permission {
        address user;
        uint256 chainId;
        bytes32 poolId;
        address tokenA;
        address tokenB;
        uint256 allowedActions;
        uint256 maxAmountPerTx;
        uint256 maxAmountPerDay;
        uint256 maxSlippageBps;
        uint256 minTimeBetweenExecutions;
        uint256 maxExecutionsPerDay;
        uint256 expiresAt;
        bool revoked;
        bool paused;
    }

    event PermissionRevoked(bytes32 indexed permissionId, address indexed user);
    event PermissionPaused(bytes32 indexed permissionId, address indexed user);
    event PermissionUnpaused(bytes32 indexed permissionId, address indexed user);
    event PermissionRegistered(bytes32 indexed permissionId, address indexed user, bytes32 poolId);
    event OperatorSet(address indexed operator, bool allowed);
    event OwnerTransferred(address indexed previous, address indexed next);

    mapping(bytes32 => Permission) public permissions;
    mapping(bytes32 => uint256) public dailySpent;
    mapping(bytes32 => uint256) public dailyExecutionCount;
    mapping(bytes32 => uint256) public dailyWindowStart;
    mapping(bytes32 => uint256) public lastExecutionAt;
    mapping(bytes32 => mapping(uint256 => bool)) public executionNonceUsed;

    address public owner;
    mapping(address => bool) public isOperator;
    /// @dev Legacy single-operator getter for ABI compatibility with Step 1 tooling.
    address public operator;

    error PermissionNotFound();
    error PermissionAlreadyExists();
    error RevokedPermission();
    error PausedPermission();
    error PermissionExpired();
    error UnauthorizedUser();
    error ActionNotAllowed();
    error AmountExceedsTxLimit();
    error AmountExceedsDailyLimit();
    error SlippageTooHigh();
    error ExecutionTooSoon();
    error DailyExecutionLimitReached();
    error ExecutionNonceAlreadyUsed();
    error InvalidSlippage();
    error Unauthorized();
    error InvalidOperator();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert UnauthorizedUser();
        _;
    }

    modifier onlyPermissionUser(bytes32 permissionId) {
        if (permissions[permissionId].user != msg.sender) revert UnauthorizedUser();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert InvalidOperator();
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    /// @notice Owner-controlled operator allowlist (Step 1 + Step 2 executors).
    function setOperator(address operator_, bool allowed) public onlyOwner {
        if (operator_ == address(0)) revert InvalidOperator();
        isOperator[operator_] = allowed;
        if (allowed) {
            operator = operator_;
        } else if (operator == operator_) {
            operator = address(0);
        }
        emit OperatorSet(operator_, allowed);
    }

    /// @dev Compatibility shim: wires a single operator (owner only). Prefer setOperator.
    function wireOperator(address operator_) external onlyOwner {
        setOperator(operator_, true);
    }

    function permissionIdFor(
        address user,
        uint256 chainId,
        bytes32 poolId,
        address tokenA,
        address tokenB
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(user, chainId, poolId, tokenA, tokenB));
    }

    function registerPermission(Permission calldata perm) external returns (bytes32 permissionId) {
        if (perm.user != msg.sender) revert UnauthorizedUser();
        if (perm.maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage();
        if (perm.expiresAt <= block.timestamp) revert PermissionExpired();

        permissionId = permissionIdFor(perm.user, perm.chainId, perm.poolId, perm.tokenA, perm.tokenB);

        Permission storage existing = permissions[permissionId];
        if (existing.user != address(0) && !existing.revoked) revert PermissionAlreadyExists();

        permissions[permissionId] = perm;

        emit PermissionRegistered(permissionId, perm.user, perm.poolId);
    }

    function revoke(bytes32 permissionId) external onlyPermissionUser(permissionId) {
        permissions[permissionId].revoked = true;
        emit PermissionRevoked(permissionId, msg.sender);
    }

    function pause(bytes32 permissionId) external onlyPermissionUser(permissionId) {
        permissions[permissionId].paused = true;
        emit PermissionPaused(permissionId, msg.sender);
    }

    function unpause(bytes32 permissionId) external onlyPermissionUser(permissionId) {
        permissions[permissionId].paused = false;
        emit PermissionUnpaused(permissionId, msg.sender);
    }

    function pauseByOperator(bytes32 permissionId, address user) external onlyOperator {
        if (permissions[permissionId].user != user) revert UnauthorizedUser();
        permissions[permissionId].paused = true;
        emit PermissionPaused(permissionId, user);
    }

    function revokeByOperator(bytes32 permissionId, address user) external onlyOperator {
        if (permissions[permissionId].user != user) revert UnauthorizedUser();
        permissions[permissionId].revoked = true;
        emit PermissionRevoked(permissionId, user);
    }

    function isActionAllowed(bytes32 permissionId, Action action) public view returns (bool) {
        Permission storage perm = permissions[permissionId];
        if (perm.user == address(0)) return false;
        uint256 bit = uint256(1) << uint256(action);
        return (perm.allowedActions & bit) != 0;
    }

    function getPermission(bytes32 permissionId) external view returns (Permission memory) {
        return permissions[permissionId];
    }

    function validateExecution(
        bytes32 permissionId,
        Action action,
        uint256 amount,
        uint256 slippageBps,
        uint256 executionNonce
    ) external onlyOperator {
        Permission storage perm = _activePermission(permissionId);
        if (!isActionAllowed(permissionId, action)) revert ActionNotAllowed();
        if (slippageBps > perm.maxSlippageBps) revert SlippageTooHigh();
        if (amount > perm.maxAmountPerTx) revert AmountExceedsTxLimit();

        _rollDailyWindow(permissionId);
        if (dailySpent[permissionId] + amount > perm.maxAmountPerDay) {
            revert AmountExceedsDailyLimit();
        }
        if (dailyExecutionCount[permissionId] + 1 > perm.maxExecutionsPerDay) {
            revert DailyExecutionLimitReached();
        }
        if (
            lastExecutionAt[permissionId] != 0 &&
            block.timestamp < lastExecutionAt[permissionId] + perm.minTimeBetweenExecutions
        ) {
            revert ExecutionTooSoon();
        }

        _consumeExecutionNonce(permissionId, executionNonce);

        dailySpent[permissionId] += amount;
        dailyExecutionCount[permissionId] += 1;
        lastExecutionAt[permissionId] = block.timestamp;
    }

    function validateEmergencyExecution(bytes32 permissionId, uint256 executionNonce) external onlyOperator {
        Permission storage perm = permissions[permissionId];
        if (perm.user == address(0)) revert PermissionNotFound();
        if (perm.revoked) revert RevokedPermission();
        if (block.timestamp >= perm.expiresAt) revert PermissionExpired();
        if (perm.chainId != block.chainid) revert UnauthorizedUser();
        if (!isActionAllowed(permissionId, Action.EmergencyExit)) revert ActionNotAllowed();

        _consumeExecutionNonce(permissionId, executionNonce);
    }

    function _consumeExecutionNonce(bytes32 permissionId, uint256 executionNonce) internal {
        if (executionNonceUsed[permissionId][executionNonce]) revert ExecutionNonceAlreadyUsed();
        executionNonceUsed[permissionId][executionNonce] = true;
    }

    function _activePermission(bytes32 permissionId) internal view returns (Permission storage perm) {
        perm = permissions[permissionId];
        if (perm.user == address(0)) revert PermissionNotFound();
        if (perm.revoked) revert RevokedPermission();
        if (perm.paused) revert PausedPermission();
        if (block.timestamp >= perm.expiresAt) revert PermissionExpired();
        if (perm.chainId != block.chainid) revert UnauthorizedUser();
    }

    function _rollDailyWindow(bytes32 permissionId) internal {
        if (block.timestamp >= dailyWindowStart[permissionId] + 1 days) {
            dailyWindowStart[permissionId] = block.timestamp;
            dailySpent[permissionId] = 0;
            dailyExecutionCount[permissionId] = 0;
        } else if (dailyWindowStart[permissionId] == 0) {
            dailyWindowStart[permissionId] = block.timestamp;
        }
    }
}
