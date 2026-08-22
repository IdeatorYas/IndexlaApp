import { describe, expect, it } from "vitest";
import { getLeaderboardWorkspace } from "@/lib/fixtures/leaderboard";

describe("leaderboard fixtures", () => {
  it("ranks exactly 25 products with Top 10 winner zone", () => {
    const ws = getLeaderboardWorkspace();
    expect(ws.monthlyEntries).toHaveLength(25);
    expect(ws.allTimeEntries).toHaveLength(25);
    expect(ws.monthlyEntries.filter((e) => e.inWinnerZone)).toHaveLength(10);
    expect(ws.allTimeEntries.every((e) => !e.inWinnerZone)).toBe(true);
    expect(ws.rewards.monthlyBreakdowns).toHaveLength(10);
  });

  it("keeps USD and $DEXLA fields separate and ranks products not creators", () => {
    const ws = getLeaderboardWorkspace();
    const top = ws.monthlyEntries[0];
    expect(typeof top.aumUsd).toBe("number");
    expect(typeof top.tipsDexla).toBe("number");
    expect(top.portfolioId).toBeTruthy();
    expect(top.creatorHandle).toBeTruthy();

    const indexlaProducts = ws.monthlyEntries.filter((e) => e.isIndexlaProduct);
    const creatorProducts = ws.monthlyEntries.filter((e) => !e.isIndexlaProduct);
    expect(indexlaProducts.length).toBeGreaterThan(0);
    expect(creatorProducts.length).toBeGreaterThan(0);

    const quantdesk = ws.monthlyEntries.filter(
      (e) => e.creatorHandle === "quantdesk",
    );
    expect(quantdesk.length).toBeGreaterThan(1);
  });

  it("uses monthly-primary reward rules", () => {
    const ws = getLeaderboardWorkspace();
    expect(ws.rankingWeights).toEqual({
      performance: 50,
      aum: 25,
      volume: 15,
      tips: 10,
    });
    expect(ws.rewards.creatorSharePercent).toBe(50);
    expect(ws.rewards.investorSharePercent).toBe(50);
    expect(ws.rewards.investorWeightInvestedPercent).toBe(80);
    expect(ws.rewards.investorWeightTippedPercent).toBe(20);
    expect(ws.rewards.minHoldingDays).toBe(7);
  });
});
