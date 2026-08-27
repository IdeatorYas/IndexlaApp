import {
  STABLE_CLUB_TEST_POOL_ID,
} from "@/lib/stable-club/constants";

/** Development-only internal Base test pool fixture (Step 1). */
export type StableClubTestPoolFixture = {
  id: string;
  label: string;
  chain: "base";
  isTestOnly: true;
  isOfficialCatalogue: false;
  adapterKind: "test-only";
  note: string;
};

export const STABLE_CLUB_INTERNAL_TEST_POOL: StableClubTestPoolFixture = {
  id: STABLE_CLUB_TEST_POOL_ID,
  label: "Internal Base Test Pool (DEV ONLY)",
  chain: "base",
  isTestOnly: true,
  isOfficialCatalogue: false,
  adapterKind: "test-only",
  note:
    "Private fixture for Step 1 fork/local validation. Not one of the five official Base pools.",
};

export function isOfficialStableClubPool(poolId: string): boolean {
  return poolId !== STABLE_CLUB_TEST_POOL_ID;
}
