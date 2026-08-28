import { describe, expect, it } from "vitest";
import {
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  assertNoSilentCl100Remap,
  assertTestPoolNotInOfficialCatalogue,
  isOfficialCataloguePoolId,
  isPoolLaunchReady,
  listUnavailableOfficialPools,
} from "@/lib/stable-club/official-pools";
import { STABLE_CLUB_TEST_POOL_ID } from "@/lib/stable-club/constants";
import {
  OpenServMonitor,
  buildHarvestProposal,
} from "@/lib/stable-club/openserv";
import { STAGE1_PRIVATE_BETA_POOL_ID } from "@/lib/stable-club/stage1-launch";
import { keccak256, stringToHex } from "viem";

const STAGE1_POOL = OFFICIAL_STABLE_CLUB_BASE_POOLS.find(
  (p) => p.id === STAGE1_PRIVATE_BETA_POOL_ID,
)!;

describe("official Base pool catalogue", () => {
  it("contains exactly five approved pools", () => {
    expect(OFFICIAL_STABLE_CLUB_BASE_POOLS).toHaveLength(5);
  });

  it("excludes the private internal test pool", () => {
    expect(assertTestPoolNotInOfficialCatalogue()).toBe(true);
    expect(isOfficialCataloguePoolId(STABLE_CLUB_TEST_POOL_ID)).toBe(false);
  });

  it("covers Uniswap V3 and Aerodrome Slipstream", () => {
    const protocols = new Set(OFFICIAL_STABLE_CLUB_BASE_POOLS.map((p) => p.protocol));
    expect(protocols.has("uniswap-v3")).toBe(true);
    expect(protocols.has("aerodrome-slipstream")).toBe(true);
  });

  it("marks both Aero CL100 pools unavailable and never launch-ready", () => {
    const unavailable = listUnavailableOfficialPools();
    expect(unavailable.map((p) => p.id).sort()).toEqual([
      "USDC-cbBTC-AERO-CL100",
      "cbBTC-WETH-AERO-CL100",
    ]);
    for (const pool of unavailable) {
      expect(pool.poolAddress).toBeNull();
      expect(isPoolLaunchReady(pool)).toBe(false);
    }
  });

  it("refuses silent CL100 → CL10 remaps", () => {
    expect(() => assertNoSilentCl100Remap("USDC-cbBTC-AERO-CL100", 10)).toThrow(/silent remap/);
    expect(() => assertNoSilentCl100Remap("USDC-cbBTC-AERO-CL100", 100)).not.toThrow();
  });

  it("keeps Stage 1 UNI-005 launch-ready with factory address", () => {
    expect(STAGE1_POOL.availability).toBe("available");
    expect(isPoolLaunchReady(STAGE1_POOL)).toBe(true);
    expect(STAGE1_POOL.poolAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});

describe("OpenServ monitor", () => {
  it("accepts typed harvest proposals and rejects duplicates", () => {
    const monitor = new OpenServMonitor();
    const key = keccak256(stringToHex("idem-1")) as `0x${string}`;
    const proposal = buildHarvestProposal({
      user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      permissionId: keccak256(stringToHex("perm")) as `0x${string}`,
      poolId: STAGE1_POOL.poolIdHash,
      positionTokenId: "1",
      feesUsd: 20,
      gasUsd: 3,
      idempotencyKey: key,
    });
    expect(proposal).not.toBeNull();
    expect(monitor.submit(proposal!).ok).toBe(true);
    expect(monitor.submit(proposal!).ok).toBe(false);
  });

  it("does not propose harvest when fees do not cover gas", () => {
    const proposal = buildHarvestProposal({
      user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      permissionId: keccak256(stringToHex("perm")) as `0x${string}`,
      poolId: STAGE1_POOL.poolIdHash,
      positionTokenId: "1",
      feesUsd: 1,
      gasUsd: 5,
      idempotencyKey: keccak256(stringToHex("idem-2")) as `0x${string}`,
    });
    expect(proposal).toBeNull();
  });

  it("trips circuit after repeated failures", () => {
    const monitor = new OpenServMonitor(60, 3);
    monitor.markFailed();
    monitor.markFailed();
    expect(monitor.circuitBroken).toBe(false);
    monitor.markFailed();
    expect(monitor.circuitBroken).toBe(true);
  });
});
