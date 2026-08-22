import { describe, expect, it } from "vitest";
import { getCreatorsWorkspace } from "@/lib/fixtures/creators";

describe("creators fixtures", () => {
  it("includes at least 25 creators with discovery ranks", () => {
    const ws = getCreatorsWorkspace();
    expect(ws.creators.length).toBeGreaterThanOrEqual(25);
    expect(ws.featuredHandles.length).toBeGreaterThan(0);
    const ranks = ws.creators.map((c) => c.discoveryRank);
    expect(new Set(ranks).size).toBe(ws.creators.length);
  });

  it("keeps followed/notify seed states and specialties", () => {
    const ws = getCreatorsWorkspace();
    expect(ws.creators.some((c) => c.initiallyFollowing)).toBe(true);
    expect(ws.creators.some((c) => !c.initiallyFollowing)).toBe(true);
    expect(ws.creators.some((c) => c.verified)).toBe(true);
    expect(ws.creators.some((c) => !c.verified)).toBe(true);
    expect(ws.specialties.length).toBeGreaterThan(0);
  });
});
