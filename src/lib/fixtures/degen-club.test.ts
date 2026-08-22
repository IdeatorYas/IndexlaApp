import { describe, expect, it } from "vitest";
import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";
import { getDegenClubWorkspace } from "@/lib/fixtures/degen-club";

describe("degen club fixtures", () => {
  it("provides illustrative memecoin products with extreme risk", () => {
    const ws = getDegenClubWorkspace();
    expect(ws.products.length).toBeGreaterThanOrEqual(6);
    expect(ws.products.every((p) => p.riskLabel === "Extreme")).toBe(true);
    expect(ws.products.every((p) => p.isIllustrative)).toBe(true);
    expect(ws.featuredIds.length).toBeGreaterThan(0);
    expect(ws.trendingIds.length).toBeGreaterThan(0);
  });

  it("exports canonical risk warning copy", () => {
    expect(DEGEN_RISK_WARNING).toContain("Extreme Risk");
    expect(DEGEN_RISK_WARNING).toContain("Diversification does not remove risk");
  });
});
