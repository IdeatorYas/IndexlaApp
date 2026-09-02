// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISafetyController — Step 2 circuit breakers and pauses.
interface ISafetyController {
    function assertAutomationAllowed(bytes32 poolId) external view;

    function assertDepositAllowed(bytes32 poolId) external view;

    function assertSwapAllowed(bytes32 poolId) external view;

    function assertTokenNotDepegged(address token) external view;

    function isPausedGlobally() external view returns (bool);

    function isPoolPaused(bytes32 poolId) external view returns (bool);

    function isAutomationPaused(bytes32 poolId) external view returns (bool);
}
