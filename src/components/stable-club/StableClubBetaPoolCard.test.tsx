import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StableClubBetaPoolCard } from "@/components/stable-club/StableClubBetaPoolCard";
import { OFFICIAL_STABLE_CLUB_BASE_POOLS } from "@/lib/stable-club/official-pools";

describe("StableClubBetaPoolCard", () => {
  afterEach(() => cleanup());

  it("renders informational component without deposit actions", () => {
    const pool = OFFICIAL_STABLE_CLUB_BASE_POOLS[0]!;
    render(
      <StableClubBetaPoolCard
        pool={pool}
        apy={undefined}
        positionStatus="none"
      />,
    );
    expect(screen.getByText(/20% of strategy/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("No position")).toBeInTheDocument();
  });

  it("shows open position status when user holds LP NFT", () => {
    const pool = OFFICIAL_STABLE_CLUB_BASE_POOLS[1]!;
    render(
      <StableClubBetaPoolCard pool={pool} apy={undefined} positionStatus="open" />,
    );
    expect(screen.getByText("Open LP NFT")).toBeInTheDocument();
  });
});
