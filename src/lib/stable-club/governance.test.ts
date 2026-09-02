import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_SCAFFOLDING,
  assertGovernanceSignersTbd,
  buildTimelockRoleArrays,
  STABLE_CLUB_TIMELOCK_SECONDS,
} from "@/lib/stable-club/governance";
import { MVP_GOVERNANCE_SAFE, MVP_SIGNERS } from "@/lib/stable-club/mvp-governance";
import {
  STAGE1_FIVE_POOL_BETA_POOL_IDS,
  buildStage1LaunchConfiguration,
  isStage1AllowedPoolId,
} from "@/lib/stable-club/stage1-launch";

describe("governance scaffolding", () => {
  it("encodes 2-of-3 MVP Safe signers and 48h timelock", () => {
    expect(GOVERNANCE_SCAFFOLDING.multisig.threshold).toBe(2);
    expect(GOVERNANCE_SCAFFOLDING.multisig.size).toBe(3);
    expect(GOVERNANCE_SCAFFOLDING.timelockMinDelaySeconds).toBe(STABLE_CLUB_TIMELOCK_SECONDS);
    expect(GOVERNANCE_SCAFFOLDING.multisig.signerAddresses).toEqual([...MVP_SIGNERS]);
    expect(GOVERNANCE_SCAFFOLDING.multisig.safeAddress).toBe(MVP_GOVERNANCE_SAFE);
    expect(() => assertGovernanceSignersTbd()).not.toThrow();
  });

  it("requires explicit role addresses for timelock wiring helpers", () => {
    expect(() => buildTimelockRoleArrays({})).toThrow(/supplied explicitly/);
    const roles = buildTimelockRoleArrays({
      proposer: MVP_GOVERNANCE_SAFE,
      executor: MVP_GOVERNANCE_SAFE,
      admin: MVP_GOVERNANCE_SAFE,
    });
    expect(roles.minDelay).toBe(48 * 3600);
    expect(roles.proposers).toEqual([MVP_GOVERNANCE_SAFE]);
  });
});

describe("Stage 1 launch configuration", () => {
  it("includes all five official pools with automation disabled", () => {
    const cfg = buildStage1LaunchConfiguration();
    expect(cfg.poolIds).toEqual([...STAGE1_FIVE_POOL_BETA_POOL_IDS]);
    expect(cfg.pools).toHaveLength(5);
    expect(cfg.automationDisabled).toBe(true);
    expect(cfg.params.automation.harvestEnabled).toBe(false);
    for (const id of STAGE1_FIVE_POOL_BETA_POOL_IDS) {
      expect(isStage1AllowedPoolId(id)).toBe(true);
    }
  });
});
