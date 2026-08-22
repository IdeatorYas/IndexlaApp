import { describe, expect, it } from "vitest";
import {
  getAllCreatorPublicHandles,
  getCreatorPublicProfile,
} from "@/lib/fixtures/creator-profile";
import { getCreatorsWorkspace } from "@/lib/fixtures/creators";
import { CREATOR_FUNDS_DISCLOSURE } from "@/lib/domain/creators";

describe("creator public profiles", () => {
  it("resolves a profile for every directory creator", () => {
    const handles = getAllCreatorPublicHandles();
    expect(handles.length).toBeGreaterThanOrEqual(25);
    expect(handles.length).toBe(getCreatorsWorkspace().creators.length);

    for (const handle of handles) {
      const profile = getCreatorPublicProfile(handle);
      expect(profile).not.toBeNull();
      expect(profile!.handle).toBe(handle);
      expect(profile!.products.length).toBeGreaterThan(0);
      expect(profile!.strategies.length).toBeGreaterThan(0);
      expect(profile!.disclosures.length).toBeGreaterThan(0);
      expect(CREATOR_FUNDS_DISCLOSURE).toContain("never control");
    }
  });

  it("returns null for unknown handles", () => {
    expect(getCreatorPublicProfile("does-not-exist")).toBeNull();
  });

  it("exports required funds disclosure", () => {
    expect(CREATOR_FUNDS_DISCLOSURE).toContain(
      "Creators never control investor funds",
    );
  });
});
