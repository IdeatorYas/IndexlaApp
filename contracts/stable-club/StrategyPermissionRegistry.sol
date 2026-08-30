// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PermissionRegistry} from "./PermissionRegistry.sol";
import {IConcentratedLiquidityAdapter} from "./interfaces/IConcentratedLiquidityAdapter.sol";

/// @title StrategyPermissionRegistry — parent five-pool strategy + five bound leg permissions.
/// @notice Canonical Stable Club strategy: exactly five legs, 2_000 bps each, 10_000 bps total.
contract StrategyPermissionRegistry {
    uint256 public constant LEG_COUNT = 5;
    uint256 public constant ALLOCATION_BPS_PER_LEG = 2_000;
    uint256 public constant TOTAL_ALLOCATION_BPS = 10_000;
    uint256 public constant MAX_SLIPPAGE_BPS = 5_000;

    /// @dev Base mainnet USDC — the only permitted strategy deposit token (Phase 2a).
    address public immutable usdc;

    /// @dev Founder-approved canonical strategy kind (STABLE_CLUB_FIVE_POOL_V1).
    bytes32 public immutable strategyKind;

    struct StrategyPermission {
        address user;
        uint256 chainId;
        address depositToken;
        uint256 allowedActions;
        uint256 maxTotalPerTx;
        uint256 maxTotalPerDay;
        uint256 maxSlippageBps;
        uint256 minTimeBetweenExecutions;
        uint256 maxExecutionsPerDay;
        uint256 expiresAt;
        bool revoked;
        bool paused;
    }

    struct PoolLegBinding {
        bytes32 poolId;
        uint256 allocationBps;
        address adapter;
        address tokenA;
        address tokenB;
        bytes32 legPermissionId;
        uint256 maxLegPerTx;
        uint256 maxLegPerDay;
    }

    PermissionRegistry public immutable permissionRegistry;

    mapping(bytes32 => StrategyPermission) public strategies;
    mapping(bytes32 => PoolLegBinding[5]) public strategyLegs;
    mapping(bytes32 => uint256) public strategyDailySpent;
    mapping(bytes32 => uint256) public strategyDailyExecutionCount;
    mapping(bytes32 => uint256) public strategyDailyWindowStart;
    mapping(bytes32 => uint256) public strategyLastExecutionAt;
    mapping(bytes32 => mapping(uint256 => bool)) public strategyDepositNonceUsed;

    address public owner;
    mapping(address => bool) public isOperator;

    event StrategyRegistered(bytes32 indexed strategyId, address indexed user, address depositToken);
    event StrategyRevoked(bytes32 indexed strategyId, address indexed user);
    event StrategyPaused(bytes32 indexed strategyId, address indexed user);
    event StrategyUnpaused(bytes32 indexed strategyId, address indexed user);
    event OwnerTransferred(address indexed previous, address indexed next);
    event OperatorSet(address indexed operator, bool allowed);

    error Unauthorized();
    error UnauthorizedUser();
    error InvalidLegCount();
    error InvalidAllocation();
    error InvalidLegAllocation();
    error StrategyAlreadyExists();
    error StrategyNotFound();
    error RevokedStrategy();
    error PausedStrategy();
    error StrategyExpired();
    error LegPoolMismatch();
    error LegAdapterMismatch();
    error AmountExceedsStrategyTxLimit();
    error AmountExceedsStrategyDailyLimit();
    error AmountExceedsLegTxLimit();
    error SlippageTooHigh();
    error ExecutionTooSoon();
    error DailyExecutionLimitReached();
    error LegIndexOutOfBounds();
    error InvalidDepositToken();
    error DepositIntentExpired();
    error DepositNonceAlreadyUsed();
    error DepositIntentPoolMismatch();
    error DepositIntentMismatch();
    error InvalidAmount();
    error LegPermissionDuplicate();
    error LegPermissionAlreadyBound();
    /// @dev SC-08: adapter.poolId() must equal the registered leg poolId (non-zero).
    error AdapterPoolIdMismatch();
    error InvalidAdapter();

    event StrategyDepositNonceConsumed(bytes32 indexed strategyId, uint256 indexed executionNonce, address indexed user);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert UnauthorizedUser();
        _;
    }

    modifier onlyStrategyUser(bytes32 strategyId) {
        if (strategies[strategyId].user != msg.sender) revert UnauthorizedUser();
        _;
    }

    constructor(address permissionRegistry_, bytes32 strategyKind_, address usdc_) {
        permissionRegistry = PermissionRegistry(permissionRegistry_);
        strategyKind = strategyKind_;
        usdc = usdc_;
        owner = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert Unauthorized();
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    /// @notice Owner/governance-only operator allowlist (CL executor etc.). Safe/Timelock-ready.
    function setOperator(address operator_, bool allowed) external onlyOwner {
        if (operator_ == address(0)) revert Unauthorized();
        isOperator[operator_] = allowed;
        emit OperatorSet(operator_, allowed);
    }

    function strategyIdFor(
        address user,
        uint256 chainId,
        address depositToken
    ) public view returns (bytes32) {
        return keccak256(abi.encode(user, chainId, strategyKind, depositToken));
    }

    /// @notice Register canonical five-pool strategy and five leg permissions atomically.
    function registerFivePoolStrategy(
        StrategyPermission calldata strategy,
        PermissionRegistry.Permission[5] calldata legPermissions,
        PoolLegBinding[5] calldata legs
    ) external returns (bytes32 strategyId) {
        if (strategy.user != msg.sender) revert UnauthorizedUser();
        if (strategy.chainId != block.chainid) revert UnauthorizedUser();
        if (strategy.depositToken != usdc) revert InvalidDepositToken();
        if (strategy.maxSlippageBps > MAX_SLIPPAGE_BPS) {
            revert SlippageTooHigh();
        }
        if (strategy.expiresAt <= block.timestamp) revert StrategyExpired();

        strategyId = strategyIdFor(strategy.user, strategy.chainId, strategy.depositToken);
        StrategyPermission storage existing = strategies[strategyId];
        // SC-04: strategy IDs are non-recyclable (active or revoked).
        if (existing.user != address(0)) revert StrategyAlreadyExists();

        uint256 allocationSum;
        for (uint256 i = 0; i < LEG_COUNT; i++) {
            allocationSum += legs[i].allocationBps;
            if (legs[i].allocationBps != ALLOCATION_BPS_PER_LEG) revert InvalidLegAllocation();
        }
        if (allocationSum != TOTAL_ALLOCATION_BPS) revert InvalidAllocation();

        strategies[strategyId] = strategy;

        bytes32[5] memory seenPermissionIds;
        for (uint256 i = 0; i < LEG_COUNT; i++) {
            PermissionRegistry.Permission calldata legPerm = legPermissions[i];
            PoolLegBinding calldata leg = legs[i];

            if (legPerm.user != strategy.user) revert UnauthorizedUser();
            if (legPerm.poolId != leg.poolId) revert LegPoolMismatch();
            if (legPerm.tokenA != leg.tokenA || legPerm.tokenB != leg.tokenB) revert LegPoolMismatch();
            if (leg.maxLegPerTx > strategy.maxTotalPerTx) revert AmountExceedsLegTxLimit();
            if (leg.allocationBps != ALLOCATION_BPS_PER_LEG) revert InvalidLegAllocation();

            // SC-08: confirm live adapter.poolId() matches the registered leg before any permission bind.
            if (leg.adapter == address(0)) revert InvalidAdapter();
            bytes32 adapterPoolId = IConcentratedLiquidityAdapter(leg.adapter).poolId();
            if (adapterPoolId == bytes32(0) || adapterPoolId != leg.poolId) revert AdapterPoolIdMismatch();

            bytes32 expectedId = permissionRegistry.permissionIdFor(
                legPerm.user, legPerm.chainId, legPerm.poolId, legPerm.tokenA, legPerm.tokenB
            );
            if (leg.legPermissionId != expectedId) revert LegPoolMismatch();

            for (uint256 j = 0; j < i; j++) {
                if (seenPermissionIds[j] == expectedId) revert LegPermissionDuplicate();
            }
            if (permissionRegistry.permissionStrategyId(expectedId) != bytes32(0)) {
                revert LegPermissionAlreadyBound();
            }

            bytes32 legPermissionId = permissionRegistry.registerPermissionForStrategyRegistrar(legPerm);
            if (legPermissionId != expectedId) revert LegPoolMismatch();

            permissionRegistry.bindPermissionToStrategy(legPermissionId, strategyId);
            seenPermissionIds[i] = legPermissionId;

            PoolLegBinding memory stored = leg;
            stored.legPermissionId = legPermissionId;
            strategyLegs[strategyId][i] = stored;
        }

        emit StrategyRegistered(strategyId, strategy.user, strategy.depositToken);
    }

    function revokeStrategy(bytes32 strategyId) external onlyStrategyUser(strategyId) {
        StrategyPermission storage strategy = strategies[strategyId];
        if (strategy.user == address(0)) revert StrategyNotFound();
        address user = strategy.user;
        // Cascade first — any leg failure reverts the entire kill switch.
        for (uint256 i = 0; i < LEG_COUNT; i++) {
            bytes32 legPermissionId = strategyLegs[strategyId][i].legPermissionId;
            if (legPermissionId == bytes32(0)) revert LegPoolMismatch();
            permissionRegistry.revokeFromStrategyRegistrar(legPermissionId, user, strategyId);
        }
        strategy.revoked = true;
        emit StrategyRevoked(strategyId, msg.sender);
    }

    function pauseStrategy(bytes32 strategyId) external onlyStrategyUser(strategyId) {
        StrategyPermission storage strategy = strategies[strategyId];
        if (strategy.user == address(0)) revert StrategyNotFound();
        address user = strategy.user;
        for (uint256 i = 0; i < LEG_COUNT; i++) {
            bytes32 legPermissionId = strategyLegs[strategyId][i].legPermissionId;
            if (legPermissionId == bytes32(0)) revert LegPoolMismatch();
            permissionRegistry.pauseFromStrategyRegistrar(legPermissionId, user, strategyId);
        }
        strategy.paused = true;
        emit StrategyPaused(strategyId, msg.sender);
    }

    function unpauseStrategy(bytes32 strategyId) external onlyStrategyUser(strategyId) {
        StrategyPermission storage strategy = strategies[strategyId];
        if (strategy.user == address(0)) revert StrategyNotFound();
        address user = strategy.user;
        for (uint256 i = 0; i < LEG_COUNT; i++) {
            bytes32 legPermissionId = strategyLegs[strategyId][i].legPermissionId;
            if (legPermissionId == bytes32(0)) revert LegPoolMismatch();
            permissionRegistry.unpauseFromStrategyRegistrar(legPermissionId, user, strategyId);
        }
        strategy.paused = false;
        emit StrategyUnpaused(strategyId, msg.sender);
    }

    function getStrategy(bytes32 strategyId) external view returns (StrategyPermission memory) {
        return strategies[strategyId];
    }

    function getLeg(bytes32 strategyId, uint256 legIndex) external view returns (PoolLegBinding memory) {
        if (legIndex >= LEG_COUNT) revert LegIndexOutOfBounds();
        return strategyLegs[strategyId][legIndex];
    }

    function legAmount(uint256 grossDeposit, uint256 legIndex) public pure returns (uint256) {
        if (legIndex >= LEG_COUNT) revert LegIndexOutOfBounds();
        return (grossDeposit * ALLOCATION_BPS_PER_LEG) / TOTAL_ALLOCATION_BPS;
    }

    /// @notice Canonical deposit-intent digest for strategy-level execution nonces.
    function depositIntentHash(
        address user,
        bytes32 strategyId,
        uint256 grossUsdc,
        bytes32[5] calldata poolIds,
        uint256 deadline,
        uint256 executionNonce
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                user,
                strategyId,
                grossUsdc,
                poolIds[0],
                poolIds[1],
                poolIds[2],
                poolIds[3],
                poolIds[4],
                ALLOCATION_BPS_PER_LEG,
                TOTAL_ALLOCATION_BPS,
                deadline,
                executionNonce,
                block.chainid,
                strategyKind
            )
        );
    }

    /// @notice Validate bound strategy deposit intent; consumes nonce on success (operator-only).
    function validateAndConsumeStrategyDepositIntent(
        bytes32 strategyId,
        address user,
        uint256 grossUsdc,
        bytes32[5] calldata poolIds,
        uint256 deadline,
        uint256 executionNonce
    ) external onlyOperator {
        StrategyPermission storage strategy = _activeStrategy(strategyId);
        if (strategy.user != user) revert UnauthorizedUser();
        if (strategy.depositToken != usdc) revert InvalidDepositToken();
        if (grossUsdc == 0) revert InvalidAmount();
        if (grossUsdc > strategy.maxTotalPerTx) revert AmountExceedsStrategyTxLimit();
        if (block.timestamp > deadline) revert DepositIntentExpired();
        if (strategyDepositNonceUsed[strategyId][executionNonce]) revert DepositNonceAlreadyUsed();

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            if (strategyLegs[strategyId][i].poolId != poolIds[i]) revert DepositIntentPoolMismatch();
            if (strategyLegs[strategyId][i].allocationBps != ALLOCATION_BPS_PER_LEG) {
                revert InvalidLegAllocation();
            }
        }

        strategyDepositNonceUsed[strategyId][executionNonce] = true;
        emit StrategyDepositNonceConsumed(strategyId, executionNonce, user);
    }

    /// @notice Validates strategy-level caps once per deposit transaction.
    function validateStrategyDeposit(
        bytes32 strategyId,
        uint256 grossDeposit,
        uint256 slippageBps
    ) external onlyOperator {
        StrategyPermission storage strategy = _activeStrategy(strategyId);
        if (slippageBps > strategy.maxSlippageBps) revert SlippageTooHigh();
        if (grossDeposit > strategy.maxTotalPerTx) revert AmountExceedsStrategyTxLimit();

        _rollStrategyDailyWindow(strategyId);
        if (strategyDailySpent[strategyId] + grossDeposit > strategy.maxTotalPerDay) {
            revert AmountExceedsStrategyDailyLimit();
        }
        if (strategyDailyExecutionCount[strategyId] + 1 > strategy.maxExecutionsPerDay) {
            revert DailyExecutionLimitReached();
        }
        if (
            strategyLastExecutionAt[strategyId] != 0
                && block.timestamp < strategyLastExecutionAt[strategyId] + strategy.minTimeBetweenExecutions
        ) {
            revert ExecutionTooSoon();
        }

        strategyDailySpent[strategyId] += grossDeposit;
        strategyDailyExecutionCount[strategyId] += 1;
        strategyLastExecutionAt[strategyId] = block.timestamp;
    }

    /// @notice Validates a strategy-scoped deposit leg for CL executor operators.
    function validateStrategyLegDeposit(
        bytes32 strategyId,
        uint256 legIndex,
        address adapter,
        uint256 grossDeposit,
        uint256 slippageBps,
        uint256 executionNonce
    ) external onlyOperator {
        StrategyPermission storage strategy = _activeStrategy(strategyId);
        if (legIndex >= LEG_COUNT) revert LegIndexOutOfBounds();

        PoolLegBinding storage leg = strategyLegs[strategyId][legIndex];
        if (leg.adapter != adapter) revert LegAdapterMismatch();
        if (slippageBps > strategy.maxSlippageBps) revert SlippageTooHigh();

        uint256 legAmount_ = legAmount(grossDeposit, legIndex);
        if (legAmount_ > leg.maxLegPerTx) revert AmountExceedsLegTxLimit();

        permissionRegistry.validateExecution(
            leg.legPermissionId,
            PermissionRegistry.Action.DepositAndAddLiquidity,
            legAmount_,
            slippageBps,
            executionNonce
        );
    }

    function validateStrategyLegExit(
        bytes32 strategyId,
        uint256 legIndex,
        address adapter,
        PermissionRegistry.Action action,
        uint256 /* amount — liquidity units; not USDC-capped */,
        uint256 slippageBps,
        uint256 executionNonce
    ) external onlyOperator {
        StrategyPermission storage strategy = _activeStrategy(strategyId);
        if (legIndex >= LEG_COUNT) revert LegIndexOutOfBounds();
        PoolLegBinding storage leg = strategyLegs[strategyId][legIndex];
        if (leg.adapter != adapter) revert LegAdapterMismatch();
        if (slippageBps > strategy.maxSlippageBps) revert SlippageTooHigh();

        permissionRegistry.validateExecution(
            leg.legPermissionId,
            action,
            // Liquidity units are not USDC-denominated; deposit caps already bound position size at mint.
            0,
            slippageBps,
            executionNonce
        );
    }

    function validateStrategyLegEmergency(bytes32 strategyId, uint256 legIndex, uint256 executionNonce)
        external
        onlyOperator
    {
        if (strategies[strategyId].user == address(0)) revert StrategyNotFound();
        if (legIndex >= LEG_COUNT) revert LegIndexOutOfBounds();
        permissionRegistry.validateEmergencyExecution(strategyLegs[strategyId][legIndex].legPermissionId, executionNonce);
    }

    function _activeStrategy(bytes32 strategyId) internal view returns (StrategyPermission storage strategy) {
        strategy = strategies[strategyId];
        if (strategy.user == address(0)) revert StrategyNotFound();
        if (strategy.revoked) revert RevokedStrategy();
        if (strategy.paused) revert PausedStrategy();
        if (block.timestamp >= strategy.expiresAt) revert StrategyExpired();
        if (strategy.chainId != block.chainid) revert UnauthorizedUser();
    }

    function _rollStrategyDailyWindow(bytes32 strategyId) internal {
        if (block.timestamp >= strategyDailyWindowStart[strategyId] + 1 days) {
            strategyDailyWindowStart[strategyId] = block.timestamp;
            strategyDailySpent[strategyId] = 0;
            strategyDailyExecutionCount[strategyId] = 0;
        } else if (strategyDailyWindowStart[strategyId] == 0) {
            strategyDailyWindowStart[strategyId] = block.timestamp;
        }
    }
}
