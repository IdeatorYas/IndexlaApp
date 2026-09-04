import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StableClubAutomationPanel } from "@/components/stable-club/StableClubAutomationPanel";
import { COMPOUND_OPENSERV_CONNECTED } from "@/lib/stable-club/compound-validation";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";

const registerHarvestPermission = vi.fn();
const registerCompoundPermission = vi.fn();
const runHarvest = vi.fn();
const runCompound = vi.fn();

vi.mock("@/components/stable-club/useStableClubHarvest", () => ({
  useStableClubHarvest: () => ({
    deployments: null,
    permissionRegistered: false,
    registerHarvestPermission,
    runHarvest,
    busy: false,
    uiStatus: { status: "idle", message: null, lastTxHash: null, lastValidationCode: null },
    verifiedAdapters: [],
  }),
}));

vi.mock("@/components/stable-club/useStableClubCompound", () => ({
  useStableClubCompound: () => ({
    deployments: null,
    permissionRegistered: false,
    registerCompoundPermission,
    runCompound,
    busy: false,
    uiStatus: { status: "idle", message: null, lastTxHash: null, lastValidationCode: null },
    automationAvailable: COMPOUND_OPENSERV_CONNECTED,
    automationStatusMessage: "OpenServ compound keeper is not connected",
    verifiedAdapters: [],
  }),
}));

describe("StableClubAutomationPanel", () => {
  it("reuses audited harvest/compound hooks and keeps gates visible", () => {
    render(<StableClubAutomationPanel />);
    expect(screen.getByText(/Auto-Harvest · Auto-Compound/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Opt in Auto-Harvest/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Opt in Auto-Compound/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Manual harvest fallback/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Manual compound fallback/i })).toBeDisabled();
    expect(PRIVATE_BETA_LAUNCH_PARAMS.automation.harvestEnabled).toBe(false);
    expect(PRIVATE_BETA_LAUNCH_PARAMS.automation.compoundEnabled).toBe(false);
    expect(COMPOUND_OPENSERV_CONNECTED).toBe(false);
    expect(runHarvest).not.toHaveBeenCalled();
    expect(runCompound).not.toHaveBeenCalled();
  });
});
