// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {FeeRouter} from "../FeeRouter.sol";
import {StableClubSwapRouter} from "../StableClubSwapRouter.sol";
import {IStableClubSwapRouter} from "../interfaces/IStableClubSwapRouter.sol";
import {MevGuard} from "../MevGuard.sol";
import {IOracleGuard} from "../interfaces/IOracleGuard.sol";
import {IConcentratedLiquidityAdapter} from "../interfaces/IConcentratedLiquidityAdapter.sol";
import {SafetyController} from "../SafetyController.sol";

import {IClExecutorViews} from "./ClFivePoolExitLib.sol";

/// @title ClFivePoolDepositLib — external linked lib for CL five-pool deposit legs.
/// @dev DELEGATECALL: address(this) is the executor. Pass immutables as params (not readable here).
library ClFivePoolDepositLib {
    using SafeERC20 for IERC20;

    uint256 private constant MAX_SWAPS_PER_LEG = 2;

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

    /// @dev Immutable deps as addresses (ABI-safe). Cast inside helpers.
    struct DepositDeps {
        address usdc;
        address feeRouter;
        address swapRouter;
        address mevGuard;
        address oracleGuard;
        address safetyController;
    }

    error FundsRemaining();
    error MinOutRequired();
    error TokenNotApproved();
    error InvalidLegConfiguration();
    error InvalidSwapPlan();
    error LegBudgetMismatch();

    function validateLegSwapPlan(
        DepositDeps calldata deps,
        DepositLegParams calldata leg,
        uint256 legBudget
    ) external view {
        _validateLegSwapPlan(deps, leg, legBudget);
    }

    function executeDepositLeg(
        DepositDeps calldata deps,
        bytes32 strategyId,
        address user,
        DepositLegParams calldata leg,
        uint256 legBudget
    ) external {
        _validateLegSwapPlan(deps, leg, legBudget);

        bytes32 poolId = IConcentratedLiquidityAdapter(leg.adapter).poolId();
        _assertDepositLegSafety(deps, poolId, leg.tokenA, leg.tokenB);

        _requireApprovedToken(leg.tokenA);
        _requireApprovedToken(leg.tokenB);

        uint256 preA = IERC20(leg.tokenA).balanceOf(address(this));
        uint256 preB = IERC20(leg.tokenB).balanceOf(address(this));

        uint256 amountA;
        uint256 amountB;

        if (leg.retainUsdc > 0) {
            (amountA, amountB) =
                _allocateUsdcToPair(deps.usdc, leg.tokenA, leg.tokenB, leg.retainUsdc, amountA, amountB);
        }

        IStableClubSwapRouter swapRouter = IStableClubSwapRouter(deps.swapRouter);
        FeeRouter feeRouter = FeeRouter(deps.feeRouter);
        MevGuard mevGuard = MevGuard(deps.mevGuard);
        IOracleGuard oracleGuard = IOracleGuard(deps.oracleGuard);

        for (uint256 s = 0; s < leg.swapCount; s++) {
            SwapInstruction calldata swap = leg.swaps[s];
            StableClubSwapRouter.RouteConfig memory route = swapRouter.getRoute(swap.routeId);

            _assertSwapSafety(deps, poolId, route.tokenOut);
            oracleGuard.validatePrices(deps.usdc, route.tokenOut, 0);

            IERC20(deps.usdc).forceApprove(deps.feeRouter, swap.grossUsdcIn);
            uint256 netUsdc = feeRouter.applySwapFeeOnHeld(deps.usdc, user, swap.grossUsdcIn, strategyId);
            _clearApproval(deps.usdc, deps.feeRouter);

            mevGuard.assertSwapProtections(
                deps.usdc,
                route.tokenOut,
                netUsdc,
                swap.minOut,
                swap.quotedOut,
                leg.slippageBps,
                swap.deadline
            );

            IERC20(deps.usdc).forceApprove(deps.swapRouter, netUsdc);
            uint256 outAmount = swapRouter.executeExactInput(swap.routeId, netUsdc, swap.minOut, swap.deadline);
            _clearApproval(deps.usdc, deps.swapRouter);

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
        if (leg.tokenA != deps.usdc) {
            _assertBalanceRestored(leg.tokenA, preA);
        }
        if (leg.tokenB != leg.tokenA && leg.tokenB != deps.usdc) {
            _assertBalanceRestored(leg.tokenB, preB);
        }
        _clearApproval(leg.tokenA, leg.adapter);
        _clearApproval(leg.tokenB, leg.adapter);
    }

    function _validateLegSwapPlan(
        DepositDeps calldata deps,
        DepositLegParams calldata leg,
        uint256 legBudget
    ) private view {
        if (leg.swapCount > MAX_SWAPS_PER_LEG) revert InvalidSwapPlan();
        if (leg.amountAMin == 0 && leg.amountBMin == 0) revert MinOutRequired();

        IStableClubSwapRouter swapRouter = IStableClubSwapRouter(deps.swapRouter);
        uint256 plannedUsdc = leg.retainUsdc;
        for (uint256 s = 0; s < leg.swapCount; s++) {
            SwapInstruction calldata swap = leg.swaps[s];
            if (swap.grossUsdcIn == 0 || swap.minOut == 0 || swap.quotedOut == 0) revert MinOutRequired();
            if (swap.deadline < block.timestamp) revert InvalidSwapPlan();

            StableClubSwapRouter.RouteConfig memory route = swapRouter.getRoute(swap.routeId);
            if (!route.enabled || route.tokenIn != deps.usdc) revert InvalidSwapPlan();
            if (!IClExecutorViews(address(this)).approvedTokens(route.tokenOut)) revert TokenNotApproved();

            plannedUsdc += swap.grossUsdcIn;
        }
        if (plannedUsdc != legBudget) revert LegBudgetMismatch();
    }

    function _assertDepositLegSafety(
        DepositDeps calldata deps,
        bytes32 poolId,
        address tokenA,
        address tokenB
    ) private view {
        SafetyController safety = SafetyController(deps.safetyController);
        safety.assertDepositAllowed(poolId);
        safety.assertTokenNotDepegged(deps.usdc);
        safety.assertTokenNotDepegged(tokenA);
        safety.assertTokenNotDepegged(tokenB);
    }

    function _assertSwapSafety(DepositDeps calldata deps, bytes32 poolId, address tokenOut)
        private
        view
    {
        SafetyController safety = SafetyController(deps.safetyController);
        safety.assertSwapAllowed(poolId);
        safety.assertTokenNotDepegged(deps.usdc);
        safety.assertTokenNotDepegged(tokenOut);
    }

    function _allocateUsdcToPair(
        address usdc,
        address tokenA,
        address tokenB,
        uint256 usdcAmount,
        uint256 amountA,
        uint256 amountB
    ) private pure returns (uint256 newA, uint256 newB) {
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
    ) private pure returns (uint256 newA, uint256 newB) {
        newA = amountA;
        newB = amountB;
        if (tokenA == token) newA += tokenAmount;
        else if (tokenB == token) newB += tokenAmount;
        else revert InvalidLegConfiguration();
    }

    function _requireApprovedToken(address token) private view {
        if (token == address(0) || !IClExecutorViews(address(this)).approvedTokens(token)) {
            revert TokenNotApproved();
        }
    }

    function _refundExcess(address user, address token, uint256 preBalance) private {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > preBalance) {
            IERC20(token).safeTransfer(user, bal - preBalance);
        }
    }

    function _assertBalanceRestored(address token, uint256 preBalance) private view {
        if (IERC20(token).balanceOf(address(this)) != preBalance) revert FundsRemaining();
    }

    function _clearApproval(address token, address spender) private {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            IERC20(token).forceApprove(spender, 0);
        }
    }
}
