import { describe, expect, it } from "vitest";
import {
  assertStage1OracleWirePlanReady,
  buildStage1OracleWirePlan,
} from "@/lib/stable-club/oracle-config";
import {
  BASE_ORACLE_FEEDS,
  CBBTC_BTC_PEG_MAX_DEVIATION_BPS,
  stage1OracleFeedsConfigured,
} from "@/lib/stable-club/verified-base-addresses";
import {
  assertPermissionUserAllowed,
  resolveAccountMode,
} from "@/lib/stable-club/safe-account";
import {
  codeFreezeBlockers,
  evaluateMainnetReadiness,
} from "@/lib/stable-club/production-guards";
import {
  buildPermit2ZeroAllowanceRevokeTx,
  describePermit2Allowance,
} from "@/lib/stable-club/permit2";

describe("Stage 1 oracle config", () => {
  it("wires USDC/USD primary, cbBTC/USD primary, BTC/USD peg reference", () => {
    const plan = buildStage1OracleWirePlan();
    expect(plan.ready).toBe(true);
    expect(plan.usdc.feed).toBe(BASE_ORACLE_FEEDS.usdcUsd.address);
    expect(plan.cbBtc.primaryFeed).toBe(BASE_ORACLE_FEEDS.cbBtcUsd.address);
    expect(plan.cbBtc.pegReferenceFeed).toBe(BASE_ORACLE_FEEDS.btcUsd.address);
    expect(plan.cbBtc.pegMaxDeviationBps).toBe(CBBTC_BTC_PEG_MAX_DEVIATION_BPS);
    expect(plan.cbBtc.primaryFeed).not.toBe(plan.cbBtc.pegReferenceFeed);
    expect(() => assertStage1OracleWirePlanReady(plan)).not.toThrow();
    expect(stage1OracleFeedsConfigured()).toBe(true);
  });
});

describe("Safe account mode", () => {
  it("forces Safe on mainnet and allows EOA only on local/testnet", () => {
    expect(
      resolveAccountMode({
        environment: "mainnet",
        preferSafe: false,
        connectedAddressIsContract: false,
      }),
    ).toBe("safe");
    expect(
      resolveAccountMode({
        environment: "local",
        preferSafe: false,
        connectedAddressIsContract: false,
      }),
    ).toBe("eoa-legacy");
    expect(() =>
      assertPermissionUserAllowed({
        environment: "mainnet",
        permissionUser: "0x1111111111111111111111111111111111111111",
        connectedAddress: "0x1111111111111111111111111111111111111111",
        permissionUserIsContract: false,
      }),
    ).toThrow(/Safe/);
  });
});

describe("Permit2 revoke + expiry labels", () => {
  it("describes revoked and expired allowances", () => {
    const now = 1_700_000_000;
    expect(describePermit2Allowance({ amount: BigInt(0), expiration: now + 10, nowSec: now }).status).toBe(
      "revoked",
    );
    expect(
      describePermit2Allowance({ amount: BigInt(10), expiration: now - 1, nowSec: now }).status,
    ).toBe("expired");
    const revoke = buildPermit2ZeroAllowanceRevokeTx({
      token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      spender: "0x1111111111111111111111111111111111111111",
      nowSec: now,
    });
    expect(revoke.args[2]).toBe(BigInt(0));
  });
});

describe("code-freeze readiness", () => {
  it("reports mainnet blockers while signers TBD", () => {
    const r = evaluateMainnetReadiness({
      environment: "mainnet",
      ownerIsTimelock: false,
      timelockDelaySeconds: 48 * 3600,
      governanceSafeAddress: null,
      multisigSignersConfigured: false,
      permit2Address: null,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
    expect(codeFreezeBlockers().some((b) => /gasCeilingWei TBD/.test(b))).toBe(true);
  });
});
