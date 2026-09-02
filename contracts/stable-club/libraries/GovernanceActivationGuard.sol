// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOwnableLite {
    function owner() external view returns (address);
}

/// @dev StableClubTimelock surface used for activation preflight (48h policy + Safe roles).
interface IGovernanceTimelockLite {
    function MIN_DELAY() external view returns (uint256);
    function getMinDelay() external view returns (uint256);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function PROPOSER_ROLE() external view returns (bytes32);
    function EXECUTOR_ROLE() external view returns (bytes32);
}

/// @title GovernanceActivationGuard — on-chain fail-closed pool activation preflight.
library GovernanceActivationGuard {
    error GovernanceTimelockUnset();
    error GovernanceSafeUnset();
    error CallerNotGovernanceTimelock();
    error TimelockHasNoCode();
    error SafeHasNoCode();
    error TimelockDelayBelowPolicy();
    error SafeMissingProposerRole();
    error SafeMissingExecutorRole();
    error ZeroCriticalContract();
    error CriticalOwnerMismatch(address contractAddress);

    /// @notice Fail-closed one-time governance wiring; timelock must already own automation + step1 executor.
    function assertWireReady(
        address timelock,
        address automationOwner,
        address automationContract,
        address step1Executor
    ) internal view {
        if (timelock == address(0)) revert GovernanceTimelockUnset();
        if (msg.sender != timelock) revert CallerNotGovernanceTimelock();
        if (timelock.code.length == 0) revert TimelockHasNoCode();
        if (automationOwner != timelock) revert CriticalOwnerMismatch(automationContract);
        if (step1Executor == address(0)) revert ZeroCriticalContract();
        if (IOwnableLite(step1Executor).owner() != timelock) {
            revert CriticalOwnerMismatch(step1Executor);
        }
    }

    /// @notice Eight critical ownables: registry, feeRouter, executor, oracle, mev, safety, openServ, automation.
    function assertActivationReady(
        address timelock,
        address governanceSafe,
        address[8] memory criticalContracts
    ) internal view {
        if (timelock == address(0)) revert GovernanceTimelockUnset();
        if (governanceSafe == address(0)) revert GovernanceSafeUnset();
        if (msg.sender != timelock) revert CallerNotGovernanceTimelock();
        if (timelock.code.length == 0) revert TimelockHasNoCode();
        if (governanceSafe.code.length == 0) revert SafeHasNoCode();

        IGovernanceTimelockLite tl = IGovernanceTimelockLite(timelock);
        uint256 policyDelay = tl.MIN_DELAY();
        if (tl.getMinDelay() < policyDelay) revert TimelockDelayBelowPolicy();

        bytes32 proposerRole = tl.PROPOSER_ROLE();
        bytes32 executorRole = tl.EXECUTOR_ROLE();
        if (!tl.hasRole(proposerRole, governanceSafe)) revert SafeMissingProposerRole();
        if (!tl.hasRole(executorRole, governanceSafe)) revert SafeMissingExecutorRole();

        for (uint256 i = 0; i < criticalContracts.length; i++) {
            address critical = criticalContracts[i];
            if (critical == address(0)) revert ZeroCriticalContract();
            if (IOwnableLite(critical).owner() != timelock) {
                revert CriticalOwnerMismatch(critical);
            }
        }
    }
}
