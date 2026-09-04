import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Stable Club automation wiring evidence", () => {
  it("AutomationPanel imports audited harvest and compound hooks", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/stable-club/StableClubAutomationPanel.tsx"),
      "utf8",
    );
    expect(src).toContain('from "@/components/stable-club/useStableClubHarvest"');
    expect(src).toContain('from "@/components/stable-club/useStableClubCompound"');
    expect(src).toContain("registerHarvestPermission");
    expect(src).toContain("registerCompoundPermission");
    expect(src).toContain("isLaunchAutomationEnabledForEnvironment");
    expect(src).not.toMatch(/Coming Soon/i);
  });

  it("audited harvest hook enforces permission and launch gates", () => {
    const harvestHook = readFileSync(
      join(process.cwd(), "src/components/stable-club/useStableClubHarvest.ts"),
      "utf8",
    );
    const harvestLib = readFileSync(
      join(process.cwd(), "src/lib/stable-club/harvest.ts"),
      "utf8",
    );
    const compoundHook = readFileSync(
      join(process.cwd(), "src/components/stable-club/useStableClubCompound.ts"),
      "utf8",
    );
    const compoundLib = readFileSync(
      join(process.cwd(), "src/lib/stable-club/compound.ts"),
      "utf8",
    );
    expect(harvestHook).toContain("buildHarvestOptInPermissionScope");
    expect(harvestHook).toContain("executeAuthorizedHarvest");
    expect(harvestLib).toContain("isLaunchAutomationEnabledForEnvironment");
    expect(compoundHook).toContain("COMPOUND_OPENSERV_CONNECTED");
    expect(compoundLib).toContain("isLaunchAutomationEnabledForEnvironment");
  });

  it("demo strategy cards cannot transact", () => {
    const card = readFileSync(
      join(process.cwd(), "src/components/stable-club/StableClubDemoStrategyCard.tsx"),
      "utf8",
    );
    expect(card).toContain("disabled");
    expect(card).toContain("Coming Soon");
    expect(card).not.toContain("useStableClubWallet");
    expect(card).not.toContain("useFivePoolDeposit");
    expect(card).not.toContain("useStableClubHarvest");
  });

  it("deposit panel still calls guarded depositIntoFivePoolStrategy", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/components/stable-club/StableClubFivePoolDepositPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("depositIntoFivePoolStrategy");
    expect(panel).toContain("failClosed");
    expect(panel).toContain("useStableClubWallet");
  });
});
