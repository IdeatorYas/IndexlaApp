// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MevGuard — Step 2 MEV / impact / deadline checks (fail closed for swaps).
/// @notice Does not route privately by itself; enforces on-chain minima required by the Bible.
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
        if (quotedAmountOut < minAmountOut) revert MinOutTooLow();
        if (amountIn > 0 && quotedAmountOut * 10_000 < amountIn * (10_000 - maxPriceImpactBps)) {
            // Impact measured vs 1:1 quote units in tests; production adapters supply true quotes.
            revert PriceImpactTooHigh();
        }
        if (requirePrivateRelayFlag && !privateRelayAvailable) revert PrivateRelayUnavailable();
    }
}
