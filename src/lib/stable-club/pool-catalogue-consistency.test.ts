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
  assertTruthfulActiveAdvertisement,
  describeLaunchAutomationPublicStatus,
  resolvePoolLaunchStatusById,
} from "@/lib/stable-club/pool-launch-status";
import {
  assertCatalogueIdentityConsistency,
  assertLocalHardhatManifestIsolation,
  assertManifestPoolIdsMatchCatalogue,
  assertPhase2aInfraBindingsMatchCatalogue,
  assertStage1IncludesAllFivePools,
  buildCanonicalPoolComparisonTable,
} from "@/lib/stable-club/pool-catalogue-consistency";
import { STAGE1_FIVE_POOL_BETA_POOL_IDS } from "@/lib/stable-club/stage1-launch";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

describe("pool catalogue identity consistency", () => {
  it("builds five canonical Base rows at chainId 8453", () => {
    const rows = buildCanonicalPoolComparisonTable();
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.chainId).toBe(8453);
      expect(row.catalogueVerified).toBe(true);
      expect(row.poolAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(row.stage1Policy).toBe("stage1-eligible");
    }
  });

  it("asserts catalogue hashes, CL100 legacy bindings, and Stage 1 five-pool inclusion", () => {
    expect(() => assertCatalogueIdentityConsistency()).not.toThrow();
    expect(() => assertPhase2aInfraBindingsMatchCatalogue()).not.toThrow();
    expect(() => assertStage1IncludesAllFivePools()).not.toThrow();
  });

  it("matches local phase2a manifest poolIds to catalogue (Hardhat isolated)", () => {
    assertLocalHardhatManifestIsolation(localPhase2a);
    assertManifestPoolIdsMatchCatalogue(localPhase2a.poolIds as `0x${string}`[]);
    expect(localPhase2a.chainId).not.toBe(8453);
  });

  it("maps all five pools as stage1-eligible", () => {
    const rows = buildCanonicalPoolComparisonTable();
    expect(rows.filter((r) => r.stage1Policy === "stage1-eligible")).toHaveLength(5);
    for (const id of STAGE1_FIVE_POOL_BETA_POOL_IDS) {
      expect(rows.find((r) => r.id === id)?.stage1Policy).toBe("stage1-eligible");
    }
  });
});

describe("pool launch status labels (truthful UI/API)", () => {
  it("allows Live for any Stage-1-eligible pool with trust + on-chain activation", () => {
    for (const id of STAGE1_FIVE_POOL_BETA_POOL_IDS) {
      const status = resolvePoolLaunchStatusById(id, {
        activatedOnChainIds: [id],
        executionTrusted: true,
      });
      expect(status.canAdvertiseAsActive).toBe(true);
      expect(status.publicBadge).toBe("Live");
      expect(() =>
        assertTruthfulActiveAdvertisement(id, {
          activatedOnChainIds: [id],
          executionTrusted: true,
        }),
      ).not.toThrow();
    }
  });

  it("does not promote configured pools to Live without on-chain activation", () => {
    const status = resolvePoolLaunchStatusById("USDC-cbBTC-UNI-005", {
      executionTrusted: true,
    });
    expect(status.publicBadge).not.toBe("Live");
    expect(status.canAdvertiseAsActive).toBe(false);
    expect(() =>
      assertTruthfulActiveAdvertisement("USDC-cbBTC-UNI-005", {
        activatedOnChainIds: [],
        executionTrusted: true,
      }),
    ).toThrow(/cannot be advertised as Live/);
  });

  it("shows Ready for activation before trusted attestation on Base", () => {
    const status = resolvePoolLaunchStatusById("cbBTC-WETH-AERO-CL10", {
      executionTrusted: false,
    });
    expect(status.publicBadge).toBe("Ready for activation");
    expect(status.canAdvertiseAsActive).toBe(false);
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
