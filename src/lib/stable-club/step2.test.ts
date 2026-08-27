import { describe, expect, it } from "vitest";
import {
  OFFICIAL_STABLE_CLUB_BASE_POOLS,
  assertTestPoolNotInOfficialCatalogue,
  isOfficialCataloguePoolId,
} from "@/lib/stable-club/official-pools";
import { STABLE_CLUB_TEST_POOL_ID } from "@/lib/stable-club/constants";
import {
  OpenServMonitor,
  buildHarvestProposal,
} from "@/lib/stable-club/openserv";
import { keccak256, stringToHex } from "viem";

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
});

describe("OpenServ monitor", () => {
  it("accepts typed harvest proposals and rejects duplicates", () => {
    const monitor = new OpenServMonitor();
    const key = keccak256(stringToHex("idem-1")) as `0x${string}`;
    const proposal = buildHarvestProposal({
      user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      permissionId: keccak256(stringToHex("perm")) as `0x${string}`,
      poolId: OFFICIAL_STABLE_CLUB_BASE_POOLS[0].poolIdHash,
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
      poolId: OFFICIAL_STABLE_CLUB_BASE_POOLS[0].poolIdHash,
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
