import { describe, expect, it } from "vitest";
import {
  AMOUNT_ZERO_VALIDATION_PATHS,
  isMetadataOnlyLimitField,
  OPERATION_PERMISSION_PATHS,
  PERMISSION_REGISTRY_LIMIT_FIELDS,
  POOL_LEG_BINDING_LIMIT_FIELDS,
  SC07_METADATA_ONLY_FIELDS,
  STRATEGY_PERMISSION_LIMIT_FIELDS,
} from "@/lib/stable-club/permission-limits";

describe("SC-07 permission limit inventory", () => {
  it("marks strategy allowedActions and maxLegPerDay as metadata-only", () => {
    expect(
      isMetadataOnlyLimitField(
        "StrategyPermissionRegistry.StrategyPermission",
        "allowedActions",
      ),
    ).toBe(true);
    expect(
      isMetadataOnlyLimitField("StrategyPermissionRegistry.PoolLegBinding", "maxLegPerDay"),
    ).toBe(true);
    expect(SC07_METADATA_ONLY_FIELDS).toHaveLength(2);
  });

  it("documents PermissionRegistry limits as on-chain enforced", () => {
    const enforced = PERMISSION_REGISTRY_LIMIT_FIELDS.filter(
      (f) => f.enforcement === "on-chain-enforced",
    );
    expect(enforced.map((f) => f.field)).toEqual([
      "allowedActions",
      "maxAmountPerTx",
      "maxAmountPerDay",
      "maxSlippageBps",
      "minTimeBetweenExecutions",
      "maxExecutionsPerDay",
      "expiresAt",
    ]);
    for (const field of enforced) {
      expect(field.authoritativePath).toMatch(/PermissionRegistry/);
    }
  });

  it("documents strategy deposit limits with authoritative paths", () => {
    const maxTotal = STRATEGY_PERMISSION_LIMIT_FIELDS.find((f) => f.field === "maxTotalPerTx");
    const maxLegTx = POOL_LEG_BINDING_LIMIT_FIELDS.find((f) => f.field === "maxLegPerTx");
    expect(maxTotal?.enforcement).toBe("on-chain-enforced");
    expect(maxLegTx?.enforcement).toBe("on-chain-enforced");
    expect(maxTotal?.authoritativePath).toContain("validateStrategyDeposit");
    expect(maxLegTx?.authoritativePath).toContain("validateStrategyLegDeposit");
  });

  it("does not classify enforced leg permission daily cap as metadata-only", () => {
    const legDaily = PERMISSION_REGISTRY_LIMIT_FIELDS.find((f) => f.field === "maxAmountPerDay");
    expect(legDaily?.enforcement).toBe("on-chain-enforced");
    expect(
      isMetadataOnlyLimitField("PermissionRegistry.Permission", "maxAmountPerDay"),
    ).toBe(false);
  });

  it("documents amount=0 validation paths for harvest and exit", () => {
    expect(AMOUNT_ZERO_VALIDATION_PATHS).toHaveLength(3);
    expect(AMOUNT_ZERO_VALIDATION_PATHS.join(" ")).toContain("_executeHarvest");
    expect(AMOUNT_ZERO_VALIDATION_PATHS.join(" ")).toContain("validateStrategyLegExit");
  });

  it("documents operation enforcement matrix for all six operations", () => {
    expect(OPERATION_PERMISSION_PATHS.map((p) => p.operation)).toEqual([
      "deposit",
      "exit",
      "harvest",
      "compound",
      "rebalance",
      "emergency",
    ]);
    const harvest = OPERATION_PERMISSION_PATHS.find((p) => p.operation === "harvest");
    expect(harvest?.enforced.perTxAmount).toBe(false);
    expect(harvest?.enforced.dailyAmount).toBe(false);
    expect(harvest?.enforced.slippage).toBe(false);
    const deposit = OPERATION_PERMISSION_PATHS.find((p) => p.operation === "deposit");
    expect(deposit?.enforced.perTxAmount).toBe(true);
    expect(deposit?.enforced.dailyAmount).toBe(true);
  });
});
