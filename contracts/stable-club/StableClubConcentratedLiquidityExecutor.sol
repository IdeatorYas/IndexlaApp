// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PermissionRegistry} from "./PermissionRegistry.sol";
import {StrategyPermissionRegistry} from "./StrategyPermissionRegistry.sol";
import {FeeRouter} from "./FeeRouter.sol";
import {IStableClubSwapRouter} from "./interfaces/IStableClubSwapRouter.sol";
import {MevGuard} from "./MevGuard.sol";
import {IOracleGuard} from "./interfaces/IOracleGuard.sol";
import {IConcentratedLiquidityAdapter} from "./interfaces/IConcentratedLiquidityAdapter.sol";
import {IAllowanceTransfer} from "./interfaces/IAllowanceTransfer.sol";
import {UserTokenPull} from "./libraries/UserTokenPull.sol";
import {ClFivePoolDepositLib} from "./libraries/ClFivePoolDepositLib.sol";
import {ClFivePoolExitLib} from "./libraries/ClFivePoolExitLib.sol";
import {SafetyController} from "./SafetyController.sol";

/// @title StableClubConcentratedLiquidityExecutor — atomic USDC-only five-pool CL deposit/exit (Phase 2a).
/// @notice Stateless; mints position NFTs to the user. All five legs succeed or entire tx reverts.
/// @dev SafetyController gates deposits/swaps only. Exits (individual, Exit All, emergency) never call it.
///      Heavy deposit/exit bodies live in linked external libraries (not inlined).
contract StableClubConcentratedLiquidityExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant LEG_COUNT = 5;
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
    /// @notice Non-custodial ops gateway allowed to deposit/exit on behalf of strategy.user.
    address public opsGateway;

    mapping(address => bool) public approvedAdapters;
    mapping(address => bool) public approvedTokens;
    mapping(bytes32 => address) public poolAdapters;

    struct PositionManageLegParams {
        uint8 legIndex;
        address adapter;
        address tokenA;
        address tokenB;
        uint256 positionTokenId;
        uint256 amountAMin;
        uint256 amountBMin;
        uint256 slippageBps;
    }

    event AdapterApproved(address indexed adapter, bool approved);
    event TokenApproved(address indexed token, bool approved);
    event PoolRegistered(bytes32 indexed poolId, address indexed adapter);
    event Permit2Updated(address indexed permit2);
    event OpsGatewayUpdated(address indexed previous, address indexed next);
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

    /// @notice Pin the StableClubOpsGateway (Safe/Timelock). Zero disables For-user entrypoints.
    function setOpsGateway(address gateway_) external onlyOwner {
        emit OpsGatewayUpdated(opsGateway, gateway_);
        opsGateway = gateway_;
    }

    /// @notice Atomic USDC-only deposit across exactly five canonical legs.
    function depositFivePoolStrategy(
        bytes32 strategyId,
        uint256 executionNonce,
        uint256 grossUsdc,
        bytes32[5] calldata poolIds,
        uint256 deadline,
        ClFivePoolDepositLib.DepositLegParams[5] calldata legs
    ) external nonReentrant {
        _depositFivePoolStrategy(msg.sender, strategyId, executionNonce, grossUsdc, poolIds, deadline, legs);
    }

    /// @notice Gateway-only deposit for `user` (Permit2 spender must already be this executor).
    function depositFivePoolStrategyFor(
        address user,
        bytes32 strategyId,
        uint256 executionNonce,
        uint256 grossUsdc,
        bytes32[5] calldata poolIds,
        uint256 deadline,
        ClFivePoolDepositLib.DepositLegParams[5] calldata legs
    ) external nonReentrant {
        if (msg.sender != opsGateway || opsGateway == address(0) || user == address(0)) {
            revert Unauthorized();
        }
        _depositFivePoolStrategy(user, strategyId, executionNonce, grossUsdc, poolIds, deadline, legs);
    }

    function _depositFivePoolStrategy(
        address user,
        bytes32 strategyId,
        uint256 executionNonce,
        uint256 grossUsdc,
        bytes32[5] calldata poolIds,
        uint256 deadline,
        ClFivePoolDepositLib.DepositLegParams[5] calldata legs
    ) internal {
        StrategyPermissionRegistry.StrategyPermission memory strategy =
            strategyRegistry.getStrategy(strategyId);
        if (strategy.user != user) revert StrategyUserMismatch();
        if (strategy.depositToken != usdc) revert InvalidDepositToken();
        if (grossUsdc == 0) revert InvalidAmount();

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            encodeDepositLegExecutionNonce(executionNonce, i);
        }

        strategyRegistry.validateAndConsumeStrategyDepositIntent(
            strategyId, user, grossUsdc, poolIds, deadline, executionNonce
        );

        ClFivePoolDepositLib.DepositDeps memory deps = _depositDeps();

        uint256 budgetSum;
        for (uint256 i = 0; i < LEG_COUNT; i++) {
            ClFivePoolDepositLib.DepositLegParams calldata leg = legs[i];
            if (leg.legIndex != uint8(i)) revert LegIndexOutOfBounds();

            StrategyPermissionRegistry.PoolLegBinding memory binding = strategyRegistry.getLeg(strategyId, i);
            bytes32 poolId = IConcentratedLiquidityAdapter(leg.adapter).poolId();
            if (poolAdapters[poolId] != leg.adapter) revert PoolNotApproved();
            if (binding.poolId != poolId) revert CanonicalLegMismatch();
            if (leg.tokenA != binding.tokenA || leg.tokenB != binding.tokenB) revert CanonicalLegMismatch();
            if (leg.adapter != binding.adapter) revert CanonicalLegMismatch();

            uint256 legBudget = strategyRegistry.legAmount(grossUsdc, i);
            budgetSum += legBudget;
            ClFivePoolDepositLib.validateLegSwapPlan(deps, leg, legBudget);
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
        UserTokenPull.pull(permit2, usdc, user, address(this), grossUsdc);

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            ClFivePoolDepositLib.executeDepositLeg(
                deps, strategyId, user, legs[i], strategyRegistry.legAmount(grossUsdc, i)
            );
        }

        _refundExcess(user, usdc, preUsdc);
        _assertBalanceRestored(usdc, preUsdc);

        emit StrategyDepositCompleted(strategyId, user, grossUsdc, executionNonce);
    }

    /// @notice Deposit-path circuit breakers: pause + depeg. Never called from exit paths.
    function _assertDepositLegSafety(bytes32 poolId, address tokenA, address tokenB) internal view {
        safetyController.assertDepositAllowed(poolId);
        safetyController.assertTokenNotDepegged(usdc);
        safetyController.assertTokenNotDepegged(tokenA);
        safetyController.assertTokenNotDepegged(tokenB);
    }

    function exitLeg(
        bytes32 strategyId,
        ClFivePoolExitLib.ExitLegParams calldata leg,
        uint256 executionNonce
    ) external nonReentrant onlyApprovedAdapter(leg.adapter) {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        ClFivePoolExitLib.exitLegInternal(
            _exitDeps(), strategyId, msg.sender, leg, executionNonce, false, msg.sender
        );
    }

    function exitAll(
        bytes32 strategyId,
        ClFivePoolExitLib.ExitLegParams[5] calldata legs,
        uint256 executionNonceBase
    ) external nonReentrant {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();

        ClFivePoolExitLib.ExitDeps memory deps = _exitDeps();
        for (uint256 i = 0; i < LEG_COUNT; i++) {
            ClFivePoolExitLib.ExitLegParams calldata leg = legs[i];
            if (leg.adapter == address(0)) continue;
            if (leg.legIndex != uint8(i)) revert LegIndexOutOfBounds();
            if (!leg.fullExit) revert InvalidAmount();
            encodeExitAllLegExecutionNonce(executionNonceBase, i);
            ClFivePoolExitLib.exitLegInternal(
                deps, strategyId, msg.sender, leg, executionNonceBase + i, false, msg.sender
            );
        }
    }

    /**
     * @notice Atomic exit that unwinds non-USDC proceeds to USDC, then pays the user USDC only.
     * @dev Each open leg may be fullExit (close+burn) or partial (decreaseLiquidityTo executor).
     *      Executes allowlisted reverse swaps (token → USDC), requires `minUsdcOut`, transfers USDC
     *      to the user, and reverts if any residual non-USDC remains.
     */
    function exitAllToUsdc(
        bytes32 strategyId,
        ClFivePoolExitLib.ExitLegParams[5] calldata legs,
        ClFivePoolExitLib.ExitUnwindSwap[8] calldata swaps,
        uint8 swapCount,
        uint256 minUsdcOut,
        uint256 executionNonceBase
    ) external nonReentrant returns (uint256 usdcOut) {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        return ClFivePoolExitLib.exitAllToUsdc(
            _exitDeps(), msg.sender, strategyId, legs, swaps, swapCount, minUsdcOut, executionNonceBase
        );
    }

    /// @notice Gateway-only atomic exit-to-USDC for `user` (adapters still require NPM approval of adapter or gateway ops path).
    function exitAllToUsdcFor(
        address user,
        bytes32 strategyId,
        ClFivePoolExitLib.ExitLegParams[5] calldata legs,
        ClFivePoolExitLib.ExitUnwindSwap[8] calldata swaps,
        uint8 swapCount,
        uint256 minUsdcOut,
        uint256 executionNonceBase
    ) external nonReentrant returns (uint256 usdcOut) {
        if (msg.sender != opsGateway || opsGateway == address(0) || user == address(0)) {
            revert Unauthorized();
        }
        if (strategyRegistry.getStrategy(strategyId).user != user) revert StrategyUserMismatch();
        return ClFivePoolExitLib.exitAllToUsdc(
            _exitDeps(), user, strategyId, legs, swaps, swapCount, minUsdcOut, executionNonceBase
        );
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

    function emergencyExitLeg(
        bytes32 strategyId,
        ClFivePoolExitLib.ExitLegParams calldata leg,
        uint256 executionNonce
    ) external nonReentrant onlyApprovedAdapter(leg.adapter) {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        if (!leg.fullExit) revert InvalidAmount();
        ClFivePoolExitLib.exitLegInternal(
            _exitDeps(), strategyId, msg.sender, leg, executionNonce, true, msg.sender
        );
    }

    function _depositDeps() private view returns (ClFivePoolDepositLib.DepositDeps memory) {
        return ClFivePoolDepositLib.DepositDeps({
            usdc: usdc,
            feeRouter: address(feeRouter),
            swapRouter: address(swapRouter),
            mevGuard: address(mevGuard),
            oracleGuard: address(oracleGuard),
            safetyController: address(safetyController)
        });
    }

    function _exitDeps() private view returns (ClFivePoolExitLib.ExitDeps memory) {
        return ClFivePoolExitLib.ExitDeps({
            usdc: usdc,
            strategyRegistry: address(strategyRegistry),
            swapRouter: address(swapRouter),
            mevGuard: address(mevGuard),
            oracleGuard: address(oracleGuard),
            safetyController: address(safetyController)
        });
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
}
