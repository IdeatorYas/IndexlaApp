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
}
