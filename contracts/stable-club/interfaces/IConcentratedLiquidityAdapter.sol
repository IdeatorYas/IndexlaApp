// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Step 2 concentrated-liquidity adapter surface (Uniswap V3 / Aerodrome Slipstream).
/// @dev LP position NFT must be owned by `lpOwner` after mint / remain owned by user after ops.
interface IConcentratedLiquidityAdapter {
    function poolId() external view returns (bytes32);

    function protocol() external view returns (string memory);

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
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin
    ) external returns (uint128 liquidity);

    function decreaseLiquidity(
        address lpOwner,
        uint256 tokenId,
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
}
