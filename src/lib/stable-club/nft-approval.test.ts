import { describe, expect, it } from "vitest";
import {
  automationRequiresNftApproval,
  buildPerTokenApproveTx,
  isForbiddenApprovalMethod,
  resolvePerTokenApprovalStatus,
} from "@/lib/stable-club/nft-approval";

const ADAPTER = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const NPM = "0x3333333333333333333333333333333333333333" as const;

describe("nft-approval — per-token ERC721 gate", () => {
  it("reports required when getApproved is not the adapter", () => {
    expect(
      resolvePerTokenApprovalStatus({ adapter: ADAPTER, approvedSpender: OTHER }),
    ).toBe("required");
    expect(
      resolvePerTokenApprovalStatus({ adapter: ADAPTER, approvedSpender: null }),
    ).toBe("required");
  });

  it("reports approved only for exact per-token spender match", () => {
    expect(
      resolvePerTokenApprovalStatus({ adapter: ADAPTER, approvedSpender: ADAPTER }),
    ).toBe("approved");
  });

  it("builds approve(adapter, tokenId) and never setApprovalForAll", () => {
    const tx = buildPerTokenApproveTx({
      npm: NPM,
      adapter: ADAPTER,
      tokenId: BigInt(1001),
    });
    expect(tx.functionName).toBe("approve");
    expect(tx.args).toEqual([ADAPTER, BigInt(1001)]);
    expect(isForbiddenApprovalMethod("setApprovalForAll")).toBe(true);
    expect(isForbiddenApprovalMethod("approve")).toBe(false);
  });

  it("blocks automation until approved", () => {
    expect(automationRequiresNftApproval("required")).toBe(true);
    expect(automationRequiresNftApproval("unavailable")).toBe(true);
    expect(automationRequiresNftApproval("approved")).toBe(false);
  });
});
