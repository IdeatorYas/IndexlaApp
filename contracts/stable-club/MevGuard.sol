// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MevGuard — Step 2 MEV / impact / deadline checks (fail closed for swaps).
/// @notice Does not route privately by itself; enforces on-chain minima required by the Bible.
/// @dev Caller-supplied quotes are not trusted alone: minAmountOut must sit within the impact band
///      of the quote, and minAmountOut must clear the amountIn impact floor (1:1 value units).
contract MevGuard {
    address public owner;
    uint256 public maxPriceImpactBps = 150; // 1.5%
    bool public requirePrivateRelayFlag;
    bool public privateRelayAvailable = true;

    event OwnerTransferred(address indexed previous, address indexed next);
    event ConfigUpdated(uint256 maxPriceImpactBps, bool requirePrivateRelay);

    error Unauthorized();
    error DeadlineExpired();
    error PriceImpactTooHigh();
    error PrivateRelayUnavailable();
    error MinOutTooLow();
    error InvalidQuote();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address next) external onlyOwner {
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    function setConfig(uint256 maxPriceImpactBps_, bool requirePrivateRelay_) external onlyOwner {
        maxPriceImpactBps = maxPriceImpactBps_;
        requirePrivateRelayFlag = requirePrivateRelay_;
        emit ConfigUpdated(maxPriceImpactBps_, requirePrivateRelay_);
    }

    function setPrivateRelayAvailable(bool available) external onlyOwner {
        privateRelayAvailable = available;
    }

    function assertSwapProtections(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 quotedAmountOut,
        uint256 deadline
    ) external view {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (minAmountOut == 0) revert MinOutTooLow();
        if (quotedAmountOut == 0) revert InvalidQuote();
        if (quotedAmountOut < minAmountOut) revert MinOutTooLow();

        // Block minOut=1 bypass: minOut must be within max impact of the caller's own quote.
        if (minAmountOut * 10_000 < quotedAmountOut * (10_000 - maxPriceImpactBps)) {
            revert PriceImpactTooHigh();
        }

        // Independent floor vs amountIn (same value units as TestPool / mock 1:1 adapters).
        if (amountIn > 0) {
            uint256 floorFromIn = (amountIn * (10_000 - maxPriceImpactBps)) / 10_000;
            if (minAmountOut < floorFromIn) revert PriceImpactTooHigh();
            if (quotedAmountOut * 10_000 < amountIn * (10_000 - maxPriceImpactBps)) {
                revert PriceImpactTooHigh();
            }
        }

        if (requirePrivateRelayFlag && !privateRelayAvailable) revert PrivateRelayUnavailable();
    }
}
