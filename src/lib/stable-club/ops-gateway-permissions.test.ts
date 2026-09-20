/**
 * Gateway fallback / permission invariants — must stay green before enabling features.opsGateway.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  coldWithdrawPromptClaim,
  isOpsGatewayAvailable,
  isOpsGatewayDepositAvailable,
  isOpsGatewayWithdrawAvailable,
  OPS_GATEWAY_PROMPT_INVENTORY,
  SET_APPROVAL_FOR_ALL_SELECTOR,
} from "@/lib/stable-club/ops-gateway";
import { mayClaimWarmPathLe3, OPS_GATEWAY_LIVE_BLOCKERS } from "@/lib/stable-club/ops-gateway-proof";
import { TRUSTED_PHASE2A_BASE_DEPLOYMENTS } from "@/lib/stable-club/trusted-phase2a-base-manifest";

describe("gateway permissions + fallback safety", () => {
  const positionsSrc = readFileSync(
    resolve(__dirname, "../../components/stable-club/useFivePoolPositions.ts"),
    "utf8",
  );

  it("enables Safe-owned withdraw gateway only (deposit stays live-stack)", () => {
    expect(TRUSTED_PHASE2A_BASE_DEPLOYMENTS.opsGateway).toBe(
      "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316",
    );
    expect(TRUSTED_PHASE2A_BASE_DEPLOYMENTS.features?.opsGatewayWithdraw).toBe(true);
    expect(TRUSTED_PHASE2A_BASE_DEPLOYMENTS.features?.opsGatewayDeposit).toBe(false);
    expect(isOpsGatewayWithdrawAvailable(TRUSTED_PHASE2A_BASE_DEPLOYMENTS)).toBe(true);
    expect(isOpsGatewayDepositAvailable(TRUSTED_PHASE2A_BASE_DEPLOYMENTS)).toBe(false);
    expect(isOpsGatewayAvailable(TRUSTED_PHASE2A_BASE_DEPLOYMENTS)).toBe(true);
  });

  it("refuses owner-NPM fallback after any gateway broadcast", () => {
    expect(positionsSrc).toContain("gatewayBroadcasted");
    expect(positionsSrc).toContain("Do not retry owner-NPM exit");
    expect(positionsSrc).toMatch(/gatewayBroadcasted \?/);
  });

  it("makes 100% gateway withdraw mandatory without silent owner-NPM fallback", () => {
    expect(positionsSrc).toContain("owner-NPM fallback disabled for 100%");
    expect(positionsSrc).toContain("MANDATORY atomic path");
    // Mobile WC: address can remain while provider is null — must refresh then fail-closed.
    expect(positionsSrc).toContain("refreshProvider");
    expect(positionsSrc).toContain(
      "Wallet session lost the signing provider (common after mobile background)",
    );
  });

  it("preserves legacy recover + completedPositionKeys idempotency", () => {
    expect(positionsSrc).toContain("readResidueAtHead");
    expect(positionsSrc).toContain("sweepAllResidueToUsdcOnce(");
    expect(positionsSrc).toContain("completedPositionKeys");
    expect(positionsSrc).toContain("resumeRecoverOnly");
    expect(positionsSrc).toContain("listCatalogueMatchedOpenPositions");
  });

  it("uses setApprovalForAll selector 0xa22cb465 not ERC20 approve", () => {
    expect(SET_APPROVAL_FOR_ALL_SELECTOR).toBe("0xa22cb465");
    expect(positionsSrc.toLowerCase()).not.toMatch(
      /setapprovalforall\([^)]*0x095ea7b3/,
    );
  });

  it("documents honest cold-withdraw prompt floor (sequential = 4)", () => {
    expect(OPS_GATEWAY_PROMPT_INVENTORY.coldWithdrawSequential).toBe(4);
    expect(coldWithdrawPromptClaim({ atomicBatchSupported: false }).mayClaimLe3).toBe(
      false,
    );
    expect(mayClaimWarmPathLe3({
      opsGatewayLive: false,
      forkProofPassed: false,
      basescanVerified: false,
    })).toBe(false);
    expect(OPS_GATEWAY_LIVE_BLOCKERS.some((b) => b.includes("opsGatewayDeposit"))).toBe(
      true,
    );
  });
});
