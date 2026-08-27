import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_SCAFFOLDING,
  assertGovernanceSignersTbd,
  buildTimelockRoleArrays,
  STABLE_CLUB_TIMELOCK_SECONDS,
} from "@/lib/stable-club/governance";
import {
  MVP_FEE_RECIPIENT,
  MVP_GOVERNANCE,
  MVP_GOVERNANCE_SAFE,
  MVP_SIGNERS,
  assertMvpGovernanceConfigured,
  assertNoPrivateKeyMaterial,
  buildMvpTimelockRoleArrays,
  canExecuteWithConfirmations,
} from "@/lib/stable-club/mvp-governance";
import { PRIVATE_BETA_LAUNCH_PARAMS, assertLaunchGovernanceIsMvp } from "@/lib/stable-club/launch-params";
import { assertProductionGovernanceReady } from "@/lib/stable-club/production-guards";

describe("MVP 2-of-3 governance config", () => {
  it("pins Safe, three signers, fee recipient and 48h timelock", () => {
    expect(() => assertMvpGovernanceConfigured()).not.toThrow();
    expect(() => assertGovernanceSignersTbd()).not.toThrow();
    expect(() => assertNoPrivateKeyMaterial(MVP_GOVERNANCE)).not.toThrow();
    expect(MVP_GOVERNANCE.multisig.threshold).toBe(2);
    expect(MVP_GOVERNANCE.multisig.size).toBe(3);
    expect(MVP_GOVERNANCE.multisig.safeAddress).toBe(MVP_GOVERNANCE_SAFE);
    expect(MVP_SIGNERS).toHaveLength(3);
    expect(MVP_FEE_RECIPIENT).toBe("0x9d269f7A3d3f781740081D35F086D68a4a21442D");
    expect(GOVERNANCE_SCAFFOLDING.roles.feeRecipientReceivesFeesOnly).toBe(true);
  });

  it("builds Timelock roles controlled by the Safe", () => {
    const roles = buildMvpTimelockRoleArrays();
    expect(roles.minDelay).toBe(STABLE_CLUB_TIMELOCK_SECONDS);
    expect(roles.proposers).toEqual([MVP_GOVERNANCE_SAFE]);
    expect(roles.executors).toEqual([MVP_GOVERNANCE_SAFE]);
    expect(roles.admin).toBe(MVP_GOVERNANCE_SAFE);
    expect(buildTimelockRoleArrays({
      proposer: MVP_GOVERNANCE_SAFE,
      executor: MVP_GOVERNANCE_SAFE,
      admin: MVP_GOVERNANCE_SAFE,
    }).proposers).toHaveLength(1);
  });

  it("threshold helper: one cannot execute, two can", () => {
    expect(canExecuteWithConfirmations({ threshold: 2, confirmations: 1 })).toBe(false);
    expect(canExecuteWithConfirmations({ threshold: 2, confirmations: 2 })).toBe(true);
  });

  it("rejects secret-looking keys", () => {
    expect(() => assertNoPrivateKeyMaterial({ privateKey: "0xabc" })).toThrow(/Forbidden/);
  });

  it("launch params are 2-of-3 with configured signers flag", () => {
    expect(PRIVATE_BETA_LAUNCH_PARAMS.governance.multisigThreshold).toBe(2);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.governance.multisigSize).toBe(3);
    expect(() => assertLaunchGovernanceIsMvp()).not.toThrow();
  });

  it("mainnet governance ready when Timelock owner wired to MVP Safe", () => {
    expect(() =>
      assertProductionGovernanceReady({
        environment: "mainnet",
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: "0x1111111111111111111111111111111111111111",
        ownerAddress: "0x1111111111111111111111111111111111111111",
      }),
    ).not.toThrow();
    expect(() =>
      assertProductionGovernanceReady({
        environment: "mainnet",
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: null,
        ownerAddress: null,
      }),
    ).toThrow(/Timelock address required/);
  });
});
