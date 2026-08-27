// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PermissionRegistry} from "./PermissionRegistry.sol";
import {FeeRouter} from "./FeeRouter.sol";
import {IStableClubAdapter} from "./interfaces/IStableClubAdapter.sol";

/// @title StableClubExecutor — stateless operator; never retains user funds after execution.
/// @notice Step 1: approved pools, tokens, adapters and functions only.
contract StableClubExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    PermissionRegistry public immutable permissionRegistry;
    FeeRouter public immutable feeRouter;

    mapping(address => bool) public approvedAdapters;
    mapping(bytes32 => address) public poolAdapters;
    mapping(address => bool) public approvedTokens;

    event AdapterApproved(address indexed adapter, bool approved);
    event PoolRegistered(bytes32 indexed poolId, address indexed adapter, bool isTestPool);
    event TokenApproved(address indexed token, bool approved);
    event Executed(
        bytes32 indexed permissionId,
        PermissionRegistry.Action indexed action,
        bytes32 poolId,
        address indexed user,
        uint256 executionNonce
    );

    error AdapterNotApproved();
    error PoolNotApproved();
    error TokenNotApproved();
    error PoolMismatch();
    error InvalidAmount();
    error FundsRemaining();

    modifier onlyApprovedAdapter(address adapter) {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        _;
    }

    constructor(address permissionRegistry_, address feeRouter_) {
        permissionRegistry = PermissionRegistry(permissionRegistry_);
        feeRouter = FeeRouter(feeRouter_);
        PermissionRegistry(permissionRegistry_).wireOperator(address(this));
    }

    function setAdapterApproval(address adapter, bool approved) external {
        approvedAdapters[adapter] = approved;
        emit AdapterApproved(adapter, approved);
    }

    function registerPool(bytes32 poolId, address adapter, bool isTestPool) external {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        if (IStableClubAdapter(adapter).poolId() != poolId) revert PoolMismatch();
        poolAdapters[poolId] = adapter;
        emit PoolRegistered(poolId, adapter, isTestPool);
    }

    function setTokenApproval(address token, bool approved) external {
        approvedTokens[token] = approved;
        emit TokenApproved(token, approved);
    }

    function depositAndAddLiquidity(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        address stablecoin,
        address tokenA,
        address tokenB,
        uint256 depositAmount,
        uint256 swapAmount,
        uint256 minLpOut,
        uint256 slippageBps
    ) external nonReentrant onlyApprovedAdapter(adapter) {
        PermissionRegistry.Permission memory perm = _validate(
            PermissionRegistry.Action.DepositAndAddLiquidity,
            permissionId,
            executionNonce,
            depositAmount,
            slippageBps
        );

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();
        if (perm.poolId != poolId) revert PoolMismatch();
        _requireApprovedToken(stablecoin);
        _requireApprovedToken(tokenA);
        _requireApprovedToken(tokenB);

        if (swapAmount > depositAmount) revert InvalidAmount();

        address pairedToken = stablecoin == tokenA ? tokenB : tokenA;
        uint256 amountStable = depositAmount;
        uint256 amountPaired;

        if (swapAmount > 0) {
            amountStable = depositAmount - swapAmount;
            uint256 netSwap = feeRouter.applySwapFee(stablecoin, perm.user, swapAmount, permissionId);
            IERC20(stablecoin).forceApprove(adapter, netSwap);
            IStableClubAdapter(adapter).swap(perm.user, stablecoin, pairedToken, netSwap, 0);
            amountPaired = IERC20(pairedToken).balanceOf(address(this));
        }

        if (amountStable > 0) {
            IERC20(stablecoin).safeTransferFrom(perm.user, address(this), amountStable);
        }

        uint256 amountA = stablecoin == tokenA ? amountStable : amountPaired;
        uint256 amountB = stablecoin == tokenB ? amountStable : amountPaired;

        if (amountA > 0) IERC20(tokenA).forceApprove(adapter, amountA);
        if (amountB > 0) IERC20(tokenB).forceApprove(adapter, amountB);

        IStableClubAdapter(adapter).addLiquidity(perm.user, tokenA, tokenB, amountA, amountB, minLpOut);

        _assertZeroBalance(stablecoin);
        _assertZeroBalance(tokenA);
        _assertZeroBalance(tokenB);

        emit Executed(
            permissionId,
            PermissionRegistry.Action.DepositAndAddLiquidity,
            poolId,
            perm.user,
            executionNonce
        );
    }

    function swap(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        address tokenIn,
        address tokenOut,
        uint256 grossAmount,
        uint256 minAmountOut,
        uint256 slippageBps
    ) external nonReentrant onlyApprovedAdapter(adapter) {
        PermissionRegistry.Permission memory perm =
            _validate(PermissionRegistry.Action.Swap, permissionId, executionNonce, grossAmount, slippageBps);

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();
        _requireApprovedToken(tokenIn);
        _requireApprovedToken(tokenOut);

        uint256 netAmount = feeRouter.applySwapFee(tokenIn, perm.user, grossAmount, permissionId);
        IERC20(tokenIn).forceApprove(adapter, netAmount);
        IStableClubAdapter(adapter).swap(perm.user, tokenIn, tokenOut, netAmount, minAmountOut);

        _assertZeroBalance(tokenIn);
        _assertZeroBalance(tokenOut);

        emit Executed(permissionId, PermissionRegistry.Action.Swap, poolId, perm.user, executionNonce);
    }

    function removeLiquidity(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        address tokenA,
        address tokenB,
        uint256 lpAmount,
        uint256 minAmountA,
        uint256 minAmountB,
        uint256 slippageBps
    ) external nonReentrant onlyApprovedAdapter(adapter) {
        PermissionRegistry.Permission memory perm = _validate(
            PermissionRegistry.Action.RemoveLiquidity,
            permissionId,
            executionNonce,
            lpAmount,
            slippageBps
        );

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();

        _transferLpFromUser(perm.user, adapter, lpAmount);
        IStableClubAdapter(adapter).removeLiquidity(
            perm.user, tokenA, tokenB, lpAmount, minAmountA, minAmountB
        );

        _assertZeroBalance(tokenA);
        _assertZeroBalance(tokenB);

        emit Executed(
            permissionId,
            PermissionRegistry.Action.RemoveLiquidity,
            poolId,
            perm.user,
            executionNonce
        );
    }

    function withdrawAll(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        address tokenA,
        address tokenB,
        uint256 lpAmount,
        uint256 minAmountA,
        uint256 minAmountB,
        uint256 slippageBps
    ) external nonReentrant onlyApprovedAdapter(adapter) {
        PermissionRegistry.Permission memory perm = _validate(
            PermissionRegistry.Action.WithdrawAll,
            permissionId,
            executionNonce,
            lpAmount,
            slippageBps
        );

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();

        _transferLpFromUser(perm.user, adapter, lpAmount);
        IStableClubAdapter(adapter).removeLiquidity(
            perm.user, tokenA, tokenB, lpAmount, minAmountA, minAmountB
        );

        _assertZeroBalance(tokenA);
        _assertZeroBalance(tokenB);

        emit Executed(
            permissionId,
            PermissionRegistry.Action.WithdrawAll,
            poolId,
            perm.user,
            executionNonce
        );
    }

    function emergencyExit(
        bytes32 permissionId,
        uint256 executionNonce,
        address adapter,
        address tokenA,
        address tokenB,
        uint256 lpAmount,
        uint256 minAmountA,
        uint256 minAmountB
    ) external nonReentrant onlyApprovedAdapter(adapter) {
        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(permissionId);
        if (perm.user != msg.sender) revert PermissionRegistry.UnauthorizedUser();
        permissionRegistry.validateEmergencyExecution(permissionId, executionNonce);

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();

        _transferLpFromUser(perm.user, adapter, lpAmount);
        IStableClubAdapter(adapter).removeLiquidity(
            perm.user, tokenA, tokenB, lpAmount, minAmountA, minAmountB
        );

        _assertZeroBalance(tokenA);
        _assertZeroBalance(tokenB);

        emit Executed(
            permissionId,
            PermissionRegistry.Action.EmergencyExit,
            poolId,
            perm.user,
            executionNonce
        );
    }

    function revokePermission(bytes32 permissionId) external {
        if (permissionRegistry.getPermission(permissionId).user != msg.sender) {
            revert PermissionRegistry.UnauthorizedUser();
        }
        permissionRegistry.revokeByOperator(permissionId, msg.sender);
        emit Executed(
            permissionId,
            PermissionRegistry.Action.RevokePermission,
            bytes32(0),
            msg.sender,
            0
        );
    }

    function pauseAutomation(bytes32 permissionId) external {
        if (permissionRegistry.getPermission(permissionId).user != msg.sender) {
            revert PermissionRegistry.UnauthorizedUser();
        }
        permissionRegistry.pauseByOperator(permissionId, msg.sender);
        emit Executed(
            permissionId,
            PermissionRegistry.Action.PauseAutomation,
            bytes32(0),
            msg.sender,
            0
        );
    }

    function _validate(
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

    function _requireApprovedToken(address token) internal view {
        if (!approvedTokens[token]) revert TokenNotApproved();
    }

    function _transferLpFromUser(address user, address adapter, uint256 lpAmount) internal {
        IERC20(adapter).safeTransferFrom(user, adapter, lpAmount);
    }

    function _assertZeroBalance(address token) internal view {
        if (IERC20(token).balanceOf(address(this)) != 0) revert FundsRemaining();
    }
}
