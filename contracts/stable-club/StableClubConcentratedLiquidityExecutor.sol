// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PermissionRegistry} from "./PermissionRegistry.sol";
import {StrategyPermissionRegistry} from "./StrategyPermissionRegistry.sol";
import {FeeRouter} from "./FeeRouter.sol";
import {StableClubSwapRouter} from "./StableClubSwapRouter.sol";
import {IStableClubSwapRouter} from "./interfaces/IStableClubSwapRouter.sol";
import {MevGuard} from "./MevGuard.sol";
import {IOracleGuard} from "./interfaces/IOracleGuard.sol";
import {IConcentratedLiquidityAdapter} from "./interfaces/IConcentratedLiquidityAdapter.sol";
import {IAllowanceTransfer} from "./interfaces/IAllowanceTransfer.sol";
import {UserTokenPull} from "./libraries/UserTokenPull.sol";
import {SafetyController} from "./SafetyController.sol";

/// @title StableClubConcentratedLiquidityExecutor — atomic USDC-only five-pool CL deposit/exit (Phase 2a).
/// @notice Stateless; mints position NFTs to the user. All five legs succeed or entire tx reverts.
/// @dev SafetyController gates deposits/swaps only. Exits (individual, Exit All, emergency) never call it.
contract StableClubConcentratedLiquidityExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant LEG_COUNT = 5;
    uint256 private constant MAX_SWAPS_PER_LEG = 2;
    /// @dev Max reverse swaps when unwinding exit proceeds to USDC (cbBTC/WETH → USDC).
    uint256 private constant MAX_EXIT_UNWIND_SWAPS = 8;
    /// @dev SC-10: exit permission nonces occupy the high half of uint256; deposit legs stay below this flag.
    uint256 public constant EXIT_EXECUTION_NONCE_DOMAIN = uint256(1) << 255;
    /// @dev Harvest/compound nonces — disjoint from deposit (low) and exit (bit 255).
    uint256 public constant AUTOMATION_EXECUTION_NONCE_DOMAIN = uint256(1) << 254;

    PermissionRegistry public immutable permissionRegistry;
    StrategyPermissionRegistry public immutable strategyRegistry;
    FeeRouter public immutable feeRouter;
    IStableClubSwapRouter public immutable swapRouter;
    MevGuard public immutable mevGuard;
    IOracleGuard public immutable oracleGuard;
    SafetyController public immutable safetyController;

    address public immutable usdc;
    address public owner;
    IAllowanceTransfer public permit2;

    mapping(address => bool) public approvedAdapters;
    mapping(address => bool) public approvedTokens;
    mapping(bytes32 => address) public poolAdapters;

    struct SwapInstruction {
        bytes32 routeId;
        uint256 grossUsdcIn;
        uint256 minOut;
        uint256 quotedOut;
        uint256 deadline;
    }

    struct DepositLegParams {
        uint8 legIndex;
        address adapter;
        address tokenA;
        address tokenB;
        int24 tickLower;
        int24 tickUpper;
        uint256 retainUsdc;
        SwapInstruction[2] swaps;
        uint8 swapCount;
        uint256 amountAMin;
        uint256 amountBMin;
        uint256 slippageBps;
    }

    struct ExitLegParams {
        uint8 legIndex;
        address adapter;
        address tokenA;
        address tokenB;
        uint256 positionTokenId;
        /// @dev Required for partial exits. Ignored when `fullExit` is true (closePosition burns NFT).
        uint128 liquidity;
        uint256 amountAMin;
        uint256 amountBMin;
        uint256 slippageBps;
        /// @dev true → closePosition (remove all liquidity + burn NFT). false → partial decreaseLiquidity.
        bool fullExit;
    }

    /// @dev Reverse swap instruction for exitAllToUsdc (non-USDC → USDC via allowlisted routes).
    struct ExitUnwindSwap {
        bytes32 routeId;
        /// @dev Exact input; must be > 0.
        uint256 amountIn;
        uint256 minOut;
        uint256 quotedOut;
        uint256 deadline;
    }

    /// @dev Shared leg identity for harvestAll / compoundAll (user-owned CL NFT).
    struct PositionManageLegParams {
        uint8 legIndex;
        address adapter;
        address tokenA;
        address tokenB;
        uint256 positionTokenId;
        /// @dev Compound only — mins for increaseLiquidity (harvest ignores).
        uint256 amountAMin;
        uint256 amountBMin;
        uint256 slippageBps;
    }

    event AdapterApproved(address indexed adapter, bool approved);
    event TokenApproved(address indexed token, bool approved);
    event PoolRegistered(bytes32 indexed poolId, address indexed adapter);
    event Permit2Updated(address indexed permit2);
    event OwnerTransferred(address indexed previous, address indexed next);
    event StrategyDepositCompleted(
        bytes32 indexed strategyId,
        address indexed user,
        uint256 grossUsdc,
        uint256 executionNonce
    );
    event StrategyLegExited(
        bytes32 indexed strategyId,
        uint8 legIndex,
        bytes32 poolId,
        uint256 positionTokenId,
        bool emergency
    );
    event StrategyExitToUsdcCompleted(
        bytes32 indexed strategyId,
        address indexed user,
        uint256 usdcOut,
        uint256 executionNonceBase
    );
    event StrategyHarvestCompleted(
        bytes32 indexed strategyId,
        address indexed user,
        uint256 executionNonceBase
    );
    event StrategyCompoundCompleted(
        bytes32 indexed strategyId,
        address indexed user,
        uint256 executionNonceBase
    );

    error AdapterNotApproved();
    error PoolNotApproved();
    error PoolMismatch();
    error Unauthorized();
    error InvalidAmount();
    error FundsRemaining();
    error MinOutRequired();
    error LegIndexOutOfBounds();
    error StrategyUserMismatch();
    error TokenNotApproved();
    error InvalidDepositToken();
    error InvalidLegConfiguration();
    error InvalidSwapPlan();
    error LegBudgetMismatch();
    error GrossDepositMismatch();
    error CanonicalLegMismatch();
    error InvalidPermit2();
    error InvalidSafetyController();
    error InvalidExecutionNonce();
    /// @dev Same selector as UserTokenPull.Permit2Required — declared for ABI/test matching.
    error Permit2Required();
    error InvalidExitUnwindPlan();
    error ResidualNonUsdc();
    error PositionNotOwned();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyApprovedAdapter(address adapter) {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        _;
    }

    constructor(
        address permissionRegistry_,
        address strategyRegistry_,
        address feeRouter_,
        address swapRouter_,
        address mevGuard_,
        address oracleGuard_,
        address safetyController_,
        address usdc_
    ) {
        if (safetyController_ == address(0)) revert InvalidSafetyController();
        permissionRegistry = PermissionRegistry(permissionRegistry_);
        strategyRegistry = StrategyPermissionRegistry(strategyRegistry_);
        feeRouter = FeeRouter(feeRouter_);
        swapRouter = IStableClubSwapRouter(swapRouter_);
        mevGuard = MevGuard(mevGuard_);
        oracleGuard = IOracleGuard(oracleGuard_);
        safetyController = SafetyController(safetyController_);
        usdc = usdc_;
        owner = msg.sender;
    }

    /**
     * @notice SC-10 deposit domain: `strategyNonce * 10 + legIndex` (high bit clear).
     * @dev Disjoint from {@link encodeExitExecutionNonce}. Rejects overflow / domain collision.
     */
    function encodeDepositLegExecutionNonce(uint256 strategyNonce, uint256 legIndex)
        public
        pure
        returns (uint256)
    {
        if (legIndex >= LEG_COUNT) revert LegIndexOutOfBounds();
        if (strategyNonce > (type(uint256).max - (LEG_COUNT - 1)) / 10) revert InvalidExecutionNonce();
        uint256 derived = strategyNonce * 10 + legIndex;
        if (derived >= EXIT_EXECUTION_NONCE_DOMAIN) revert InvalidExecutionNonce();
        return derived;
    }

    /**
     * @notice SC-10 exit domain: `EXIT_EXECUTION_NONCE_DOMAIN | callerNonce`.
     * @dev Caller nonce must stay below the domain flag so deposit and exit never collide.
     */
    function encodeExitExecutionNonce(uint256 callerNonce) public pure returns (uint256) {
        if (callerNonce >= EXIT_EXECUTION_NONCE_DOMAIN) revert InvalidExecutionNonce();
        return EXIT_EXECUTION_NONCE_DOMAIN | callerNonce;
    }

    /// @notice SC-10 exitAll helper: encode `nonceBase + legIndex` into the exit domain.
    function encodeExitAllLegExecutionNonce(uint256 nonceBase, uint256 legIndex)
        public
        pure
        returns (uint256)
    {
        if (legIndex >= LEG_COUNT) revert LegIndexOutOfBounds();
        if (nonceBase > type(uint256).max - legIndex) revert InvalidExecutionNonce();
        return encodeExitExecutionNonce(nonceBase + legIndex);
    }

    /// @notice Map caller nonce into the harvest/compound domain (bit 254).
    function encodeAutomationExecutionNonce(uint256 callerNonce) public pure returns (uint256) {
        if (callerNonce >= AUTOMATION_EXECUTION_NONCE_DOMAIN) revert InvalidExecutionNonce();
        return AUTOMATION_EXECUTION_NONCE_DOMAIN | callerNonce;
    }

    function encodeAutomationAllLegExecutionNonce(uint256 nonceBase, uint256 legIndex)
        public
        pure
        returns (uint256)
    {
        if (legIndex >= LEG_COUNT) revert LegIndexOutOfBounds();
        if (nonceBase > type(uint256).max - legIndex) revert InvalidExecutionNonce();
        return encodeAutomationExecutionNonce(nonceBase + legIndex);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert Unauthorized();
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    function setAdapterApproval(address adapter, bool approved) external onlyOwner {
        approvedAdapters[adapter] = approved;
        emit AdapterApproved(adapter, approved);
    }

    function setTokenApproval(address token, bool approved) external onlyOwner {
        approvedTokens[token] = approved;
        emit TokenApproved(token, approved);
    }

    function registerPool(bytes32 poolId, address adapter) external onlyOwner {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        if (IConcentratedLiquidityAdapter(adapter).poolId() != poolId) revert PoolMismatch();
        poolAdapters[poolId] = adapter;
        emit PoolRegistered(poolId, adapter);
    }

    function setPermit2(address permit2_) external onlyOwner {
        if (permit2_ == address(0)) revert InvalidPermit2();
        permit2 = IAllowanceTransfer(permit2_);
        emit Permit2Updated(permit2_);
    }

    /// @notice Atomic USDC-only deposit across exactly five canonical legs.
    function depositFivePoolStrategy(
        bytes32 strategyId,
        uint256 executionNonce,
        uint256 grossUsdc,
        bytes32[5] calldata poolIds,
        uint256 deadline,
        DepositLegParams[5] calldata legs
    ) external nonReentrant {
        StrategyPermissionRegistry.StrategyPermission memory strategy =
            strategyRegistry.getStrategy(strategyId);
        if (strategy.user != msg.sender) revert StrategyUserMismatch();
        if (strategy.depositToken != usdc) revert InvalidDepositToken();
        if (grossUsdc == 0) revert InvalidAmount();

        // SC-10: reject unencodable deposit nonces before consuming strategy or permission nonces.
        for (uint256 i = 0; i < LEG_COUNT; i++) {
            encodeDepositLegExecutionNonce(executionNonce, i);
        }

        strategyRegistry.validateAndConsumeStrategyDepositIntent(
            strategyId, msg.sender, grossUsdc, poolIds, deadline, executionNonce
        );

        uint256 budgetSum;
        for (uint256 i = 0; i < LEG_COUNT; i++) {
            DepositLegParams calldata leg = legs[i];
            if (leg.legIndex != uint8(i)) revert LegIndexOutOfBounds();

            StrategyPermissionRegistry.PoolLegBinding memory binding = strategyRegistry.getLeg(strategyId, i);
            bytes32 poolId = IConcentratedLiquidityAdapter(leg.adapter).poolId();
            if (poolAdapters[poolId] != leg.adapter) revert PoolNotApproved();
            if (binding.poolId != poolId) revert CanonicalLegMismatch();
            if (leg.tokenA != binding.tokenA || leg.tokenB != binding.tokenB) revert CanonicalLegMismatch();
            if (leg.adapter != binding.adapter) revert CanonicalLegMismatch();

            uint256 legBudget = strategyRegistry.legAmount(grossUsdc, i);
            budgetSum += legBudget;
            _validateLegSwapPlan(leg, legBudget);
            _assertDepositLegSafety(poolId, leg.tokenA, leg.tokenB);

            strategyRegistry.validateStrategyLegDeposit(
                strategyId,
                i,
                leg.adapter,
                grossUsdc,
                leg.slippageBps,
                encodeDepositLegExecutionNonce(executionNonce, i)
            );
        }
        if (budgetSum != grossUsdc) revert GrossDepositMismatch();

        strategyRegistry.validateStrategyDeposit(strategyId, grossUsdc, legs[0].slippageBps);

        uint256 preUsdc = IERC20(usdc).balanceOf(address(this));
        UserTokenPull.pull(permit2, usdc, msg.sender, address(this), grossUsdc);

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            _executeDepositLeg(strategyId, msg.sender, legs[i], strategyRegistry.legAmount(grossUsdc, i));
        }

        _refundExcess(msg.sender, usdc, preUsdc);
        _assertBalanceRestored(usdc, preUsdc);

        emit StrategyDepositCompleted(strategyId, msg.sender, grossUsdc, executionNonce);
    }

    function _validateLegSwapPlan(DepositLegParams calldata leg, uint256 legBudget) internal view {
        if (leg.swapCount > MAX_SWAPS_PER_LEG) revert InvalidSwapPlan();
        if (leg.amountAMin == 0 && leg.amountBMin == 0) revert MinOutRequired();

        uint256 plannedUsdc = leg.retainUsdc;
        for (uint256 s = 0; s < leg.swapCount; s++) {
            SwapInstruction calldata swap = leg.swaps[s];
            if (swap.grossUsdcIn == 0 || swap.minOut == 0 || swap.quotedOut == 0) revert MinOutRequired();
            if (swap.deadline < block.timestamp) revert InvalidSwapPlan();

            StableClubSwapRouter.RouteConfig memory route = swapRouter.getRoute(swap.routeId);
            if (!route.enabled || route.tokenIn != usdc) revert InvalidSwapPlan();
            if (!approvedTokens[route.tokenOut]) revert TokenNotApproved();

            plannedUsdc += swap.grossUsdcIn;
        }
        if (plannedUsdc != legBudget) revert LegBudgetMismatch();
    }

    function _executeDepositLeg(
        bytes32 strategyId,
        address user,
        DepositLegParams calldata leg,
        uint256 legBudget
    ) internal {
        // Defense-in-depth: re-check USDC plan equals the 20% leg budget before spending.
        _validateLegSwapPlan(leg, legBudget);

        bytes32 poolId = IConcentratedLiquidityAdapter(leg.adapter).poolId();
        _assertDepositLegSafety(poolId, leg.tokenA, leg.tokenB);

        _requireApprovedToken(leg.tokenA);
        _requireApprovedToken(leg.tokenB);

        uint256 preA = IERC20(leg.tokenA).balanceOf(address(this));
        uint256 preB = IERC20(leg.tokenB).balanceOf(address(this));

        uint256 amountA;
        uint256 amountB;

        if (leg.retainUsdc > 0) {
            (amountA, amountB) = _allocateUsdcToPair(leg.tokenA, leg.tokenB, leg.retainUsdc, amountA, amountB);
        }

        for (uint256 s = 0; s < leg.swapCount; s++) {
            SwapInstruction calldata swap = leg.swaps[s];
            StableClubSwapRouter.RouteConfig memory route = swapRouter.getRoute(swap.routeId);

            _assertSwapSafety(poolId, route.tokenOut);
            oracleGuard.validatePrices(usdc, route.tokenOut, 0);

            IERC20(usdc).forceApprove(address(feeRouter), swap.grossUsdcIn);
            uint256 netUsdc = feeRouter.applySwapFeeOnHeld(usdc, user, swap.grossUsdcIn, strategyId);
            _clearApproval(usdc, address(feeRouter));

            mevGuard.assertSwapProtections(
                usdc,
                route.tokenOut,
                netUsdc,
                swap.minOut,
                swap.quotedOut,
                leg.slippageBps,
                swap.deadline
            );

            IERC20(usdc).forceApprove(address(swapRouter), netUsdc);
            uint256 outAmount =
                swapRouter.executeExactInput(swap.routeId, netUsdc, swap.minOut, swap.deadline);
            _clearApproval(usdc, address(swapRouter));

            (amountA, amountB) =
                _allocateTokenToPair(leg.tokenA, leg.tokenB, route.tokenOut, outAmount, amountA, amountB);
        }

        if (amountA > 0) IERC20(leg.tokenA).forceApprove(leg.adapter, amountA);
        if (amountB > 0) IERC20(leg.tokenB).forceApprove(leg.adapter, amountB);

        IConcentratedLiquidityAdapter(leg.adapter).mintPosition(
            user,
            leg.tokenA,
            leg.tokenB,
            leg.tickLower,
            leg.tickUpper,
            amountA,
            amountB,
            leg.amountAMin,
            leg.amountBMin
        );

        _refundExcess(user, leg.tokenA, preA);
        if (leg.tokenB != leg.tokenA) _refundExcess(user, leg.tokenB, preB);
        // Gross USDC is consumed across legs from the single deposit pull; only assert intermediates.
        if (leg.tokenA != usdc) {
            _assertBalanceRestored(leg.tokenA, preA);
        }
        if (leg.tokenB != leg.tokenA && leg.tokenB != usdc) {
            _assertBalanceRestored(leg.tokenB, preB);
        }
        _clearApproval(leg.tokenA, leg.adapter);
        _clearApproval(leg.tokenB, leg.adapter);
    }

    /// @notice Deposit-path circuit breakers: pause + depeg. Never called from exit paths.
    function _assertDepositLegSafety(bytes32 poolId, address tokenA, address tokenB) internal view {
        safetyController.assertDepositAllowed(poolId);
        safetyController.assertTokenNotDepegged(usdc);
        safetyController.assertTokenNotDepegged(tokenA);
        safetyController.assertTokenNotDepegged(tokenB);
    }

    /// @notice Per-swap circuit breakers on the deposit path only.
    function _assertSwapSafety(bytes32 poolId, address tokenOut) internal view {
        safetyController.assertSwapAllowed(poolId);
        safetyController.assertTokenNotDepegged(usdc);
        safetyController.assertTokenNotDepegged(tokenOut);
    }

    function _exitLegInternal(
        bytes32 strategyId,
        address user,
        ExitLegParams calldata leg,
        uint256 executionNonce,
        bool emergency,
        address proceedsRecipient
    ) internal {
        bytes32 poolId = IConcentratedLiquidityAdapter(leg.adapter).poolId();
        if (poolAdapters[poolId] != leg.adapter) revert PoolNotApproved();
        if (IConcentratedLiquidityAdapter(leg.adapter).ownerOf(leg.positionTokenId) != user) {
            revert StrategyUserMismatch();
        }
        // Adapter closePosition only allows recipient = lpOwner or msg.sender (this executor).
        if (proceedsRecipient != user && proceedsRecipient != address(this)) {
            revert InvalidExitUnwindPlan();
        }
        // SC-01: out-of-range CL may return only one token — allow a zero min on either side,
        // but never allow both mins to be zero (normal and emergency share this path).
        if (leg.amountAMin == 0 && leg.amountBMin == 0) revert MinOutRequired();

        // SC-10: map caller nonce into the exit domain before any permission nonce consumption.
        uint256 domainNonce = encodeExitExecutionNonce(executionNonce);

        // Full exits never apply USDC value caps — users must always recover all funds.
        // Ownership, pool/adapter binding, nonce, and minOut remain enforced.
        if (emergency) {
            strategyRegistry.validateStrategyLegEmergency(strategyId, leg.legIndex, domainNonce);
        } else {
            PermissionRegistry.Action action = leg.fullExit
                ? PermissionRegistry.Action.WithdrawAll
                : PermissionRegistry.Action.RemoveLiquidity;
            strategyRegistry.validateStrategyLegExit(
                strategyId,
                leg.legIndex,
                leg.adapter,
                action,
                0,
                leg.slippageBps,
                domainNonce
            );
        }

        uint256 preA = IERC20(leg.tokenA).balanceOf(address(this));
        uint256 preB = IERC20(leg.tokenB).balanceOf(address(this));

        if (leg.fullExit || emergency) {
            // Full / emergency recovery: closePosition removes all liquidity and burns the empty NFT.
            IConcentratedLiquidityAdapter(leg.adapter).closePosition(
                user,
                leg.positionTokenId,
                proceedsRecipient,
                leg.tokenA,
                leg.tokenB,
                leg.amountAMin,
                leg.amountBMin
            );
        } else {
            if (leg.liquidity == 0) revert InvalidAmount();
            // Partial decrease always returns proceeds to the user (not used by exitAllToUsdc).
            IConcentratedLiquidityAdapter(leg.adapter).decreaseLiquidity(
                user,
                leg.positionTokenId,
                leg.tokenA,
                leg.tokenB,
                leg.liquidity,
                leg.amountAMin,
                leg.amountBMin
            );
        }

        // When proceeds go to the user, refund any accidental executor deltas.
        // When proceeds go to this executor (USDC unwind), keep deltas for subsequent swaps.
        if (proceedsRecipient == user) {
            _refundExcess(user, leg.tokenA, preA);
            if (leg.tokenB != leg.tokenA) _refundExcess(user, leg.tokenB, preB);
            _assertBalanceRestored(leg.tokenA, preA);
            if (leg.tokenB != leg.tokenA) _assertBalanceRestored(leg.tokenB, preB);
        }

        emit StrategyLegExited(strategyId, leg.legIndex, poolId, leg.positionTokenId, emergency);
    }

    function exitLeg(
        bytes32 strategyId,
        ExitLegParams calldata leg,
        uint256 executionNonce
    ) external nonReentrant onlyApprovedAdapter(leg.adapter) {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        _exitLegInternal(strategyId, msg.sender, leg, executionNonce, false, msg.sender);
    }

    function exitAll(
        bytes32 strategyId,
        ExitLegParams[5] calldata legs,
        uint256 executionNonceBase
    ) external nonReentrant {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            ExitLegParams calldata leg = legs[i];
            if (leg.adapter == address(0)) continue;
            if (leg.legIndex != uint8(i)) revert LegIndexOutOfBounds();
            // exitAll is a full recovery path — require fullExit so NFTs are burned.
            if (!leg.fullExit) revert InvalidAmount();
            // Preflight overflow into exit domain before any leg consumes a nonce.
            encodeExitAllLegExecutionNonce(executionNonceBase, i);
            _exitLegInternal(strategyId, msg.sender, leg, executionNonceBase + i, false, msg.sender);
        }
    }

    /**
     * @notice Atomic full exit that unwinds all non-USDC proceeds to USDC, then pays the user USDC only.
     * @dev Closes all legs to this executor, executes allowlisted reverse swaps (token → USDC),
     *      requires `minUsdcOut`, transfers USDC to the user, and reverts if any residual non-USDC remains.
     *      Underlying-asset `exitAll` remains available as a separate emergency/break-glass path.
     */
    function exitAllToUsdc(
        bytes32 strategyId,
        ExitLegParams[5] calldata legs,
        ExitUnwindSwap[8] calldata swaps,
        uint8 swapCount,
        uint256 minUsdcOut,
        uint256 executionNonceBase
    ) external nonReentrant returns (uint256 usdcOut) {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        if (minUsdcOut == 0) revert MinOutRequired();
        if (swapCount > MAX_EXIT_UNWIND_SWAPS) revert InvalidExitUnwindPlan();

        address user = msg.sender;
        uint256 preUsdc = IERC20(usdc).balanceOf(address(this));

        // Snapshot non-USDC balances for every token that appears on open legs.
        address[10] memory tracked;
        uint256[10] memory preTracked;
        uint256 trackedCount;

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            ExitLegParams calldata leg = legs[i];
            if (leg.adapter == address(0)) continue;
            if (leg.legIndex != uint8(i)) revert LegIndexOutOfBounds();
            if (!leg.fullExit) revert InvalidAmount();
            encodeExitAllLegExecutionNonce(executionNonceBase, i);

            trackedCount = _trackToken(tracked, preTracked, trackedCount, leg.tokenA);
            trackedCount = _trackToken(tracked, preTracked, trackedCount, leg.tokenB);

            _exitLegInternal(strategyId, user, leg, executionNonceBase + i, false, address(this));
        }

        // Unwind non-USDC → USDC via allowlisted reverse routes.
        for (uint256 s = 0; s < swapCount; s++) {
            ExitUnwindSwap calldata swap = swaps[s];
            if (swap.amountIn == 0 || swap.minOut == 0 || swap.quotedOut == 0) revert MinOutRequired();
            if (swap.deadline < block.timestamp) revert InvalidExitUnwindPlan();

            StableClubSwapRouter.RouteConfig memory route = swapRouter.getRoute(swap.routeId);
            if (!route.enabled || route.tokenOut != usdc || route.tokenIn == usdc) {
                revert InvalidExitUnwindPlan();
            }
            if (!approvedTokens[route.tokenIn]) revert TokenNotApproved();

            bytes32 poolIdHint = bytes32(0);
            // Use first open leg pool for safety context when available.
            for (uint256 i = 0; i < LEG_COUNT; i++) {
                if (legs[i].adapter == address(0)) continue;
                poolIdHint = IConcentratedLiquidityAdapter(legs[i].adapter).poolId();
                break;
            }
            if (poolIdHint != bytes32(0)) {
                _assertSwapSafety(poolIdHint, route.tokenIn);
            }
            oracleGuard.validatePrices(route.tokenIn, usdc, 0);
            mevGuard.assertSwapProtections(
                route.tokenIn,
                usdc,
                swap.amountIn,
                swap.minOut,
                swap.quotedOut,
                100,
                swap.deadline
            );

            IERC20(route.tokenIn).forceApprove(address(swapRouter), swap.amountIn);
            swapRouter.executeExactInput(swap.routeId, swap.amountIn, swap.minOut, swap.deadline);
            _clearApproval(route.tokenIn, address(swapRouter));
        }

        // No residual non-USDC from this exit may remain on the executor.
        for (uint256 t = 0; t < trackedCount; t++) {
            address token = tracked[t];
            if (token == usdc) continue;
            if (IERC20(token).balanceOf(address(this)) != preTracked[t]) revert ResidualNonUsdc();
        }

        uint256 postUsdc = IERC20(usdc).balanceOf(address(this));
        if (postUsdc < preUsdc) revert InvalidAmount();
        usdcOut = postUsdc - preUsdc;
        if (usdcOut < minUsdcOut) revert MinOutRequired();

        IERC20(usdc).safeTransfer(user, usdcOut);
        _assertBalanceRestored(usdc, preUsdc);

        emit StrategyExitToUsdcCompleted(strategyId, user, usdcOut, executionNonceBase);
    }

    /**
     * @notice Collect uncollected fees + protocol rewards for all open legs to the user wallet.
     * @dev Non-custodial: recipient is always the strategy user. Requires per-token NPM approval of each adapter.
     */
    function harvestAll(
        bytes32 strategyId,
        PositionManageLegParams[5] calldata legs,
        uint256 executionNonceBase
    ) external nonReentrant {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        address user = msg.sender;

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            PositionManageLegParams calldata leg = legs[i];
            if (leg.adapter == address(0)) continue;
            if (leg.legIndex != uint8(i)) revert LegIndexOutOfBounds();
            encodeAutomationAllLegExecutionNonce(executionNonceBase, i);
            _harvestLegInternal(strategyId, user, leg, executionNonceBase + i);
        }

        emit StrategyHarvestCompleted(strategyId, user, executionNonceBase);
    }

    /**
     * @notice Collect LP fees into each position via increaseLiquidity; rewards go to the user (no auto-swap).
     * @dev Legs with zero collectible fees are no-ops after permission validation. Dust residual refunded to user.
     */
    function compoundAll(
        bytes32 strategyId,
        PositionManageLegParams[5] calldata legs,
        uint256 executionNonceBase
    ) external nonReentrant {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        address user = msg.sender;

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            PositionManageLegParams calldata leg = legs[i];
            if (leg.adapter == address(0)) continue;
            if (leg.legIndex != uint8(i)) revert LegIndexOutOfBounds();
            encodeAutomationAllLegExecutionNonce(executionNonceBase, i);
            _compoundLegInternal(strategyId, user, leg, executionNonceBase + i);
        }

        emit StrategyCompoundCompleted(strategyId, user, executionNonceBase);
    }

    function _requireManageLeg(
        bytes32 strategyId,
        address user,
        PositionManageLegParams calldata leg,
        PermissionRegistry.Action action,
        uint256 executionNonce
    ) internal {
        if (!approvedAdapters[leg.adapter]) revert AdapterNotApproved();
        bytes32 poolId = IConcentratedLiquidityAdapter(leg.adapter).poolId();
        if (poolAdapters[poolId] != leg.adapter) revert PoolNotApproved();
        if (IConcentratedLiquidityAdapter(leg.adapter).ownerOf(leg.positionTokenId) != user) {
            revert PositionNotOwned();
        }

        uint256 domainNonce = encodeAutomationExecutionNonce(executionNonce);
        // Harvest: slippage unused (pass 0). Compound: enforce strategy max via slippageBps.
        uint256 slippage = action == PermissionRegistry.Action.Harvest ? 0 : leg.slippageBps;
        strategyRegistry.validateStrategyLegExit(
            strategyId,
            leg.legIndex,
            leg.adapter,
            action,
            0,
            slippage,
            domainNonce
        );
    }

    function _harvestLegInternal(
        bytes32 strategyId,
        address user,
        PositionManageLegParams calldata leg,
        uint256 executionNonce
    ) internal {
        _requireManageLeg(strategyId, user, leg, PermissionRegistry.Action.Harvest, executionNonce);
        IConcentratedLiquidityAdapter(leg.adapter).collectFees(user, leg.positionTokenId, user);
        IConcentratedLiquidityAdapter(leg.adapter).collectRewards(user, leg.positionTokenId, user);
    }

    function _compoundLegInternal(
        bytes32 strategyId,
        address user,
        PositionManageLegParams calldata leg,
        uint256 executionNonce
    ) internal {
        _requireManageLeg(strategyId, user, leg, PermissionRegistry.Action.Compound, executionNonce);

        // Rewards (e.g. AERO) go to the user — v1 does not auto-swap.
        IConcentratedLiquidityAdapter(leg.adapter).collectRewards(user, leg.positionTokenId, user);

        uint256 preA = IERC20(leg.tokenA).balanceOf(address(this));
        uint256 preB = IERC20(leg.tokenB).balanceOf(address(this));
        IConcentratedLiquidityAdapter(leg.adapter).collectFees(user, leg.positionTokenId, address(this));
        uint256 feeA = IERC20(leg.tokenA).balanceOf(address(this)) - preA;
        uint256 feeB = IERC20(leg.tokenB).balanceOf(address(this)) - preB;

        if (feeA > 0 || feeB > 0) {
            if (feeA > 0) IERC20(leg.tokenA).forceApprove(leg.adapter, feeA);
            if (feeB > 0) IERC20(leg.tokenB).forceApprove(leg.adapter, feeB);
            IConcentratedLiquidityAdapter(leg.adapter).increaseLiquidity(
                user,
                leg.positionTokenId,
                leg.tokenA,
                leg.tokenB,
                feeA,
                feeB,
                leg.amountAMin,
                leg.amountBMin
            );
            _clearApproval(leg.tokenA, leg.adapter);
            _clearApproval(leg.tokenB, leg.adapter);
        }

        _refundExcess(user, leg.tokenA, preA);
        if (leg.tokenB != leg.tokenA) _refundExcess(user, leg.tokenB, preB);
        _assertBalanceRestored(leg.tokenA, preA);
        if (leg.tokenB != leg.tokenA) _assertBalanceRestored(leg.tokenB, preB);
    }

    function _trackToken(
        address[10] memory tracked,
        uint256[10] memory preTracked,
        uint256 trackedCount,
        address token
    ) internal view returns (uint256) {
        if (token == address(0) || token == usdc) return trackedCount;
        for (uint256 i = 0; i < trackedCount; i++) {
            if (tracked[i] == token) return trackedCount;
        }
        if (trackedCount >= 10) revert InvalidExitUnwindPlan();
        tracked[trackedCount] = token;
        preTracked[trackedCount] = IERC20(token).balanceOf(address(this));
        return trackedCount + 1;
    }

    function emergencyExitLeg(
        bytes32 strategyId,
        ExitLegParams calldata leg,
        uint256 executionNonce
    ) external nonReentrant onlyApprovedAdapter(leg.adapter) {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        // Emergency is always a full recovery with NFT burn.
        if (!leg.fullExit) revert InvalidAmount();
        _exitLegInternal(strategyId, msg.sender, leg, executionNonce, true, msg.sender);
    }

    function _allocateUsdcToPair(
        address tokenA,
        address tokenB,
        uint256 usdcAmount,
        uint256 amountA,
        uint256 amountB
    ) internal view returns (uint256 newA, uint256 newB) {
        newA = amountA;
        newB = amountB;
        if (tokenA == usdc) newA += usdcAmount;
        else if (tokenB == usdc) newB += usdcAmount;
        else revert InvalidLegConfiguration();
    }

    function _allocateTokenToPair(
        address tokenA,
        address tokenB,
        address token,
        uint256 tokenAmount,
        uint256 amountA,
        uint256 amountB
    ) internal pure returns (uint256 newA, uint256 newB) {
        newA = amountA;
        newB = amountB;
        if (tokenA == token) newA += tokenAmount;
        else if (tokenB == token) newB += tokenAmount;
        else revert InvalidLegConfiguration();
    }

    function _requireApprovedToken(address token) internal view {
        if (token == address(0) || !approvedTokens[token]) revert TokenNotApproved();
    }

    /// @dev Forward only the balance delta created by this call; leave pre-existing dust untouched.
    function _refundExcess(address user, address token, uint256 preBalance) internal {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > preBalance) {
            IERC20(token).safeTransfer(user, bal - preBalance);
        }
    }

    function _assertBalanceRestored(address token, uint256 preBalance) internal view {
        if (IERC20(token).balanceOf(address(this)) != preBalance) revert FundsRemaining();
    }

    function _clearApproval(address token, address spender) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            IERC20(token).forceApprove(spender, 0);
        }
    }

    function _cbbtc() internal pure returns (address) {
        return 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf;
    }

    function _weth() internal pure returns (address) {
        return 0x4200000000000000000000000000000000000006;
    }
}
