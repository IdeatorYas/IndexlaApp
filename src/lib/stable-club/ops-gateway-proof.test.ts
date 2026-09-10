import { describe, expect, it } from "vitest";
import {
  mayClaimWarmPathLe3,
  OPS_GATEWAY_FORK_PROOF_CHECKLIST,
  OPS_GATEWAY_LIVE_BLOCKERS,
} from "@/lib/stable-club/ops-gateway-proof";

describe("ops-gateway phase3 proof gate", () => {
  it("lists live blockers before claiming ≤3", () => {
    expect(OPS_GATEWAY_LIVE_BLOCKERS.length).toBeGreaterThanOrEqual(5);
    expect(OPS_GATEWAY_LIVE_BLOCKERS.some((b) => b.includes("opsGatewayDeposit"))).toBe(
      true,
    );
    expect(OPS_GATEWAY_FORK_PROOF_CHECKLIST.length).toBeGreaterThanOrEqual(4);
  });

  it("refuses warm ≤3 claim until deploy+fork+verify", () => {
    expect(
      mayClaimWarmPathLe3({
        opsGatewayLive: false,
        forkProofPassed: false,
        basescanVerified: false,
      }),
    ).toBe(false);
    expect(
      mayClaimWarmPathLe3({
        opsGatewayLive: true,
        forkProofPassed: true,
        basescanVerified: true,
      }),
    ).toBe(true);
  });
});
