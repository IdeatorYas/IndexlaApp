import { describe, expect, it } from "vitest";
import localPhase2a from "@/lib/stable-club/generated/local-phase2a-deployments.json";
import {
  PRIVATE_BETA_LAUNCH_PARAMS,
  isLaunchAutomationDisabled,
} from "@/lib/stable-club/launch-params";
import {
  isLaunchAutomationEnabledForEnvironment,
  launchAutomationDisabledReason,
} from "@/lib/stable-club/local-automation-policy";
import {
  assertCl100NotStage1Active,
  assertTruthfulActiveAdvertisement,
  describeLaunchAutomationPublicStatus,
  resolvePoolLaunchStatusById,
} from "@/lib/stable-club/pool-launch-status";
import {
  assertCatalogueIdentityConsistency,
  assertLocalHardhatManifestIsolation,
  assertManifestPoolIdsMatchCatalogue,
  assertPhase2aInfraBindingsMatchCatalogue,
  assertStage1ExcludesCl100,
  buildCanonicalPoolComparisonTable,
} from "@/lib/stable-club/pool-catalogue-consistency";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

describe("pool catalogue identity consistency", () => {
  it("builds five canonical Base rows at chainId 8453", () => {
    const rows = buildCanonicalPoolComparisonTable();
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.chainId).toBe(8453);
      expect(row.catalogueVerified).toBe(true);
      expect(row.poolAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }
  });

  it("asserts catalogue hashes, CL100 legacy bindings, and Stage 1 exclusions", () => {
    expect(() => assertCatalogueIdentityConsistency()).not.toThrow();
    expect(() => assertPhase2aInfraBindingsMatchCatalogue()).not.toThrow();
    expect(() => assertStage1ExcludesCl100()).not.toThrow();
  });

  it("matches local phase2a manifest poolIds to catalogue (Hardhat isolated)", () => {
    assertLocalHardhatManifestIsolation(localPhase2a);
    assertManifestPoolIdsMatchCatalogue(localPhase2a.poolIds as `0x${string}`[]);
    expect(localPhase2a.chainId).not.toBe(8453);
  });

  it("maps Stage 1 policy buckets correctly", () => {
    const rows = buildCanonicalPoolComparisonTable();
    expect(rows.find((r) => r.id === "USDC-cbBTC-UNI-005")?.stage1Policy).toBe(
      "activated-candidate",
    );
    expect(rows.filter((r) => r.stage1Policy === "excluded-cl100")).toHaveLength(2);
    expect(rows.filter((r) => r.stage1Policy === "deferred-stage2")).toHaveLength(2);
  });
});

describe("pool launch status labels (truthful UI/API)", () => {
  it("never advertises CL100 as Stage-1 active", () => {
    for (const id of ["USDC-cbBTC-AERO-CL100", "cbBTC-WETH-AERO-CL100"] as const) {
      const status = resolvePoolLaunchStatusById(id, {
        activatedOnChainIds: [id],
      });
      expect(status.canAdvertiseAsActive).toBe(false);
      expect(status.publicBadge).toMatch(/Excluded/);
      expect(() => assertCl100NotStage1Active([id])).toThrow(/CL100/);
    }
  });

  it("does not promote configured pools to Active without on-chain activation", () => {
    const status = resolvePoolLaunchStatusById("USDC-cbBTC-UNI-005");
    expect(status.publicBadge).not.toBe("Activated");
    expect(status.canAdvertiseAsActive).toBe(false);
    expect(() =>
      assertTruthfulActiveAdvertisement("USDC-cbBTC-UNI-005", { activatedOnChainIds: [] }),
    ).toThrow(/cannot be advertised as Active/);
  });

  it("allows Active only for Stage-1-eligible pool with on-chain activation proof", () => {
    const status = resolvePoolLaunchStatusById("USDC-cbBTC-UNI-005", {
      activatedOnChainIds: ["USDC-cbBTC-UNI-005"],
    });
    expect(status.canAdvertiseAsActive).toBe(true);
    expect(status.publicBadge).toBe("Activated");
    expect(() =>
      assertTruthfulActiveAdvertisement("USDC-cbBTC-UNI-005", {
        activatedOnChainIds: ["USDC-cbBTC-UNI-005"],
      }),
    ).not.toThrow();
  });

  it("marks deferred pools as Deferred (Stage 2), not Ready/Active", () => {
    for (const id of ["cbBTC-WETH-AERO-CL10", "cbBTC-WETH-UNI-005"] as const) {
      const status = resolvePoolLaunchStatusById(id);
      expect(status.publicBadge).toMatch(/Deferred/);
      expect(status.canAdvertiseAsActive).toBe(false);
    }
  });
});

describe("automation public status (disabled gates)", () => {
  it("keeps harvest/compound/rebalance disabled in launch params", () => {
    expect(isLaunchAutomationDisabled()).toBe(true);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.automation.harvestEnabled).toBe(false);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.automation.compoundEnabled).toBe(false);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.automation.rebalanceEnabled).toBe(false);
  });

  it("cannot advertise automation as running while launch flags are false", () => {
    for (const row of describeLaunchAutomationPublicStatus()) {
      expect(row.canAdvertiseAsRunning).toBe(false);
      expect(row.enabledByLaunchPolicy).toBe(false);
      expect(row.publicLabel).toMatch(/disabled/);
    }
  });

  it("fail-closes production automation without explicit local bypass", () => {
    for (const kind of ["harvest", "compound", "rebalance"] as const) {
      expect(isLaunchAutomationEnabledForEnvironment(kind, null)).toBe(false);
      expect(launchAutomationDisabledReason(kind)).toMatch(/disables/i);
    }
  });
});

describe("catalogue completeness", () => {
  it("lists every official pool id exactly once", () => {
    const ids = OFFICIAL_STABLE_CLUB_BASE_POOLS.map((p) => p.id);
    expect(new Set(ids).size).toBe(5);
  });
});
