// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TickMath} from "../libraries/TickMath.sol";
import {LiquidityAmounts} from "../libraries/LiquidityAmounts.sol";

interface IClPoolTokens {
    function token0() external view returns (address);

    function token1() external view returns (address);
}

/// @title ClNpmPositionValue — live NPM liquidity → token amounts via pool.slot0.
/// @dev Reads only the first word of `slot0()` so Uniswap (7 fields) and Aerodrome Slipstream
///      (6 fields) both work without ABI mismatch.
library ClNpmPositionValue {
    error PositionValueUnavailable();
    error PoolTokenMismatch();

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
