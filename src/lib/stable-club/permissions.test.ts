import { describe, expect, it } from "vitest";
import {
  encodeAllowedActions,
  STABLE_CLUB_PERMISSION_ACTION_BITS,
} from "@/lib/stable-club/permissions";
import {
  isOfficialStableClubPool,
  STABLE_CLUB_INTERNAL_TEST_POOL,
} from "@/lib/stable-club/test-pool";

describe("stable-club permissions", () => {
  it("encodes action bitmasks for executor validation", () => {
    const mask = encodeAllowedActions(["swap", "emergency-exit"]);
    expect(mask).toBe(
      STABLE_CLUB_PERMISSION_ACTION_BITS.swap |
        STABLE_CLUB_PERMISSION_ACTION_BITS["emergency-exit"],
    );
  });
});

describe("stable-club test pool fixture", () => {
  it("marks internal test pool as non-official", () => {
    expect(STABLE_CLUB_INTERNAL_TEST_POOL.isTestOnly).toBe(true);
    expect(isOfficialStableClubPool(STABLE_CLUB_INTERNAL_TEST_POOL.id)).toBe(false);
  });
});
