import { describe, expect, it } from "vitest";
import {
  GOVERNANCE_SCAFFOLDING,
  assertGovernanceSignersTbd,
  buildTimelockRoleArrays,
  STABLE_CLUB_TIMELOCK_SECONDS,
} from "@/lib/stable-club/governance";
import { buildStage1LaunchConfiguration, isStage1AllowedPoolId } from "@/lib/stable-club/stage1-launch";

describe("governance scaffolding", () => {
  it("encodes 3-of-5 and 48h timelock without signer addresses", () => {
    expect(GOVERNANCE_SCAFFOLDING.multisig.threshold).toBe(3);
    expect(GOVERNANCE_SCAFFOLDING.multisig.size).toBe(5);
    expect(GOVERNANCE_SCAFFOLDING.timelockMinDelaySeconds).toBe(STABLE_CLUB_TIMELOCK_SECONDS);
    expect(GOVERNANCE_SCAFFOLDING.multisig.signerAddresses).toEqual([]);
    expect(() => assertGovernanceSignersTbd()).not.toThrow();
  });

  it("requires explicit role addresses for timelock wiring helpers", () => {
    expect(() => buildTimelockRoleArrays({})).toThrow(/supplied explicitly/);
    const roles = buildTimelockRoleArrays({
      proposer: "0x1111111111111111111111111111111111111111",
      executor: "0x2222222222222222222222222222222222222222",
      admin: "0x3333333333333333333333333333333333333333",
    });
    expect(roles.minDelay).toBe(48 * 3600);
    expect(roles.proposers).toHaveLength(1);
  });
});

describe("Stage 1 launch configuration", () => {
  it("includes only USDC-cbBTC-UNI-005 with automation disabled", () => {
    const cfg = buildStage1LaunchConfiguration();
    expect(cfg.poolIds).toEqual(["USDC-cbBTC-UNI-005"]);
    expect(cfg.automationDisabled).toBe(true);
    expect(cfg.params.automation.harvestEnabled).toBe(false);
    expect(cfg.deferredPoolIds).toContain("cbBTC-WETH-AERO-CL10");
    expect(cfg.unavailablePoolIds).toEqual([
      "USDC-cbBTC-AERO-CL100",
      "cbBTC-WETH-AERO-CL100",
    ]);
    expect(isStage1AllowedPoolId("USDC-cbBTC-UNI-005")).toBe(true);
    expect(isStage1AllowedPoolId("cbBTC-WETH-AERO-CL10")).toBe(false);
  });
});
