// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {IOracleGuard} from "./interfaces/IOracleGuard.sol";

/// @title MevGuard — Step 2 MEV / impact / deadline checks (fail closed for swaps).
/// @notice Enforces minOut against oracle-priced expected output (value-normalized across decimals).
/// @dev Caller quotes are cross-checked against the oracle; raw amountIn≈amountOut comparison is not used.
contract MevGuard {
    address public owner;
    IOracleGuard public oracle;
    uint256 public maxPriceImpactBps = 150; // 1.5% vs oracle / quote band
    bool public requirePrivateRelayFlag;
    bool public privateRelayAvailable = true;

    event OwnerTransferred(address indexed previous, address indexed next);
    event OracleUpdated(address indexed oracle);
    event ConfigUpdated(uint256 maxPriceImpactBps, bool requirePrivateRelay);

    error Unauthorized();
    error DeadlineExpired();
    error PriceImpactTooHigh();
    error PrivateRelayUnavailable();
    error MinOutTooLow();
    error InvalidQuote();
    error OracleNotSet();
    error ExcessiveSlippage();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert Unauthorized();
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    function setOracle(address oracle_) external onlyOwner {
        if (oracle_ == address(0)) revert OracleNotSet();
        oracle = IOracleGuard(oracle_);
        emit OracleUpdated(oracle_);
    }

    function setConfig(uint256 maxPriceImpactBps_, bool requirePrivateRelay_) external onlyOwner {
        maxPriceImpactBps = maxPriceImpactBps_;
        requirePrivateRelayFlag = requirePrivateRelay_;
        emit ConfigUpdated(maxPriceImpactBps_, requirePrivateRelay_);
    }

    function setPrivateRelayAvailable(bool available) external onlyOwner {
        privateRelayAvailable = available;
    }

    /// @notice Fail-closed swap protection using oracle expectedOut (handles unequal decimals/prices).
    /// @param slippageBps Caller/permission slippage bound applied to oracle expectedOut for minOut floor.
    function assertSwapProtections(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 quotedAmountOut,
        uint256 slippageBps,
        uint256 deadline
    ) external view {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (address(oracle) == address(0)) revert OracleNotSet();
        if (minAmountOut == 0) revert MinOutTooLow();
        if (quotedAmountOut == 0 || amountIn == 0) revert InvalidQuote();
        if (slippageBps > 5_000) revert ExcessiveSlippage();

        uint8 decimalsIn = IERC20Metadata(tokenIn).decimals();
        uint8 decimalsOut = IERC20Metadata(tokenOut).decimals();
        uint256 expectedOut =
            oracle.expectedAmountOut(tokenIn, tokenOut, amountIn, decimalsIn, decimalsOut);

        // minOut must respect permission/configured slippage vs oracle expectedOut.
        uint256 slipFloor = (expectedOut * (10_000 - slippageBps)) / 10_000;
        if (minAmountOut < slipFloor) revert ExcessiveSlippage();

        // Impact band vs oracle (independent of keeper quote).
        uint256 impactFloor = (expectedOut * (10_000 - maxPriceImpactBps)) / 10_000;
        uint256 impactCeil = (expectedOut * (10_000 + maxPriceImpactBps)) / 10_000;
        if (minAmountOut < impactFloor) revert PriceImpactTooHigh();

        // Keeper quote must stay within oracle impact band (blocks manipulated quotes).
        if (quotedAmountOut < impactFloor) revert PriceImpactTooHigh();
        if (quotedAmountOut > impactCeil) revert InvalidQuote();

        if (quotedAmountOut < minAmountOut) revert MinOutTooLow();

        // minOut cannot sit far below the (already oracle-checked) quote.
        if (minAmountOut * 10_000 < quotedAmountOut * (10_000 - maxPriceImpactBps)) {
            revert PriceImpactTooHigh();
        }

        if (requirePrivateRelayFlag && !privateRelayAvailable) revert PrivateRelayUnavailable();
    }
}
