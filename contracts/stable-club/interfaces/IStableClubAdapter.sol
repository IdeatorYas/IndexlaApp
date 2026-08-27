// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stable Club Step 1 — approved adapter surface (no arbitrary calls).
interface IStableClubAdapter {
    /// @dev Pool identifier registered with the Executor allowlist.
    function poolId() external view returns (bytes32);

    /// @dev Add liquidity; LP tokens must be minted/transferred to `lpOwner`.
    function addLiquidity(
        address lpOwner,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 minLpOut
    ) external returns (uint256 lpMinted);

    /// @dev Remove liquidity from `lpOwner` and return underlying to `lpOwner`.
    function removeLiquidity(
        address lpOwner,
        address tokenA,
        address tokenB,
        uint256 lpAmount,
        uint256 minAmountA,
        uint256 minAmountB
    ) external returns (uint256 amountA, uint256 amountB);

    /// @dev Swap `tokenIn` → `tokenOut` for `user`; returns net output after any external fee routing.
    function swap(
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);
}
