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
    address public owner;

    mapping(address => bool) public approvedAdapters;
    mapping(bytes32 => address) public poolAdapters;
    mapping(address => bool) public approvedTokens;

    event AdapterApproved(address indexed adapter, bool approved);
    event PoolRegistered(bytes32 indexed poolId, address indexed adapter, bool isTestPool);
    event TokenApproved(address indexed token, bool approved);
    event OwnerTransferred(address indexed previous, address indexed next);
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
    error Unauthorized();
    error TokenNotBound();
    error MinOutRequired();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyApprovedAdapter(address adapter) {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        _;
    }

    constructor(address permissionRegistry_, address feeRouter_) {
        permissionRegistry = PermissionRegistry(permissionRegistry_);
        feeRouter = FeeRouter(feeRouter_);
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

    function registerPool(bytes32 poolId, address adapter, bool isTestPool) external onlyOwner {
        if (!approvedAdapters[adapter]) revert AdapterNotApproved();
        if (IStableClubAdapter(adapter).poolId() != poolId) revert PoolMismatch();
        poolAdapters[poolId] = adapter;
        emit PoolRegistered(poolId, adapter, isTestPool);
    }

    function setTokenApproval(address token, bool approved) external onlyOwner {
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
        uint256 minAmountOut,
        uint256 minLpOut,
        uint256 slippageBps
    ) external nonReentrant onlyApprovedAdapter(adapter) {
        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(permissionId);
        if (perm.user != msg.sender) revert PermissionRegistry.UnauthorizedUser();
        _requireBoundPair(perm, tokenA, tokenB);
        _requireBoundToken(perm, stablecoin);

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();
        if (perm.poolId != poolId) revert PoolMismatch();
        _requireApprovedToken(stablecoin);
        _requireApprovedToken(tokenA);
        _requireApprovedToken(tokenB);

        if (swapAmount > depositAmount) revert InvalidAmount();
        if (swapAmount > 0 && minAmountOut == 0) revert MinOutRequired();

        permissionRegistry.validateExecution(
            permissionId,
            PermissionRegistry.Action.DepositAndAddLiquidity,
            depositAmount,
            slippageBps,
            executionNonce
        );

        address pairedToken = stablecoin == tokenA ? tokenB : tokenA;
        uint256 amountStable = depositAmount;
        uint256 amountPaired;

        if (swapAmount > 0) {
            amountStable = depositAmount - swapAmount;
            uint256 netSwap = feeRouter.applySwapFee(stablecoin, perm.user, swapAmount, permissionId);
            IERC20(stablecoin).forceApprove(adapter, netSwap);
            IStableClubAdapter(adapter).swap(perm.user, stablecoin, pairedToken, netSwap, minAmountOut);
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
        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(permissionId);
        if (perm.user != msg.sender) revert PermissionRegistry.UnauthorizedUser();
        _requireBoundPair(perm, tokenIn, tokenOut);

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();
        _requireApprovedToken(tokenIn);
        _requireApprovedToken(tokenOut);
        if (minAmountOut == 0) revert MinOutRequired();

        permissionRegistry.validateExecution(
            permissionId, PermissionRegistry.Action.Swap, grossAmount, slippageBps, executionNonce
        );

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
        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(permissionId);
        if (perm.user != msg.sender) revert PermissionRegistry.UnauthorizedUser();
        _requireBoundPair(perm, tokenA, tokenB);

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();
        if (minAmountA == 0 || minAmountB == 0) revert MinOutRequired();

        permissionRegistry.validateExecution(
            permissionId, PermissionRegistry.Action.RemoveLiquidity, lpAmount, slippageBps, executionNonce
        );

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
        PermissionRegistry.Permission memory perm = permissionRegistry.getPermission(permissionId);
        if (perm.user != msg.sender) revert PermissionRegistry.UnauthorizedUser();
        _requireBoundPair(perm, tokenA, tokenB);

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();
        if (minAmountA == 0 || minAmountB == 0) revert MinOutRequired();

        permissionRegistry.validateExecution(
            permissionId, PermissionRegistry.Action.WithdrawAll, lpAmount, slippageBps, executionNonce
        );

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
        _requireBoundPair(perm, tokenA, tokenB);

        bytes32 poolId = IStableClubAdapter(adapter).poolId();
        if (poolAdapters[poolId] != adapter) revert PoolNotApproved();

        permissionRegistry.validateEmergencyExecution(permissionId, executionNonce);

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

    function _requireBoundPair(
        PermissionRegistry.Permission memory perm,
        address tokenA,
        address tokenB
    ) internal pure {
        bool matchExact = tokenA == perm.tokenA && tokenB == perm.tokenB;
        bool matchSwap = tokenA == perm.tokenB && tokenB == perm.tokenA;
        if (!(matchExact || matchSwap)) revert TokenNotBound();
    }

    function _requireBoundToken(PermissionRegistry.Permission memory perm, address token) internal pure {
        if (token != perm.tokenA && token != perm.tokenB) revert TokenNotBound();
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
