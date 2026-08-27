// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IOracleGuard — Step 2 price validation (fail closed).
interface IOracleGuard {
    function validatePrices(
        address tokenA,
        address tokenB,
        uint256 maxDeviationBps
    ) external view returns (bool ok);

    function isFeedFresh(address token) external view returns (bool);

    /// @notice Fresh Chainlink reference price normalized to 1e8 USD scale.
    function getPriceE8(address token) external view returns (uint256 priceE8);

    /// @notice Fail-closed cbBTC/BTC (or similar) peg check when a peg monitor is configured.
    function assertPegOk(address token) external view;

    /// @notice Value-normalized expected swap output using oracle prices and token decimals.
    function expectedAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint8 decimalsIn,
        uint8 decimalsOut
    ) external view returns (uint256 amountOut);
}
