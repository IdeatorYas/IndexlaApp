// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStableClubAdapter} from "../interfaces/IStableClubAdapter.sol";

/// @title ConfigurableTestPoolAdapter — TEST ONLY Step 1 adapter with constructor poolId.
/// @notice Used for pool-binding mismatch regressions (perm.poolId vs adapter.poolId).
contract ConfigurableTestPoolAdapter is IStableClubAdapter, ERC20 {
    using SafeERC20 for IERC20;

    bytes32 public immutable override poolId;
    address public immutable executor;

    error OnlyExecutor();
    error InsufficientLiquidity();
    error SlippageExceeded();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert OnlyExecutor();
        _;
    }

    constructor(address executor_, bytes32 poolId_) ERC20("INDEXLA Configurable Test LP", "idxLP-CFG") {
        executor = executor_;
        poolId = poolId_;
    }

    function swap(
        address,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external override onlyExecutor returns (uint256 amountOut) {
        amountOut = amountIn;
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
