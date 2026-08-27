// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracleGuard} from "./interfaces/IOracleGuard.sol";

/// @title OracleGuard — Step 2 fail-closed price guard (Chainlink + configurable TWAP stub).
/// @notice Production feeds are configured per token; missing/stale/deviant prices block execution.
contract OracleGuard is IOracleGuard {
    struct Feed {
        address aggregator; // Chainlink-compatible AggregatorV3Interface
        uint256 maxStalenessSec;
        uint8 decimals;
        bool enabled;
    }

    address public owner;
    uint256 public defaultMaxDeviationBps = 200; // 2%

    mapping(address => Feed) public feeds;
    /// @dev Optional secondary TWAP price (1e8 scale) set by a trusted updater for tests / ops.
    mapping(address => uint256) public twapPriceE8;
    mapping(address => uint256) public twapUpdatedAt;
    uint256 public twapMaxAgeSec = 1 hours;

    event OwnerTransferred(address indexed previous, address indexed next);
    event FeedConfigured(address indexed token, address aggregator, uint256 maxStalenessSec);
    event TwapUpdated(address indexed token, uint256 priceE8, uint256 updatedAt);
    event MaxDeviationUpdated(uint256 bps);

    error Unauthorized();
    error FeedDisabled();
    error StaleFeed();
    error MissingFeed();
    error InvalidRound();
    error DeviationTooHigh();
    error StaleTwap();

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

    function setDefaultMaxDeviationBps(uint256 bps) external onlyOwner {
        require(bps <= 5_000, "bps");
        defaultMaxDeviationBps = bps;
        emit MaxDeviationUpdated(bps);
    }

    function configureFeed(
        address token,
        address aggregator,
        uint256 maxStalenessSec,
        uint8 decimals
    ) external onlyOwner {
        feeds[token] = Feed({
            aggregator: aggregator,
            maxStalenessSec: maxStalenessSec,
            decimals: decimals,
            enabled: aggregator != address(0)
        });
        emit FeedConfigured(token, aggregator, maxStalenessSec);
    }

    function setTwapPrice(address token, uint256 priceE8) external onlyOwner {
        twapPriceE8[token] = priceE8;
        twapUpdatedAt[token] = block.timestamp;
        emit TwapUpdated(token, priceE8, block.timestamp);
    }

    function isFeedFresh(address token) public view returns (bool) {
        Feed memory f = feeds[token];
        if (!f.enabled || f.aggregator == address(0)) return false;
        (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(f.aggregator).latestRoundData();
        if (answer <= 0) return false;
        if (block.timestamp > updatedAt + f.maxStalenessSec) return false;
        return true;
    }

    function validatePrices(
        address tokenA,
        address tokenB,
        uint256 maxDeviationBps
    ) external view returns (bool ok) {
        uint256 limit = maxDeviationBps == 0 ? defaultMaxDeviationBps : maxDeviationBps;
        _requireFreshReference(tokenA);
        _requireFreshReference(tokenB);
        _requireTwapOrSkip(tokenA, limit);
        _requireTwapOrSkip(tokenB, limit);
        return true;
    }

    function _requireFreshReference(address token) internal view {
        Feed memory f = feeds[token];
        if (!f.enabled) revert MissingFeed();
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = AggregatorV3Interface(f.aggregator).latestRoundData();
        if (answer <= 0) revert InvalidRound();
        if (answeredInRound < roundId) revert InvalidRound();
        if (block.timestamp > updatedAt + f.maxStalenessSec) revert StaleFeed();
    }

    function _requireTwapOrSkip(address token, uint256 maxDeviationBps) internal view {
        uint256 twap = twapPriceE8[token];
        if (twap == 0) return; // TWAP optional until configured
        if (block.timestamp > twapUpdatedAt[token] + twapMaxAgeSec) revert StaleTwap();

        Feed memory f = feeds[token];
        (, int256 answer, , , ) = AggregatorV3Interface(f.aggregator).latestRoundData();
        uint256 ref = uint256(answer);
        // Normalize Chainlink decimals to 1e8 for comparison when possible.
        if (f.decimals > 8) {
            ref = ref / (10 ** (f.decimals - 8));
        } else if (f.decimals < 8) {
            ref = ref * (10 ** (8 - f.decimals));
        }
        uint256 diff = ref > twap ? ref - twap : twap - ref;
        if (diff * 10_000 > ref * maxDeviationBps) revert DeviationTooHigh();
    }
}

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
