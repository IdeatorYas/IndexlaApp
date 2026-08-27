// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PermissionRegistry} from "./PermissionRegistry.sol";
import {FeeRouter} from "./FeeRouter.sol";
import {IConcentratedLiquidityAdapter} from "./interfaces/IConcentratedLiquidityAdapter.sol";
import {IOracleGuard} from "./interfaces/IOracleGuard.sol";
import {MevGuard} from "./MevGuard.sol";
import {SafetyController} from "./SafetyController.sol";

/// @title StableClubAutomationExecutor — Step 2 CL harvest / compound / rebalance operator.
/// @notice Stateless; never retains user funds or position NFTs after execution.
contract StableClubAutomationExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    PermissionRegistry public immutable permissionRegistry;
    FeeRouter public immutable feeRouter;
    IOracleGuard public immutable oracleGuard;
    SafetyController public immutable safetyController;
    MevGuard public immutable mevGuard;

    mapping(address => bool) public approvedAdapters;
    mapping(bytes32 => address) public poolAdapters;
    mapping(address => bool) public approvedTokens;
    mapping(bytes32 => bool) public officialPoolsActivated;

    event AdapterApproved(address indexed adapter, bool approved);
    event PoolRegistered(bytes32 indexed poolId, address indexed adapter, bool official);
    event OfficialPoolActivated(bytes32 indexed poolId);
    event TokenApproved(address indexed token, bool approved);
    event AutomationExecuted(
        bytes32 indexed permissionId,
        PermissionRegistry.Action indexed action,
        bytes32 poolId,
        address indexed user,
        uint256 positionTokenId,
        uint256 executionNonce
    );

    error AdapterNotApproved();
    error PoolNotApproved();
    error TokenNotApproved();
    error PoolMismatch();
    error FundsRemaining();
    error OfficialPoolNotActivated();
    error OracleRejected();
    error NotPositionOwner();

    constructor(
        address permissionRegistry_,
        address feeRouter_,
        address oracleGuard_,
        address safetyController_,
        address mevGuard_
    ) {
        permissionRegistry = PermissionRegistry(permissionRegistry_);
        feeRouter = FeeRouter(feeRouter_);
        oracleGuard = IOracleGuard(oracleGuard_);
        safetyController = SafetyController(safetyController_);
        mevGuard = MevGuard(mevGuard_);
    }

    function setAdapterApproval(address adapter, bool approved) external {
        approvedAdapters[adapter] = approved;
        emit AdapterApproved(adapter, approved);
    }

    function registerPool(bytes32 poolId, address adapter, bool official) external {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        if (IConcentratedLiquidityAdapter(adapter).poolId() != poolId) revert PoolMismatch();
        poolAdapters[poolId] = adapter;
        emit PoolRegistered(poolId, adapter, official);
    }

    function activateOfficialPool(bytes32 poolId) external {
        if (poolAdapters[poolId] == address(0)) revert PoolNotApproved();
        officialPoolsActivated[poolId] = true;
        emit OfficialPoolActivated(poolId);
    }

    function setTokenApproval(address token, bool approved) external {
        approvedTokens[token] = approved;
        emit TokenApproved(token, approved);
    }

    function harvest(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        uint256 positionTokenId
    ) external nonReentrant {
        PermissionRegistry.Permission memory perm = _validateAutomation(
            PermissionRegistry.Action.Harvest,
            permissionId,
            executionNonce,
            0,
            0
        );
        bytes32 poolId = _requirePoolAdapter(adapter, perm.poolId);
        safetyController.assertAutomationAllowed(poolId);
        safetyController.consumeAutomationSlot();

        if (IConcentratedLiquidityAdapter(adapter).ownerOf(positionTokenId) != perm.user) {
            revert NotPositionOwner();
        }

        IConcentratedLiquidityAdapter(adapter).collectFees(perm.user, positionTokenId);
        IConcentratedLiquidityAdapter(adapter).collectRewards(perm.user, positionTokenId);

        emit AutomationExecuted(
            permissionId,
            PermissionRegistry.Action.Harvest,
            poolId,
            perm.user,
            positionTokenId,
            executionNonce
        );
    }

    function compound(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        uint256 positionTokenId,
        address rewardToken,
        address tokenA,
        address tokenB,
        uint256 swapAmount,
        uint256 minAmountOut,
        uint256 amountA,
        uint256 amountB,
        uint256 slippageBps,
        uint256 deadline,
        uint256 quotedAmountOut
    ) external nonReentrant {
        PermissionRegistry.Permission memory perm = _validateAutomation(
            PermissionRegistry.Action.Compound,
            permissionId,
            executionNonce,
            amountA + amountB + swapAmount,
            slippageBps
        );
        bytes32 poolId = _requirePoolAdapter(adapter, perm.poolId);
        safetyController.assertAutomationAllowed(poolId);
        safetyController.consumeAutomationSlot();
        safetyController.assertTokenNotDepegged(tokenA);
        safetyController.assertTokenNotDepegged(tokenB);
        if (!oracleGuard.validatePrices(tokenA, tokenB, perm.maxSlippageBps)) revert OracleRejected();

        if (IConcentratedLiquidityAdapter(adapter).ownerOf(positionTokenId) != perm.user) {
            revert NotPositionOwner();
        }

        IConcentratedLiquidityAdapter(adapter).collectFees(perm.user, positionTokenId);
        IConcentratedLiquidityAdapter(adapter).collectRewards(perm.user, positionTokenId);

        if (swapAmount > 0) {
            safetyController.assertSwapAllowed(poolId);
            mevGuard.assertSwapProtections(swapAmount, minAmountOut, quotedAmountOut, deadline);
            _requireApprovedToken(rewardToken);
            uint256 net = feeRouter.applySwapFee(rewardToken, perm.user, swapAmount, permissionId);
            IERC20(rewardToken).forceApprove(adapter, net);
            IConcentratedLiquidityAdapter(adapter).swap(perm.user, rewardToken, tokenB, net, minAmountOut);
            _assertZeroBalance(rewardToken);
            _assertZeroBalance(tokenB);
        }

        if (amountA > 0 || amountB > 0) {
            _requireApprovedToken(tokenA);
            _requireApprovedToken(tokenB);
            if (amountA > 0) {
                IERC20(tokenA).safeTransferFrom(perm.user, address(this), amountA);
                IERC20(tokenA).forceApprove(adapter, amountA);
            }
            if (amountB > 0) {
                IERC20(tokenB).safeTransferFrom(perm.user, address(this), amountB);
                IERC20(tokenB).forceApprove(adapter, amountB);
            }
            IConcentratedLiquidityAdapter(adapter).increaseLiquidity(
                perm.user, positionTokenId, amountA, amountB, 0, 0
            );
            _assertZeroBalance(tokenA);
            _assertZeroBalance(tokenB);
        }

        emit AutomationExecuted(
            permissionId,
            PermissionRegistry.Action.Compound,
            poolId,
            perm.user,
            positionTokenId,
            executionNonce
        );
    }

    function rebalance(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        uint256 positionTokenId,
        address tokenA,
        address tokenB,
        int24 newTickLower,
        int24 newTickUpper,
        uint256 swapAmount,
        uint256 minAmountOut,
        uint256 slippageBps,
        uint256 deadline,
        uint256 quotedAmountOut
    ) external nonReentrant {
        PermissionRegistry.Permission memory perm = _validateAutomation(
            PermissionRegistry.Action.Rebalance,
            permissionId,
            executionNonce,
            swapAmount,
            slippageBps
        );
        bytes32 poolId = _requirePoolAdapter(adapter, perm.poolId);
        safetyController.assertAutomationAllowed(poolId);
        safetyController.consumeAutomationSlot();
        if (!oracleGuard.validatePrices(tokenA, tokenB, perm.maxSlippageBps)) revert OracleRejected();

        if (IConcentratedLiquidityAdapter(adapter).ownerOf(positionTokenId) != perm.user) {
            revert NotPositionOwner();
        }

        IConcentratedLiquidityAdapter(adapter).collectFees(perm.user, positionTokenId);
        (uint256 closedA, uint256 closedB) =
            IConcentratedLiquidityAdapter(adapter).closePosition(perm.user, positionTokenId, 0, 0);

        if (swapAmount > 0) {
            safetyController.assertSwapAllowed(poolId);
            mevGuard.assertSwapProtections(swapAmount, minAmountOut, quotedAmountOut, deadline);
            uint256 net = feeRouter.applySwapFee(tokenA, perm.user, swapAmount, permissionId);
            IERC20(tokenA).forceApprove(adapter, net);
            IConcentratedLiquidityAdapter(adapter).swap(perm.user, tokenA, tokenB, net, minAmountOut);
        }

        uint256 amountA = closedA > swapAmount ? closedA - swapAmount : 0;
        uint256 amountB = closedB;
        if (amountA > 0) {
            IERC20(tokenA).safeTransferFrom(perm.user, address(this), amountA);
            IERC20(tokenA).forceApprove(adapter, amountA);
        }
        if (amountB > 0) {
            IERC20(tokenB).safeTransferFrom(perm.user, address(this), amountB);
            IERC20(tokenB).forceApprove(adapter, amountB);
        }

        (uint256 newTokenId, ) = IConcentratedLiquidityAdapter(adapter).mintPosition(
            perm.user,
            tokenA,
            tokenB,
            newTickLower,
            newTickUpper,
            amountA,
            amountB,
            0,
            0
        );

        if (IConcentratedLiquidityAdapter(adapter).ownerOf(newTokenId) != perm.user) {
            revert NotPositionOwner();
        }

        _assertZeroBalance(tokenA);
        _assertZeroBalance(tokenB);

        emit AutomationExecuted(
            permissionId,
            PermissionRegistry.Action.Rebalance,
            poolId,
            perm.user,
            newTokenId,
            executionNonce
        );
    }

    function _validateAutomation(
        PermissionRegistry.Action action,
        bytes32 permissionId,
        uint256 executionNonce,
        uint256 amount,
        uint256 slippageBps
    ) internal returns (PermissionRegistry.Permission memory perm) {
        perm = permissionRegistry.getPermission(permissionId);
        if (perm.user != msg.sender) revert PermissionRegistry.UnauthorizedUser();
        permissionRegistry.validateExecution(permissionId, action, amount, slippageBps, executionNonce);
    }

    function _requirePoolAdapter(address adapter, bytes32 expectedPoolId) internal view returns (bytes32 poolId) {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        poolId = IConcentratedLiquidityAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();
        if (poolId != expectedPoolId) revert PoolMismatch();
        if (!officialPoolsActivated[poolId]) revert OfficialPoolNotActivated();
    }

    function _requireApprovedToken(address token) internal view {
        if (!approvedTokens[token]) revert TokenNotApproved();
    }

    function _assertZeroBalance(address token) internal view {
        if (IERC20(token).balanceOf(address(this)) != 0) revert FundsRemaining();
    }
}
