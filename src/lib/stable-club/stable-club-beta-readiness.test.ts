import { describe, expect, it } from "vitest";
import {
  evaluateStableClubBetaReadiness,
  resolveStableClubDepositBlockers,
  USDC_EXIT_REQUIRED_FOR_DEPOSIT_BLOCKER,
} from "@/lib/stable-club/stable-club-beta-readiness";
import { STAGE1_FIVE_POOL_BETA_POOL_IDS } from "@/lib/stable-club/stage1-launch";

describe("stable-club beta readiness", () => {
  it("fails closed on Base until all five pools are activated", () => {
    const partial = evaluateStableClubBetaReadiness({
      attestationPassed: true,
      isBaseProduction: true,
      activatedOnChainIds: [STAGE1_FIVE_POOL_BETA_POOL_IDS[0]!],
      exitAllToUsdcAvailable: true,
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
      exitAllToUsdcAvailable: false,
    });
    expect(blockers).toContain("Trusted Base manifest not available");
    expect(blockers).toContain("Deployment attestation has not passed");
    expect(blockers.some((b) => b.includes("USDC-cbBTC-UNI-005"))).toBe(true);
    expect(blockers).toContain(USDC_EXIT_REQUIRED_FOR_DEPOSIT_BLOCKER);
  });

  it("blocks deposits on Base when USDC exit is unavailable even if pools are live", () => {
    const blocked = evaluateStableClubBetaReadiness({
      attestationPassed: true,
      isBaseProduction: true,
      activatedOnChainIds: [...STAGE1_FIVE_POOL_BETA_POOL_IDS],
      exitAllToUsdcAvailable: false,
    });
    expect(blocked.depositsEnabled).toBe(false);
    expect(blocked.exitAllToUsdcAvailable).toBe(false);
    expect(blocked.depositBlockers).toContain(USDC_EXIT_REQUIRED_FOR_DEPOSIT_BLOCKER);
    expect(blocked.globalStatus).toBe("Ready for activation");
  });

  it("enables deposits on Base only when exitAllToUsdc is available", () => {
    const ready = evaluateStableClubBetaReadiness({
      attestationPassed: true,
      isBaseProduction: true,
      activatedOnChainIds: [...STAGE1_FIVE_POOL_BETA_POOL_IDS],
      exitAllToUsdcAvailable: true,
    });
    expect(ready.depositsEnabled).toBe(true);
    expect(ready.exitAllToUsdcAvailable).toBe(true);
    expect(ready.globalStatus).toBe("Live");
    expect(ready.depositBlockers).toHaveLength(0);
  });

  it("enables deposits on local Hardhat when attestation passes, pools registered, and exit available", () => {
    const ready = evaluateStableClubBetaReadiness({
      attestationPassed: true,
      isBaseProduction: false,
      activatedOnChainIds: [...STAGE1_FIVE_POOL_BETA_POOL_IDS],
      exitAllToUsdcAvailable: true,
    });
    expect(ready.depositsEnabled).toBe(true);
    expect(ready.globalStatus).toBe("Live");
    expect(ready.depositBlockers).toHaveLength(0);
  });

  it("defaults exitAllToUsdcAvailable to false (fail closed)", () => {
    const closed = evaluateStableClubBetaReadiness({
      attestationPassed: true,
      isBaseProduction: false,
      activatedOnChainIds: [...STAGE1_FIVE_POOL_BETA_POOL_IDS],
    });
    expect(closed.depositsEnabled).toBe(false);
    expect(closed.exitAllToUsdcAvailable).toBe(false);
  });
});
