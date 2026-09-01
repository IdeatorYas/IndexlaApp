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
    event StrategyRegistrarSet(address indexed registrar, bool allowed);
    event OwnerTransferred(address indexed previous, address indexed next);

    mapping(bytes32 => Permission) public permissions;
    mapping(bytes32 => uint256) public dailySpent;
    mapping(bytes32 => uint256) public dailyExecutionCount;
    mapping(bytes32 => uint256) public dailyWindowStart;
    mapping(bytes32 => uint256) public lastExecutionAt;
    mapping(bytes32 => mapping(uint256 => bool)) public executionNonceUsed;
    /// @dev SC-04: pause applied by StrategyPermissionRegistry cascade (independent of `Permission.paused`).
    mapping(bytes32 => bool) public strategyCascadePaused;
    /// @dev SC-04: each permission ID binds to at most one strategy ID.
    mapping(bytes32 => bytes32) public permissionStrategyId;

    address public owner;
    mapping(address => bool) public isOperator;
    mapping(address => bool) public isStrategyRegistrar;
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
    error InvalidPermissionParams();
    error PermissionStrategyMismatch();
    error PermissionAlreadyBoundToStrategy();

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

    /// @notice Allow StrategyPermissionRegistry to register leg permissions for users.
    /// @dev Owner/governance only (Safe/Timelock-ready). Revoking a registrar immediately
    ///      blocks `registerPermissionForStrategyRegistrar` — no residual ACL.
    function setStrategyRegistrar(address registrar, bool allowed) external onlyOwner {
        if (registrar == address(0)) revert InvalidOperator();
        isStrategyRegistrar[registrar] = allowed;
        emit StrategyRegistrarSet(registrar, allowed);
    }

    /// @dev Called by StrategyPermissionRegistry; `perm.user` is the wallet owner, not msg.sender.
    /// @notice Registrar cannot invent permissions for a user outside a user-authenticated strategy registration.
    /// @dev Hardened: non-zero user/tokens/poolId, distinct tokens, exact `block.chainid`, slippage/expiry.
    function registerPermissionForStrategyRegistrar(Permission calldata perm)
        external
        returns (bytes32 permissionId)
    {
        if (!isStrategyRegistrar[msg.sender]) revert Unauthorized();
        if (perm.user == address(0)) revert UnauthorizedUser();
        if (perm.tokenA == address(0) || perm.tokenB == address(0) || perm.tokenA == perm.tokenB) {
            revert InvalidPermissionParams();
        }
        if (perm.poolId == bytes32(0)) revert InvalidPermissionParams();
        if (perm.chainId != block.chainid) revert InvalidPermissionParams();
        if (perm.maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage();
        if (perm.expiresAt <= block.timestamp) revert PermissionExpired();

        permissionId = permissionIdFor(perm.user, perm.chainId, perm.poolId, perm.tokenA, perm.tokenB);

        Permission storage existing = permissions[permissionId];
        // SC-05: any existing record (active or revoked) cannot be overwritten/reactivated.
        if (existing.user != address(0)) revert PermissionAlreadyExists();

        permissions[permissionId] = perm;
        emit PermissionRegistered(permissionId, perm.user, perm.poolId);
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

    /// @notice Scoped permission id — never collides with legacy 5-field `permissionIdFor`.
    /// @dev Extra `scope` word changes the ABI encoding arity, so even scope=0 is distinct from legacy.
    function permissionIdForScoped(
        address user,
        uint256 chainId,
        bytes32 poolId,
        address tokenA,
        address tokenB,
        bytes32 scope
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(user, chainId, poolId, tokenA, tokenB, scope));
    }

    function registerPermission(Permission calldata perm) external returns (bytes32 permissionId) {
        if (perm.user != msg.sender) revert UnauthorizedUser();
        if (perm.maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage();
        if (perm.expiresAt <= block.timestamp) revert PermissionExpired();

        permissionId = permissionIdFor(perm.user, perm.chainId, perm.poolId, perm.tokenA, perm.tokenB);

        Permission storage existing = permissions[permissionId];
        // SC-05: any existing record (active or revoked) cannot be overwritten/reactivated.
        if (existing.user != address(0)) revert PermissionAlreadyExists();

        permissions[permissionId] = perm;

        emit PermissionRegistered(permissionId, perm.user, perm.poolId);
    }

    /// @notice Register a scoped permission (e.g. compound) that coexists with legacy unscoped ids.
    /// @dev Requires non-zero `scope`. Does not modify or weaken legacy `registerPermission`.
    function registerScopedPermission(Permission calldata perm, bytes32 scope)
        external
        returns (bytes32 permissionId)
    {
        if (perm.user != msg.sender) revert UnauthorizedUser();
        if (scope == bytes32(0)) revert InvalidPermissionParams();
        if (perm.maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage();
        if (perm.expiresAt <= block.timestamp) revert PermissionExpired();

        permissionId =
            permissionIdForScoped(perm.user, perm.chainId, perm.poolId, perm.tokenA, perm.tokenB, scope);

        Permission storage existing = permissions[permissionId];
        // SC-05: any existing record (active or revoked) cannot be overwritten/reactivated.
        if (existing.user != address(0)) revert PermissionAlreadyExists();

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

    /// @notice SC-04: bind a freshly registered leg permission to exactly one strategy.
    function bindPermissionToStrategy(bytes32 permissionId, bytes32 strategyId) external {
        if (!isStrategyRegistrar[msg.sender]) revert Unauthorized();
        if (permissionId == bytes32(0) || strategyId == bytes32(0)) revert InvalidPermissionParams();
        Permission storage perm = permissions[permissionId];
        if (perm.user == address(0)) revert PermissionNotFound();
        if (permissionStrategyId[permissionId] != bytes32(0)) revert PermissionAlreadyBoundToStrategy();
        permissionStrategyId[permissionId] = strategyId;
    }

    /// @notice SC-04: strategy kill-switch revoke for a bound leg (registrar only).
    /// @dev Idempotent if already revoked. Does not allow permission-ID reuse (SC-05).
    function revokeFromStrategyRegistrar(bytes32 permissionId, address user, bytes32 strategyId)
        external
    {
        if (!isStrategyRegistrar[msg.sender]) revert Unauthorized();
        Permission storage perm = permissions[permissionId];
        if (perm.user == address(0)) revert PermissionNotFound();
        if (perm.user != user) revert UnauthorizedUser();
        if (permissionStrategyId[permissionId] != strategyId) revert PermissionStrategyMismatch();
        if (perm.revoked) return;
        perm.revoked = true;
        emit PermissionRevoked(permissionId, user);
    }

    /// @notice SC-04: strategy-applied pause — distinct from user/operator `paused`.
    function pauseFromStrategyRegistrar(bytes32 permissionId, address user, bytes32 strategyId)
        external
    {
        if (!isStrategyRegistrar[msg.sender]) revert Unauthorized();
        Permission storage perm = permissions[permissionId];
        if (perm.user == address(0)) revert PermissionNotFound();
        if (perm.user != user) revert UnauthorizedUser();
        if (permissionStrategyId[permissionId] != strategyId) revert PermissionStrategyMismatch();
        if (perm.revoked) revert RevokedPermission();
        strategyCascadePaused[permissionId] = true;
        emit PermissionPaused(permissionId, user);
    }

    /// @notice SC-04: clear only strategy-cascade pause; never clears user/operator `paused`.
    function unpauseFromStrategyRegistrar(bytes32 permissionId, address user, bytes32 strategyId)
        external
    {
        if (!isStrategyRegistrar[msg.sender]) revert Unauthorized();
        Permission storage perm = permissions[permissionId];
        if (perm.user == address(0)) revert PermissionNotFound();
        if (perm.user != user) revert UnauthorizedUser();
        if (permissionStrategyId[permissionId] != strategyId) revert PermissionStrategyMismatch();
        if (perm.revoked) return;
        if (!strategyCascadePaused[permissionId]) return;
        strategyCascadePaused[permissionId] = false;
        emit PermissionUnpaused(permissionId, user);
    }

    function isStrategyCascadePaused(bytes32 permissionId) external view returns (bool) {
        return strategyCascadePaused[permissionId];
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

    /// @notice Authoritative on-chain permission validation for operator executors.
    /// @dev `maxAmountPerTx` / `maxAmountPerDay` apply only when `amount > 0`.
    ///      Harvest, exit and emergency pass `amount=0` — monetary caps non-applicable on those paths.
    ///      Harvest passes `slippage=0` — `maxSlippageBps` non-applicable on harvest path.
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

    /// @notice Emergency-exit nonce gate for the permission owner only (caller must be an operator executor).
    /// @dev Intentionally ignores revoked, paused, and expiry so users can always recover LP via the executor.
    ///      Normal automation/deposit paths remain blocked via validateExecution / _activePermission.
    function validateEmergencyExecution(bytes32 permissionId, uint256 executionNonce) external onlyOperator {
        Permission storage perm = permissions[permissionId];
        if (perm.user == address(0)) revert PermissionNotFound();
        if (perm.chainId != block.chainid) revert UnauthorizedUser();

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
        if (perm.paused || strategyCascadePaused[permissionId]) revert PausedPermission();
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
