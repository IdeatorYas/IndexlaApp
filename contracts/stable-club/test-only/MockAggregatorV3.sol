// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockAggregatorV3 — TEST ONLY Chainlink-compatible feed.
contract MockAggregatorV3 {
    int256 public answer;
    uint256 public updatedAt;
    uint8 public decimals_ = 8;
    uint80 public roundId = 1;

    constructor(int256 initialAnswer) {
        answer = initialAnswer;
        updatedAt = block.timestamp;
    }

    function setAnswer(int256 next) external {
        answer = next;
        updatedAt = block.timestamp;
        roundId += 1;
    }

    function setUpdatedAt(uint256 ts) external {
        updatedAt = ts;
    }

    function decimals() external view returns (uint8) {
        return decimals_;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }
}
