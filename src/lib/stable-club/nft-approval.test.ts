import { describe, expect, it } from "vitest";
import {
  automationRequiresNftApproval,
  buildPerTokenApproveTx,
  evaluateApproveEligibility,
  isForbiddenApprovalMethod,
  resolvePerTokenApprovalStatus,
  resolveStatusAfterApproveConfirmation,
  resolveVerifiedAdapterForPool,
  ZERO_ADDRESS,
} from "@/lib/stable-club/nft-approval";

const ADAPTER = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const NPM = "0x3333333333333333333333333333333333333333" as const;
const OWNER = "0x4444444444444444444444444444444444444444" as const;
const CODE = "0x6001600155" as const;

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
      tokenId: BigInt(42),
    });
    expect(tx.functionName).toBe("approve");
    expect(tx.args).toEqual([ADAPTER, BigInt(42)]);
    expect(isForbiddenApprovalMethod("setApprovalForAll")).toBe(true);
    expect(isForbiddenApprovalMethod("approve")).toBe(false);
  });

  it("rejects zero adapter/npm when building approve", () => {
    expect(() =>
      buildPerTokenApproveTx({ npm: NPM, adapter: ZERO_ADDRESS, tokenId: BigInt(1) }),
    ).toThrow(/adapter required/);
    expect(() =>
      buildPerTokenApproveTx({ npm: ZERO_ADDRESS, adapter: ADAPTER, tokenId: BigInt(1) }),
    ).toThrow(/npm required/);
  });

  it("blocks automation until approved", () => {
    expect(automationRequiresNftApproval("required")).toBe(true);
    expect(automationRequiresNftApproval("unavailable")).toBe(true);
    expect(automationRequiresNftApproval("approved")).toBe(false);
  });

  it("only resolves adapters from verified chain-specific deployments", () => {
    expect(
      resolveVerifiedAdapterForPool({
        deployments: [
          { chainId: 8453, poolId: "USDC-cbBTC-AERO-CL100", adapter: ADAPTER, npm: NPM },
        ],
        chainId: 8453,
        poolId: "USDC-cbBTC-AERO-CL100",
      })?.adapter,
    ).toBe(ADAPTER);
    expect(
      resolveVerifiedAdapterForPool({
        deployments: [
          { chainId: 8453, poolId: "USDC-cbBTC-AERO-CL100", adapter: ADAPTER, npm: NPM },
        ],
        chainId: 1,
        poolId: "USDC-cbBTC-AERO-CL100",
      }),
    ).toBeNull();
    expect(
      resolveVerifiedAdapterForPool({
        deployments: [
          {
            chainId: 8453,
            poolId: "USDC-cbBTC-AERO-CL100",
            adapter: ZERO_ADDRESS,
            npm: NPM,
          },
        ],
        chainId: 8453,
        poolId: "USDC-cbBTC-AERO-CL100",
      }),
    ).toBeNull();
  });

  it("disables approve when chain, ownership, bytecode or deployments fail", () => {
    const base = {
      walletAddress: OWNER,
      walletChainId: 8453,
      expectedChainId: 8453,
      nftOwner: OWNER,
      positionTokenId: "42",
      adapter: ADAPTER,
      npm: NPM,
      adapterBytecode: CODE,
      npmBytecode: CODE,
      fromVerifiedDeployments: true,
    };
    expect(evaluateApproveEligibility(base).ok).toBe(true);
    expect(evaluateApproveEligibility({ ...base, walletChainId: 1 }).ok).toBe(false);
    expect(evaluateApproveEligibility({ ...base, nftOwner: OTHER }).ok).toBe(false);
    expect(evaluateApproveEligibility({ ...base, adapterBytecode: "0x" }).ok).toBe(false);
    expect(
      evaluateApproveEligibility({ ...base, fromVerifiedDeployments: false }).ok,
    ).toBe(false);
    expect(evaluateApproveEligibility({ ...base, positionTokenId: "1001x" }).ok).toBe(false);
    expect(evaluateApproveEligibility({ ...base, positionTokenId: "" }).ok).toBe(false);
    expect(evaluateApproveEligibility({ ...base, adapter: ZERO_ADDRESS }).ok).toBe(false);
  });

  it("marks approved only after successful receipt and matching getApproved", () => {
    expect(
      resolveStatusAfterApproveConfirmation({
        receiptStatus: "reverted",
        adapter: ADAPTER,
        getApprovedSpender: ADAPTER,
      }),
    ).toBe("required");
    expect(
      resolveStatusAfterApproveConfirmation({
        receiptStatus: "success",
        adapter: ADAPTER,
        getApprovedSpender: OTHER,
      }),
    ).toBe("required");
    expect(
      resolveStatusAfterApproveConfirmation({
        receiptStatus: "success",
        adapter: ADAPTER,
        getApprovedSpender: ADAPTER,
      }),
    ).toBe("approved");
  });

  it("never treats dummy mainnet spenders as verified without deployments", () => {
    expect(
      resolveVerifiedAdapterForPool({
        deployments: [],
        chainId: 8453,
        poolId: "USDC-cbBTC-AERO-CL100",
      }),
    ).toBeNull();
  });
});
