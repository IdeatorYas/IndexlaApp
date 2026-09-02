// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockShortDelayTimelock — TEST ONLY timelock with sub-policy getMinDelay.
/// @dev Exposes StableClubTimelock-compatible MIN_DELAY floor but reports a lower operational delay.
contract MockShortDelayTimelock {
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    uint256 public constant MIN_DELAY = 48 hours;
    uint256 private immutable _reportedDelay;
    address private immutable _safe;

    constructor(address safe_, uint256 reportedDelay_) {
        _safe = safe_;
        _reportedDelay = reportedDelay_;
    }

    function getMinDelay() external view returns (uint256) {
        return _reportedDelay;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        if (account != _safe) return false;
        return role == PROPOSER_ROLE || role == EXECUTOR_ROLE;
    }
}
