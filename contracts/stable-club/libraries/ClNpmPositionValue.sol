// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TickMath} from "../libraries/TickMath.sol";
import {LiquidityAmounts} from "../libraries/LiquidityAmounts.sol";

interface IClPoolTokens {
    function token0() external view returns (address);

    function token1() external view returns (address);
}

interface IUniswapV3FactoryLike {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IAerodromeClFactoryLike {
    function getPool(address tokenA, address tokenB, int24 tickSpacing) external view returns (address pool);
}

/// @title ClNpmPositionValue — live NPM liquidity → token amounts via pool.slot0.
/// @dev Reads only the first word of `slot0()` so Uniswap (7 fields) and Aerodrome Slipstream
///      (6 fields) both work without ABI mismatch. Callers must fail closed on pool identity.
library ClNpmPositionValue {
    error PositionValueUnavailable();
    error PoolTokenMismatch();
    error PoolIdentityMismatch();

    function amountsFromLiquidity(
        address pool,
        address token0,
        address token1,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    ) internal view returns (uint256 amount0, uint256 amount1) {
        if (pool == address(0) || token0 == address(0) || token1 == address(0)) {
            revert PositionValueUnavailable();
        }
        if (IClPoolTokens(pool).token0() != token0 || IClPoolTokens(pool).token1() != token1) {
            revert PoolTokenMismatch();
        }

        uint160 sqrtPriceX96 = _sqrtPriceX96(pool);
        if (sqrtPriceX96 == 0) revert PositionValueUnavailable();

        if (liquidity > 0) {
            (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
                sqrtPriceX96,
                TickMath.getSqrtRatioAtTick(tickLower),
                TickMath.getSqrtRatioAtTick(tickUpper),
                liquidity
            );
        }
        amount0 += tokensOwed0;
        amount1 += tokensOwed1;
    }

    /// @notice Uni V3: NFT fee + factory.getPool must match the adapter's exact pool.
    function requireUniPoolIdentity(
        address factory,
        address expectedPool,
        address token0,
        address token1,
        uint24 expectedFee,
        uint24 positionFee
    ) internal view {
        if (factory == address(0) || expectedPool == address(0)) revert PositionValueUnavailable();
        if (positionFee != expectedFee) revert PoolIdentityMismatch();
        if (IUniswapV3FactoryLike(factory).getPool(token0, token1, expectedFee) != expectedPool) {
            revert PoolIdentityMismatch();
        }
    }

    /// @notice Aerodrome: NFT tickSpacing + factory.getPool must match the adapter's exact pool.
    function requireAeroPoolIdentity(
        address factory,
        address expectedPool,
        address token0,
        address token1,
        int24 expectedTickSpacing,
        int24 positionTickSpacing
    ) internal view {
        if (factory == address(0) || expectedPool == address(0)) revert PositionValueUnavailable();
        if (positionTickSpacing != expectedTickSpacing) revert PoolIdentityMismatch();
        if (IAerodromeClFactoryLike(factory).getPool(token0, token1, expectedTickSpacing) != expectedPool) {
            revert PoolIdentityMismatch();
        }
    }

    function _sqrtPriceX96(address pool) private view returns (uint160 sqrtPriceX96) {
        (bool ok, bytes memory ret) = pool.staticcall(abi.encodeWithSignature("slot0()"));
        if (!ok || ret.length < 32) revert PositionValueUnavailable();
        uint256 word;
        assembly {
            word := mload(add(ret, 32))
        }
        sqrtPriceX96 = uint160(word);
    }
}
