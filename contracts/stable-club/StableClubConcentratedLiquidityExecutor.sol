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

/// @title StableClubConcentratedLiquidityExecutor — atomic USDC-only five-pool CL deposit/exit (Phase 2a).
/// @notice Stateless; mints position NFTs to the user. All five legs succeed or entire tx reverts.
contract StableClubConcentratedLiquidityExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant LEG_COUNT = 5;
    uint256 private constant MAX_SWAPS_PER_LEG = 2;

    PermissionRegistry public immutable permissionRegistry;
    StrategyPermissionRegistry public immutable strategyRegistry;
    FeeRouter public immutable feeRouter;
    IStableClubSwapRouter public immutable swapRouter;
    MevGuard public immutable mevGuard;
    IOracleGuard public immutable oracleGuard;

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
        uint128 liquidity;
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
        address usdc_
    ) {
        permissionRegistry = PermissionRegistry(permissionRegistry_);
        strategyRegistry = StrategyPermissionRegistry(strategyRegistry_);
        feeRouter = FeeRouter(feeRouter_);
        swapRouter = IStableClubSwapRouter(swapRouter_);
        mevGuard = MevGuard(mevGuard_);
        oracleGuard = IOracleGuard(oracleGuard_);
        usdc = usdc_;
        owner = msg.sender;
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

            strategyRegistry.validateStrategyLegDeposit(
                strategyId, i, leg.adapter, grossUsdc, leg.slippageBps, executionNonce * 10 + i
            );
        }
        if (budgetSum != grossUsdc) revert GrossDepositMismatch();

        strategyRegistry.validateStrategyDeposit(strategyId, grossUsdc, legs[0].slippageBps);

        UserTokenPull.pull(permit2, usdc, msg.sender, address(this), grossUsdc);

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            _executeDepositLeg(strategyId, msg.sender, legs[i], strategyRegistry.legAmount(grossUsdc, i));
        }

        _assertZeroBalance(usdc);

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

        _requireApprovedToken(leg.tokenA);
        _requireApprovedToken(leg.tokenB);

        uint256 amountA;
        uint256 amountB;

        if (leg.retainUsdc > 0) {
            (amountA, amountB) = _allocateUsdcToPair(leg.tokenA, leg.tokenB, leg.retainUsdc, amountA, amountB);
        }

        for (uint256 s = 0; s < leg.swapCount; s++) {
            SwapInstruction calldata swap = leg.swaps[s];
            StableClubSwapRouter.RouteConfig memory route = swapRouter.getRoute(swap.routeId);

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

        if (leg.tokenA != usdc) _assertZeroBalance(leg.tokenA);
        if (leg.tokenB != usdc) _assertZeroBalance(leg.tokenB);
        _clearApproval(leg.tokenA, leg.adapter);
        _clearApproval(leg.tokenB, leg.adapter);
    }

    function _exitLegInternal(
        bytes32 strategyId,
        address user,
        ExitLegParams calldata leg,
        uint256 executionNonce,
        bool emergency
    ) internal {
        if (leg.amountAMin == 0 || leg.amountBMin == 0) revert MinOutRequired();

        bytes32 poolId = IConcentratedLiquidityAdapter(leg.adapter).poolId();
        if (poolAdapters[poolId] != leg.adapter) revert PoolNotApproved();
        if (IConcentratedLiquidityAdapter(leg.adapter).ownerOf(leg.positionTokenId) != user) {
            revert StrategyUserMismatch();
        }

        if (emergency) {
            strategyRegistry.validateStrategyLegEmergency(strategyId, leg.legIndex, executionNonce);
        } else {
            // CL liquidity units are not USDC-denominated; do not feed them into USDC amount caps.
            // Action bit, slippage, nonce, and ownership gates still apply.
            strategyRegistry.validateStrategyLegExit(
                strategyId,
                leg.legIndex,
                leg.adapter,
                PermissionRegistry.Action.RemoveLiquidity,
                0,
                leg.slippageBps,
                executionNonce
            );
        }

        IConcentratedLiquidityAdapter(leg.adapter).decreaseLiquidity(
            user,
            leg.positionTokenId,
            leg.tokenA,
            leg.tokenB,
            leg.liquidity,
            leg.amountAMin,
            leg.amountBMin
        );

        _assertZeroBalance(leg.tokenA);
        _assertZeroBalance(leg.tokenB);

        emit StrategyLegExited(strategyId, leg.legIndex, poolId, leg.positionTokenId, emergency);
    }

    function exitLeg(
        bytes32 strategyId,
        ExitLegParams calldata leg,
        uint256 executionNonce
    ) external nonReentrant onlyApprovedAdapter(leg.adapter) {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        _exitLegInternal(strategyId, msg.sender, leg, executionNonce, false);
    }

    function exitAll(
        bytes32 strategyId,
        ExitLegParams[5] calldata legs,
        uint256 executionNonceBase
    ) external nonReentrant {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            ExitLegParams calldata leg = legs[i];
            if (leg.adapter == address(0) || leg.liquidity == 0) continue;
            if (leg.legIndex != uint8(i)) revert LegIndexOutOfBounds();
            _exitLegInternal(strategyId, msg.sender, leg, executionNonceBase + i, false);
        }
    }

    function emergencyExitLeg(
        bytes32 strategyId,
        ExitLegParams calldata leg,
        uint256 executionNonce
    ) external nonReentrant onlyApprovedAdapter(leg.adapter) {
        if (strategyRegistry.getStrategy(strategyId).user != msg.sender) revert StrategyUserMismatch();
        _exitLegInternal(strategyId, msg.sender, leg, executionNonce, true);
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

    function _assertZeroBalance(address token) internal view {
        if (IERC20(token).balanceOf(address(this)) != 0) revert FundsRemaining();
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
