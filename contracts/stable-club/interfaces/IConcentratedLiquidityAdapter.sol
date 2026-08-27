// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Step 2 concentrated-liquidity adapter surface (Uniswap V3 / Aerodrome Slipstream).
/// @dev LP position NFT must be owned by `lpOwner` after mint / remain owned by user after ops.
/// @dev amountA/amountB are always in caller tokenA/tokenB order (not raw token0/token1).
interface IConcentratedLiquidityAdapter {
    function poolId() external view returns (bytes32);

    function protocol() external view returns (string memory);

    /// @notice NFT manager that must receive per-token approval before harvest/compound/rebalance.
    function positionManager() external view returns (address);

    function mintPosition(
        address lpOwner,
        address tokenA,
        address tokenB,
        int24 tickLower,
        int24 tickUpper,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin
    ) external returns (uint256 tokenId, uint128 liquidity);

    function increaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin
    ) external returns (uint128 liquidity);

    function decreaseLiquidity(
        address lpOwner,
        uint256 tokenId,
        address tokenA,
        address tokenB,
        uint128 liquidity,
        uint256 amountAMin,
        uint256 amountBMin
    ) external returns (uint256 amountA, uint256 amountB);

    function collectFees(
        address lpOwner,
        uint256 tokenId
    ) external returns (uint256 amountA, uint256 amountB);

    function collectRewards(address lpOwner, uint256 tokenId) external returns (uint256 amount);

    function closePosition(
        address lpOwner,
        uint256 tokenId,
        address tokenA,
        address tokenB,
        uint256 amountAMin,
        uint256 amountBMin
    ) external returns (uint256 amountA, uint256 amountB);

    function swap(
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);

    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice Underlying pool tokens for an existing position NFT (order: token0, token1).
    function positionTokens(uint256 tokenId) external view returns (address token0, address token1);

    /// @notice Live token amounts in token0/token1 order from NPM liquidity + pool.slot0 (+ tokensOwed).
    /// @dev Must not use caller-supplied or stale locally tracked amounts. Reverts if value cannot be determined.
    function positionAmounts(uint256 tokenId) external view returns (uint256 amount0, uint256 amount1);
}
