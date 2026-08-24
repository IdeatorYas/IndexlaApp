import { describe, expect, it } from "vitest";
import { DEGEN_RISK_WARNING } from "@/lib/domain/degen-club";
import { getDegenClubWorkspace } from "@/lib/fixtures/degen-club";

describe("degen club fixtures", () => {
  it("provides seven illustrative memecoin products with extreme risk", () => {
    const ws = getDegenClubWorkspace();
    expect(ws.products).toHaveLength(7);
    expect(ws.products.every((p) => p.riskLabel === "Extreme")).toBe(true);
    expect(ws.products.every((p) => p.isIllustrative)).toBe(true);
    expect(ws.products.filter((p) => p.kind === "Index")).toHaveLength(4);
    expect(ws.products.filter((p) => p.kind === "Portfolio")).toHaveLength(3);
    expect(ws.hero.headline).toBe("The New Way To Play Memecoins.");
    expect(ws.hero.subheadline).toBe("STOP BETTING EVERYTHING ON ONE COIN.");
    expect(ws.hero.tagline).toContain("One click. Multiple shots.");
  });

  it("exports canonical risk warning copy", () => {
    expect(DEGEN_RISK_WARNING).toContain("EXTREME RISK WARNING");
    expect(DEGEN_RISK_WARNING).toContain(
      "Diversification and automation do not remove these risks",
    );
    expect(DEGEN_RISK_WARNING).toContain(
      "INDEXLA is not responsible for investment losses",
    );
    expect(DEGEN_RISK_WARNING.toLowerCase()).not.toContain("gambling");
  });
});
