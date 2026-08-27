// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStableClubAdapter} from "../interfaces/IStableClubAdapter.sol";

/// @title TestPoolAdapter — PRIVATE internal Base test pool (Step 1 only).
/// @notice TEST-ONLY — must not appear in the official five-pool catalogue.
/// @dev Fixed 1:1 swap rate for fork/local validation; LP ERC20 owned by user.
contract TestPoolAdapter is IStableClubAdapter, ERC20 {
    using SafeERC20 for IERC20;

    /// @dev Labelled test pool identifier — not an official production pool.
    bytes32 public constant POOL_ID =
        keccak256("INDEXLA_STABLE_CLUB_TEST_POOL_BASE_INTERNAL_V1");

    address public immutable executor;

    error OnlyExecutor();
    error InvalidPool();
    error InsufficientLiquidity();
    error SlippageExceeded();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert OnlyExecutor();
        _;
    }

    constructor(address executor_) ERC20("INDEXLA Test LP", "idxLP-TEST") {
        executor = executor_;
    }

    function poolId() external pure override returns (bytes32) {
        return POOL_ID;
    }

    function seedLiquidity(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    function swap(
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external override onlyExecutor returns (uint256 amountOut) {
        amountOut = amountIn; // 1:1 test rate
        if (amountOut < minAmountOut) revert SlippageExceeded();
        if (IERC20(tokenOut).balanceOf(address(this)) < amountOut) revert InsufficientLiquidity();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }

    function addLiquidity(
        address lpOwner,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 minLpOut
    ) external override onlyExecutor returns (uint256 lpMinted) {
        if (amountA > 0) IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        if (amountB > 0) IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);

        lpMinted = amountA + amountB;
        if (lpMinted < minLpOut) revert SlippageExceeded();
        _mint(lpOwner, lpMinted);
    }

    function removeLiquidity(
        address lpOwner,
        address tokenA,
        address tokenB,
        uint256 lpAmount,
        uint256 minAmountA,
        uint256 minAmountB
    ) external override onlyExecutor returns (uint256 amountA, uint256 amountB) {
        if (balanceOf(address(this)) < lpAmount) revert InsufficientLiquidity();
        _burn(address(this), lpAmount);
        amountA = lpAmount / 2;
        amountB = lpAmount - amountA;
        if (amountA < minAmountA || amountB < minAmountB) revert SlippageExceeded();

        if (amountA > 0) IERC20(tokenA).safeTransfer(lpOwner, amountA);
        if (amountB > 0) IERC20(tokenB).safeTransfer(lpOwner, amountB);
    }
}
