// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title StableClubTimelock — 48h minimum delay for Stable Club governance ops.
/// @notice Multisig should hold PROPOSER / EXECUTOR / CANCELLER roles.
/// @dev Signer addresses are never baked into this contract. Pass them at deploy time only.
///      Core custody/security contracts stay immutable; this timelock becomes their `owner`.
///      MIN_DELAY is an immutable floor: updateDelay, schedule, and scheduleBatch cannot go below it.
contract StableClubTimelock is TimelockController {
    /// @dev 48 hours — founder-approved Step 3 governance delay floor (immutable).
    uint256 public constant MIN_DELAY = 48 hours;

    error DelayBelowMinimum(uint256 provided, uint256 minimum);

    constructor(
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(MIN_DELAY, proposers, executors, admin) {}

    /// @inheritdoc TimelockController
    function updateDelay(uint256 newDelay) public virtual override {
        _requireDelayAtLeastMinFloor(newDelay);
        super.updateDelay(newDelay);
    }

    /// @inheritdoc TimelockController
    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public virtual override onlyRole(PROPOSER_ROLE) {
        _requireDelayAtLeastMinFloor(delay);
        super.schedule(target, value, data, predecessor, salt, delay);
    }

    /// @inheritdoc TimelockController
    function scheduleBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public virtual override onlyRole(PROPOSER_ROLE) {
        _requireDelayAtLeastMinFloor(delay);
        super.scheduleBatch(targets, values, payloads, predecessor, salt, delay);
    }

    /// @notice Helper for scripts/tests: reject any delay below 48h.
    function enforceMinDelay(uint256 delay) external pure returns (uint256) {
        _requireDelayAtLeastMinFloor(delay);
        return delay;
    }

    function _requireDelayAtLeastMinFloor(uint256 delay) internal pure {
        if (delay < MIN_DELAY) revert DelayBelowMinimum(delay, MIN_DELAY);
    }
}
