import { describe, expect, it } from "vitest";
import {
  evaluateStableClubBetaReadiness,
  resolveStableClubDepositBlockers,
} from "@/lib/stable-club/stable-club-beta-readiness";
import { STAGE1_FIVE_POOL_BETA_POOL_IDS } from "@/lib/stable-club/stage1-launch";

describe("stable-club beta readiness", () => {
  it("fails closed on Base until all five pools are activated", () => {
    const partial = evaluateStableClubBetaReadiness({
      attestationPassed: true,
      isBaseProduction: true,
      activatedOnChainIds: [STAGE1_FIVE_POOL_BETA_POOL_IDS[0]!],
    });
    expect(partial.depositsEnabled).toBe(false);
    expect(partial.globalStatus).toBe("Ready for activation");
    expect(partial.missingActivationPoolIds).toHaveLength(4);
    expect(partial.depositBlockers.length).toBeGreaterThan(0);
  });

  it("lists exact blockers for manifest, attestation and missing pools", () => {
    const blockers = resolveStableClubDepositBlockers({
      attestationPassed: false,
      isBaseProduction: true,
      manifestTrusted: false,
      missingActivationPoolIds: ["USDC-cbBTC-UNI-005"],
    });
    expect(blockers).toContain("Trusted Base manifest not available");
    expect(blockers).toContain("Deployment attestation has not passed");
    expect(blockers.some((b) => b.includes("USDC-cbBTC-UNI-005"))).toBe(true);
  });

  it("enables deposits on local Hardhat when attestation passes and all pools registered", () => {
    const ready = evaluateStableClubBetaReadiness({
      attestationPassed: true,
      isBaseProduction: false,
      activatedOnChainIds: [...STAGE1_FIVE_POOL_BETA_POOL_IDS],
    });
    expect(ready.depositsEnabled).toBe(true);
    expect(ready.globalStatus).toBe("Live");
    expect(ready.depositBlockers).toHaveLength(0);
  });
});
