import { describe, expect, it } from "vitest";
import {
  coldWithdrawPromptClaim,
  encodeSetApprovalForAllCall,
  isOpsGatewayAvailable,
  isOpsGatewayDepositAvailable,
  isOpsGatewayWithdrawAvailable,
  OPS_GATEWAY_PROMPT_INVENTORY,
  SET_APPROVAL_FOR_ALL_SELECTOR,
  uniqueNpmAddresses,
} from "@/lib/stable-club/ops-gateway";
import { assertPermit2Ttl } from "@/lib/stable-club/ops-gateway-permit2";

const GW = "0x1111111111111111111111111111111111111111" as const;

describe("ops-gateway feature gate (split withdraw/deposit)", () => {
  it("is fail-closed without explicit withdraw/deposit flags", () => {
    expect(isOpsGatewayAvailable(null)).toBe(false);
    expect(isOpsGatewayAvailable({ features: { opsGateway: true } })).toBe(false);
    expect(
      isOpsGatewayWithdrawAvailable({
        opsGateway: GW,
        features: { opsGateway: true },
      }),
    ).toBe(false);
    expect(
      isOpsGatewayDepositAvailable({
        opsGateway: GW,
        features: { opsGateway: true },
      }),
    ).toBe(false);
  });

  it("enables withdraw without enabling deposit", () => {
    const d = {
      opsGateway: GW,
      features: { opsGatewayWithdraw: true, opsGatewayDeposit: false },
    };
    expect(isOpsGatewayWithdrawAvailable(d)).toBe(true);
    expect(isOpsGatewayDepositAvailable(d)).toBe(false);
    expect(isOpsGatewayAvailable(d)).toBe(true);
  });

  it("enables deposit only with opsGatewayDeposit flag", () => {
    const d = {
      opsGateway: GW,
      opsGatewayDeposit: "0x2222222222222222222222222222222222222222" as const,
      features: { opsGatewayWithdraw: false, opsGatewayDeposit: true },
    };
    expect(isOpsGatewayDepositAvailable(d)).toBe(true);
    expect(isOpsGatewayWithdrawAvailable(d)).toBe(false);
  });
});

describe("ops-gateway prompt honesty", () => {
  it("refuses ≤3 claim for sequential cold withdraw", () => {
    const claim = coldWithdrawPromptClaim({ atomicBatchSupported: false });
    expect(claim.prompts).toBe(OPS_GATEWAY_PROMPT_INVENTORY.coldWithdrawSequential);
    expect(claim.mayClaimLe3).toBe(false);
  });

  it("allows ≤3 claim when atomic batch is available", () => {
    const claim = coldWithdrawPromptClaim({ atomicBatchSupported: true });
    expect(claim.prompts).toBe(1);
    expect(claim.mayClaimLe3).toBe(true);
  });
});

describe("ops-gateway calldata", () => {
  it("encodes setApprovalForAll with 0xa22cb465", () => {
    const { data } = encodeSetApprovalForAllCall({
      npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
      operator: GW,
      approved: true,
    });
    expect(data.slice(0, 10).toLowerCase()).toBe(SET_APPROVAL_FOR_ALL_SELECTOR);
  });

  it("dedupes NPM addresses", () => {
    const npm = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as const;
    expect(
      uniqueNpmAddresses([{ npm }, { npm }, { npm: "0x827922686190790b37229fd06084350e74485b72" }]),
    ).toHaveLength(2);
  });
});

describe("ops-gateway Permit2 TTL", () => {
  it("rejects TTL over 30 minutes", () => {
    const now = 1_700_000_000;
    expect(() => assertPermit2Ttl(now + 31 * 60, now)).toThrow(/30 minutes/);
    expect(() => assertPermit2Ttl(now + 20 * 60, now)).not.toThrow();
  });
});
