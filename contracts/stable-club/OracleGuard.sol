// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracleGuard} from "./interfaces/IOracleGuard.sol";

/// @title OracleGuard — fail-closed Chainlink (+ optional TWAP) with peg-monitor support.
/// @notice Primary per-token feeds; optional secondary reference (e.g. cbBTC/USD vs BTC/USD) for depeg.
contract OracleGuard is IOracleGuard {
    struct Feed {
        address aggregator; // Chainlink-compatible AggregatorV3Interface
        uint256 maxStalenessSec;
        uint8 decimals;
        bool enabled;
    }

    /// @dev Secondary reference feed for wrapped/pegged assets (e.g. BTC/USD for cbBTC).
    struct PegMonitor {
        address referenceAggregator;
        uint256 maxDeviationBps;
        uint8 decimals;
        bool enabled;
    }

    address public owner;
    /// @notice Oracle-only deviation limit vs TWAP (not permission slippage).
    uint256 public defaultMaxDeviationBps = 100; // 1% — aligns with private-beta launch params
    bool public twapRequired;

    mapping(address => Feed) public feeds;
    mapping(address => PegMonitor) public pegMonitors;
    mapping(address => uint256) public twapPriceE8;
    mapping(address => uint256) public twapUpdatedAt;
    uint256 public twapMaxAgeSec = 1 hours;

    event OwnerTransferred(address indexed previous, address indexed next);
    event FeedConfigured(address indexed token, address aggregator, uint256 maxStalenessSec);
    event PegMonitorConfigured(
        address indexed token, address referenceAggregator, uint256 maxDeviationBps, bool enabled
    );
    event TwapUpdated(address indexed token, uint256 priceE8, uint256 updatedAt);
    event MaxDeviationUpdated(uint256 bps);
    event TwapRequiredUpdated(bool required);

    error Unauthorized();
    error FeedDisabled();
    error StaleFeed();
    error MissingFeed();
    error InvalidRound();
    error DeviationTooHigh();
    error StaleTwap();
    error TwapRequiredMissing();
    error InvalidAmount();
    error ZeroPrice();
    error PegDeviationTooHigh();
    error StalePegReference();
    error InvalidPegReference();

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

    function setDefaultMaxDeviationBps(uint256 bps) external onlyOwner {
        require(bps <= 5_000, "bps");
        defaultMaxDeviationBps = bps;
        emit MaxDeviationUpdated(bps);
    }

    function setTwapRequired(bool required) external onlyOwner {
        twapRequired = required;
        emit TwapRequiredUpdated(required);
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

    /// @notice Configure secondary reference (e.g. BTC/USD) to detect depeg vs primary (cbBTC/USD).
    function configurePegMonitor(
        address token,
        address referenceAggregator,
        uint256 maxDeviationBps,
        uint8 decimals,
        bool enabled
    ) external onlyOwner {
        require(maxDeviationBps <= 5_000, "bps");
        if (enabled && referenceAggregator == address(0)) revert InvalidPegReference();
        pegMonitors[token] = PegMonitor({
            referenceAggregator: referenceAggregator,
            maxDeviationBps: maxDeviationBps,
            decimals: decimals,
            enabled: enabled
        });
        emit PegMonitorConfigured(token, referenceAggregator, maxDeviationBps, enabled);
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

    function getPriceE8(address token) public view returns (uint256 priceE8) {
        Feed memory f = feeds[token];
        if (!f.enabled) revert MissingFeed();
        priceE8 = _readAggregatorE8(f.aggregator, f.decimals, f.maxStalenessSec);
    }

    /// @inheritdoc IOracleGuard
    function assertPegOk(address token) public view {
        PegMonitor memory m = pegMonitors[token];
        if (!m.enabled) return;

        uint256 primary = getPriceE8(token);
        // Peg reference uses the same staleness window as the primary token feed when configured.
        Feed memory f = feeds[token];
        uint256 maxStale = f.maxStalenessSec == 0 ? 1 hours : f.maxStalenessSec;
        uint256 referencePrice = _readAggregatorE8(m.referenceAggregator, m.decimals, maxStale);

        uint256 diff = primary > referencePrice ? primary - referencePrice : referencePrice - primary;
        if (diff * 10_000 > referencePrice * m.maxDeviationBps) revert PegDeviationTooHigh();
    }

    function expectedAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint8 decimalsIn,
        uint8 decimalsOut
    ) external view returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount();
        uint256 priceInE8 = getPriceE8(tokenIn);
        uint256 priceOutE8 = getPriceE8(tokenOut);

        amountOut = (amountIn * priceInE8 * (10 ** uint256(decimalsOut)))
            / (priceOutE8 * (10 ** uint256(decimalsIn)));
        if (amountOut == 0) revert InvalidAmount();
    }

    function validatePrices(
        address tokenA,
        address tokenB,
        uint256 maxDeviationBps
    ) external view returns (bool ok) {
        uint256 limit = maxDeviationBps == 0 ? defaultMaxDeviationBps : maxDeviationBps;
        _requireFreshReference(tokenA);
        _requireFreshReference(tokenB);
        assertPegOk(tokenA);
        assertPegOk(tokenB);
        _requireTwapOrSkip(tokenA, limit);
        _requireTwapOrSkip(tokenB, limit);
        return true;
    }

    function _requireFreshReference(address token) internal view {
        getPriceE8(token);
    }

    function _requireTwapOrSkip(address token, uint256 maxDeviationBps) internal view {
        uint256 twap = twapPriceE8[token];
        if (twap == 0) {
            if (twapRequired) revert TwapRequiredMissing();
            return;
        }
        if (block.timestamp > twapUpdatedAt[token] + twapMaxAgeSec) revert StaleTwap();

        uint256 ref = getPriceE8(token);
        uint256 diff = ref > twap ? ref - twap : twap - ref;
        if (diff * 10_000 > ref * maxDeviationBps) revert DeviationTooHigh();
    }

    function _readAggregatorE8(
        address aggregator,
        uint8 feedDecimals,
        uint256 maxStalenessSec
    ) internal view returns (uint256 priceE8) {
        if (aggregator == address(0)) revert InvalidPegReference();
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = AggregatorV3Interface(aggregator).latestRoundData();
        if (answer <= 0) revert InvalidRound();
        if (answeredInRound < roundId) revert InvalidRound();
        if (block.timestamp > updatedAt + maxStalenessSec) revert StaleFeed();

        uint256 raw = uint256(answer);
        if (feedDecimals > 8) {
            priceE8 = raw / (10 ** (feedDecimals - 8));
        } else if (feedDecimals < 8) {
            priceE8 = raw * (10 ** (8 - feedDecimals));
        } else {
            priceE8 = raw;
        }
        if (priceE8 == 0) revert ZeroPrice();
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
