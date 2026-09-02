// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockFakeTimelock — TEST ONLY contract with timelock interface but adjustable roles/delay.
contract MockFakeTimelock {
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    uint256 public constant MIN_DELAY = 48 hours;

    address public safe;
    uint256 public minDelay;
    bool public grantProposer;
    bool public grantExecutor;

    constructor(address safe_, uint256 minDelay_, bool grantProposer_, bool grantExecutor_) {
        safe = safe_;
        minDelay = minDelay_;
        grantProposer = grantProposer_;
        grantExecutor = grantExecutor_;
    }

    function getMinDelay() external view returns (uint256) {
        return minDelay;
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        if (account != safe) return false;
        if (role == PROPOSER_ROLE) return grantProposer;
        if (role == EXECUTOR_ROLE) return grantExecutor;
        return false;
    }
}
