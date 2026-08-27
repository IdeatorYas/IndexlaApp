// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISafetyController} from "./interfaces/ISafetyController.sol";

/// @title SafetyController — Step 2 pauses + depeg / gas / rate-limit circuit breakers.
contract SafetyController is ISafetyController {
    address public owner;
    address public guardian;

    bool public globalPause;
    bool public newDepositPause;
    bool public automationGlobalPause;
    bool public swapGlobalPause;

    uint256 public maxGasPriceWei;
    uint256 public globalAutomationRateLimitPerMinute;
    uint256 public automationWindowStart;
    uint256 public automationWindowCount;

    mapping(bytes32 => bool) public poolPaused;
    mapping(bytes32 => bool) public poolAutomationPaused;
    mapping(bytes32 => bool) public poolDepositPaused;
    mapping(address => bool) public stablecoinDepegged;

    event OwnerTransferred(address indexed previous, address indexed next);
    event GuardianSet(address indexed guardian);
    event GlobalPause(bool paused);
    event PoolPause(bytes32 indexed poolId, bool paused);
    event AutomationPause(bytes32 indexed poolId, bool paused);
    event DepositPause(bytes32 indexed poolId, bool paused);
    event DepegFlag(address indexed token, bool depegged);
    event MaxGasPriceSet(uint256 weiPrice);
    event RateLimitSet(uint256 perMinute);

    error Unauthorized();
    error GloballyPaused();
    error PoolIsPaused();
    error AutomationPaused();
    error DepositsPaused();
    error SwapPaused();
    error DepegActive();
    error GasPriceTooHigh();
    error RateLimitExceeded();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyGuardianOrOwner() {
        if (msg.sender != owner && msg.sender != guardian) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
        guardian = msg.sender;
        maxGasPriceWei = 100 gwei;
        globalAutomationRateLimitPerMinute = 120;
    }

    function transferOwnership(address next) external onlyOwner {
        emit OwnerTransferred(owner, next);
        owner = next;
    }

    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    function setGlobalPause(bool paused) external onlyGuardianOrOwner {
        globalPause = paused;
        emit GlobalPause(paused);
    }

    function setNewDepositPause(bool paused) external onlyGuardianOrOwner {
        newDepositPause = paused;
    }

    function setAutomationGlobalPause(bool paused) external onlyGuardianOrOwner {
        automationGlobalPause = paused;
    }

    function setSwapGlobalPause(bool paused) external onlyGuardianOrOwner {
        swapGlobalPause = paused;
    }

    function setPoolPaused(bytes32 poolId, bool paused) external onlyGuardianOrOwner {
        poolPaused[poolId] = paused;
        emit PoolPause(poolId, paused);
    }

    function setPoolAutomationPaused(bytes32 poolId, bool paused) external onlyGuardianOrOwner {
        poolAutomationPaused[poolId] = paused;
        emit AutomationPause(poolId, paused);
    }

    function setPoolDepositPaused(bytes32 poolId, bool paused) external onlyGuardianOrOwner {
        poolDepositPaused[poolId] = paused;
        emit DepositPause(poolId, paused);
    }

    function setStablecoinDepegged(address token, bool depegged) external onlyGuardianOrOwner {
        stablecoinDepegged[token] = depegged;
        emit DepegFlag(token, depegged);
    }

    function setMaxGasPriceWei(uint256 weiPrice) external onlyOwner {
        maxGasPriceWei = weiPrice;
        emit MaxGasPriceSet(weiPrice);
    }

    function setGlobalAutomationRateLimitPerMinute(uint256 limit) external onlyOwner {
        globalAutomationRateLimitPerMinute = limit;
        emit RateLimitSet(limit);
    }

    function isPausedGlobally() external view returns (bool) {
        return globalPause;
    }

    function isPoolPaused(bytes32 poolId) external view returns (bool) {
        return poolPaused[poolId];
    }

    function isAutomationPaused(bytes32 poolId) external view returns (bool) {
        return automationGlobalPause || poolAutomationPaused[poolId];
    }

    function assertDepositAllowed(bytes32 poolId) external view {
        if (globalPause) revert GloballyPaused();
        if (newDepositPause) revert DepositsPaused();
        if (poolPaused[poolId] || poolDepositPaused[poolId]) revert PoolIsPaused();
        if (tx.gasprice > maxGasPriceWei) revert GasPriceTooHigh();
    }

    function assertSwapAllowed(bytes32 poolId) external view {
        if (globalPause) revert GloballyPaused();
        if (swapGlobalPause) revert SwapPaused();
        if (poolPaused[poolId]) revert PoolIsPaused();
        if (tx.gasprice > maxGasPriceWei) revert GasPriceTooHigh();
    }

    function assertAutomationAllowed(bytes32 poolId) external view {
        if (globalPause) revert GloballyPaused();
        if (automationGlobalPause || poolAutomationPaused[poolId]) revert AutomationPaused();
        if (poolPaused[poolId]) revert PoolIsPaused();
        if (tx.gasprice > maxGasPriceWei) revert GasPriceTooHigh();
    }

    function assertTokenNotDepegged(address token) external view {
        if (stablecoinDepegged[token]) revert DepegActive();
    }

    /// @notice Called by Executor before automation to enforce global rate limit.
    function consumeAutomationSlot() external onlyOwnerOrExecutor {
        if (block.timestamp >= automationWindowStart + 1 minutes) {
            automationWindowStart = block.timestamp;
            automationWindowCount = 0;
        }
        if (automationWindowCount + 1 > globalAutomationRateLimitPerMinute) {
            revert RateLimitExceeded();
        }
        automationWindowCount += 1;
    }

    address public executor;

    error ExecutorAlreadyWired();

    event ExecutorWired(address indexed executor);

    function wireExecutor(address executor_) external onlyOwner {
        if (executor != address(0) || executor_ == address(0)) revert ExecutorAlreadyWired();
        executor = executor_;
        emit ExecutorWired(executor_);
    }

    modifier onlyOwnerOrExecutor() {
        if (msg.sender != owner && msg.sender != executor) revert Unauthorized();
        _;
    }
}
