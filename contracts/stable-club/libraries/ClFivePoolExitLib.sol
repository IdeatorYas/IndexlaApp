// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PermissionRegistry} from "../PermissionRegistry.sol";
import {StrategyPermissionRegistry} from "../StrategyPermissionRegistry.sol";
import {StableClubSwapRouter} from "../StableClubSwapRouter.sol";
import {IStableClubSwapRouter} from "../interfaces/IStableClubSwapRouter.sol";
import {MevGuard} from "../MevGuard.sol";
import {IOracleGuard} from "../interfaces/IOracleGuard.sol";
import {IConcentratedLiquidityAdapter} from "../interfaces/IConcentratedLiquidityAdapter.sol";
import {SafetyController} from "../SafetyController.sol";

/// @dev Executor storage getters accessed via CALL while library runs under DELEGATECALL.
interface IClExecutorViews {
    function approvedTokens(address token) external view returns (bool);
    function poolAdapters(bytes32 poolId) external view returns (address);
}

/// @title ClFivePoolExitLib — external linked lib for CL exit / USDC-unwind paths.
/// @dev DELEGATECALL: address(this) is the executor. Pass immutables as params (not readable here).
library ClFivePoolExitLib {
    using SafeERC20 for IERC20;

    uint256 private constant LEG_COUNT = 5;
    uint256 private constant MAX_EXIT_UNWIND_SWAPS = 8;
    uint256 private constant EXIT_EXECUTION_NONCE_DOMAIN = uint256(1) << 255;

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
        bool fullExit;
    }

    struct ExitUnwindSwap {
        bytes32 routeId;
        uint256 amountIn;
        uint256 minOut;
        uint256 quotedOut;
        uint256 deadline;
    }

    /// @dev Immutable deps as addresses (ABI-safe). Cast inside helpers.
    struct ExitDeps {
        address usdc;
        address strategyRegistry;
        address swapRouter;
        address mevGuard;
        address oracleGuard;
        address safetyController;
    }

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

    error PoolNotApproved();
    error InvalidAmount();
    error FundsRemaining();
    error MinOutRequired();
    error LegIndexOutOfBounds();
    error StrategyUserMismatch();
    error TokenNotApproved();
    error InvalidExecutionNonce();
    error InvalidExitUnwindPlan();
    error ResidualNonUsdc();

    function encodeExitExecutionNonce(uint256 callerNonce) private pure returns (uint256) {
        if (callerNonce >= EXIT_EXECUTION_NONCE_DOMAIN) revert InvalidExecutionNonce();
        return EXIT_EXECUTION_NONCE_DOMAIN | callerNonce;
    }

    function encodeExitAllLegExecutionNonce(uint256 nonceBase, uint256 legIndex)
        private
        pure
        returns (uint256)
    {
        if (legIndex >= LEG_COUNT) revert LegIndexOutOfBounds();
        if (nonceBase > type(uint256).max - legIndex) revert InvalidExecutionNonce();
        return encodeExitExecutionNonce(nonceBase + legIndex);
    }

    /// @notice Full-leg exit used by exitLeg / exitAll / emergencyExitLeg / exitAllToUsdc.
    function exitLegInternal(
        ExitDeps calldata deps,
        bytes32 strategyId,
        address user,
        ExitLegParams calldata leg,
        uint256 executionNonce,
        bool emergency,
        address proceedsRecipient
    ) external {
        _exitLegInternal(deps, strategyId, user, leg, executionNonce, emergency, proceedsRecipient);
    }

    /// @notice Atomic five-leg exit + reverse swaps to USDC + residual check + user payout.
    function exitAllToUsdc(
        ExitDeps calldata deps,
        address user,
        bytes32 strategyId,
        ExitLegParams[5] calldata legs,
        ExitUnwindSwap[8] calldata swaps,
        uint8 swapCount,
        uint256 minUsdcOut,
        uint256 executionNonceBase
    ) external returns (uint256 usdcOut) {
        if (minUsdcOut == 0) revert MinOutRequired();
        if (swapCount > MAX_EXIT_UNWIND_SWAPS) revert InvalidExitUnwindPlan();

        uint256 preUsdc = IERC20(deps.usdc).balanceOf(address(this));

        address[10] memory tracked;
        uint256[10] memory preTracked;
        uint256 trackedCount;

        for (uint256 i = 0; i < LEG_COUNT; i++) {
            ExitLegParams calldata leg = legs[i];
            if (leg.adapter == address(0)) continue;
            if (leg.legIndex != uint8(i)) revert LegIndexOutOfBounds();
            if (!leg.fullExit && leg.liquidity == 0) revert InvalidAmount();
            encodeExitAllLegExecutionNonce(executionNonceBase, i);

            trackedCount = _trackToken(deps.usdc, tracked, preTracked, trackedCount, leg.tokenA);
            trackedCount = _trackToken(deps.usdc, tracked, preTracked, trackedCount, leg.tokenB);

            _exitLegInternal(
                deps, strategyId, user, leg, executionNonceBase + i, false, address(this)
            );
        }

        IStableClubSwapRouter swapRouter = IStableClubSwapRouter(deps.swapRouter);
        IOracleGuard oracleGuard = IOracleGuard(deps.oracleGuard);
        MevGuard mevGuard = MevGuard(deps.mevGuard);
        SafetyController safety = SafetyController(deps.safetyController);

        for (uint256 s = 0; s < swapCount; s++) {
            ExitUnwindSwap calldata swap = swaps[s];
            if (swap.amountIn == 0 || swap.minOut == 0 || swap.quotedOut == 0) revert MinOutRequired();
            if (swap.deadline < block.timestamp) revert InvalidExitUnwindPlan();

            StableClubSwapRouter.RouteConfig memory route = swapRouter.getRoute(swap.routeId);
            if (!route.enabled || route.tokenOut != deps.usdc || route.tokenIn == deps.usdc) {
                revert InvalidExitUnwindPlan();
            }
            if (!IClExecutorViews(address(this)).approvedTokens(route.tokenIn)) revert TokenNotApproved();

            uint256 preBal = 0;
            bool trackedToken = false;
            for (uint256 t = 0; t < trackedCount; t++) {
                if (tracked[t] == route.tokenIn) {
                    preBal = preTracked[t];
                    trackedToken = true;
                    break;
                }
            }
            if (!trackedToken) revert InvalidExitUnwindPlan();

            uint256 available = IERC20(route.tokenIn).balanceOf(address(this));
            if (available < preBal) revert InvalidAmount();
            uint256 delta = available - preBal;
            if (delta == 0) revert InvalidExitUnwindPlan();

            uint256 amountIn = delta;
            uint256 minOut = swap.minOut;
            uint256 quotedOut = swap.quotedOut;
            if (swap.amountIn > amountIn) {
                uint8 decimalsIn = IERC20Metadata(route.tokenIn).decimals();
                uint8 decimalsOut = IERC20Metadata(deps.usdc).decimals();
                quotedOut = oracleGuard.expectedAmountOut(
                    route.tokenIn, deps.usdc, amountIn, decimalsIn, decimalsOut
                );
                uint256 guardFloor = (quotedOut * 9_900) / 10_000;
                uint256 scaledCallerMin = (swap.minOut * amountIn) / swap.amountIn;
                minOut = scaledCallerMin > guardFloor ? scaledCallerMin : guardFloor;
            } else if (swap.amountIn < amountIn) {
                revert InvalidExitUnwindPlan();
            }
            if (minOut == 0 || quotedOut == 0) revert MinOutRequired();

            bytes32 poolIdHint = bytes32(0);
            for (uint256 i = 0; i < LEG_COUNT; i++) {
                if (legs[i].adapter == address(0)) continue;
                poolIdHint = IConcentratedLiquidityAdapter(legs[i].adapter).poolId();
                break;
            }
            if (poolIdHint != bytes32(0)) {
                safety.assertSwapAllowed(poolIdHint);
                safety.assertTokenNotDepegged(deps.usdc);
                safety.assertTokenNotDepegged(route.tokenIn);
            }
            oracleGuard.validatePrices(route.tokenIn, deps.usdc, 0);
            mevGuard.assertSwapProtections(
                route.tokenIn,
                deps.usdc,
                amountIn,
                minOut,
                quotedOut,
                100,
                swap.deadline
            );

            IERC20(route.tokenIn).forceApprove(deps.swapRouter, amountIn);
            swapRouter.executeExactInput(swap.routeId, amountIn, minOut, swap.deadline);
            _clearApproval(route.tokenIn, deps.swapRouter);
        }

        for (uint256 t = 0; t < trackedCount; t++) {
            address token = tracked[t];
            if (token == deps.usdc) continue;
            if (IERC20(token).balanceOf(address(this)) != preTracked[t]) revert ResidualNonUsdc();
        }

        uint256 postUsdc = IERC20(deps.usdc).balanceOf(address(this));
        if (postUsdc < preUsdc) revert InvalidAmount();
        usdcOut = postUsdc - preUsdc;
        if (usdcOut < minUsdcOut) revert MinOutRequired();

        IERC20(deps.usdc).safeTransfer(user, usdcOut);
        _assertBalanceRestored(deps.usdc, preUsdc);

        emit StrategyExitToUsdcCompleted(strategyId, user, usdcOut, executionNonceBase);
    }

    function _exitLegInternal(
        ExitDeps calldata deps,
        bytes32 strategyId,
        address user,
        ExitLegParams calldata leg,
        uint256 executionNonce,
        bool emergency,
        address proceedsRecipient
    ) private {
        bytes32 poolId = IConcentratedLiquidityAdapter(leg.adapter).poolId();
        if (IClExecutorViews(address(this)).poolAdapters(poolId) != leg.adapter) revert PoolNotApproved();
        if (IConcentratedLiquidityAdapter(leg.adapter).ownerOf(leg.positionTokenId) != user) {
            revert StrategyUserMismatch();
        }
        if (proceedsRecipient != user && proceedsRecipient != address(this)) {
            revert InvalidExitUnwindPlan();
        }
        if (leg.amountAMin == 0 && leg.amountBMin == 0) revert MinOutRequired();

        uint256 domainNonce = encodeExitExecutionNonce(executionNonce);
        StrategyPermissionRegistry strategyRegistry = StrategyPermissionRegistry(deps.strategyRegistry);

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
            IConcentratedLiquidityAdapter(leg.adapter).decreaseLiquidityTo(
                user,
                leg.positionTokenId,
                proceedsRecipient,
                leg.tokenA,
                leg.tokenB,
                leg.liquidity,
                leg.amountAMin,
                leg.amountBMin
            );
        }

        if (proceedsRecipient == user) {
            _refundExcess(user, leg.tokenA, preA);
            if (leg.tokenB != leg.tokenA) _refundExcess(user, leg.tokenB, preB);
            _assertBalanceRestored(leg.tokenA, preA);
            if (leg.tokenB != leg.tokenA) _assertBalanceRestored(leg.tokenB, preB);
        }

        emit StrategyLegExited(strategyId, leg.legIndex, poolId, leg.positionTokenId, emergency);
    }

    function _trackToken(
        address usdc,
        address[10] memory tracked,
        uint256[10] memory preTracked,
        uint256 trackedCount,
        address token
    ) private view returns (uint256) {
        if (token == address(0) || token == usdc) return trackedCount;
        for (uint256 i = 0; i < trackedCount; i++) {
            if (tracked[i] == token) return trackedCount;
        }
        if (trackedCount >= 10) revert InvalidExitUnwindPlan();
        tracked[trackedCount] = token;
        preTracked[trackedCount] = IERC20(token).balanceOf(address(this));
        return trackedCount + 1;
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
