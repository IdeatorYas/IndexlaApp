// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title StableClubTimelock — 48h minimum delay for Stable Club governance ops.
/// @notice Multisig should hold PROPOSER / EXECUTOR / CANCELLER roles.
/// @dev Signer addresses are never baked into this contract. Pass them at deploy time only.
///      Core custody/security contracts stay immutable; this timelock becomes their `owner`.
contract StableClubTimelock is TimelockController {
    /// @dev 48 hours — founder-approved Step 3 governance delay.
    uint256 public constant MIN_DELAY = 48 hours;

    error DelayBelowMinimum(uint256 provided, uint256 minimum);

    constructor(
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(MIN_DELAY, proposers, executors, admin) {}

    /// @notice Helper for scripts/tests: reject any scheduled delay below 48h.
    function enforceMinDelay(uint256 delay) external pure returns (uint256) {
        if (delay < MIN_DELAY) revert DelayBelowMinimum(delay, MIN_DELAY);
        return delay;
    }
}
