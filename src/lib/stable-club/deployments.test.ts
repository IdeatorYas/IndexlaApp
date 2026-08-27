import { describe, expect, it } from "vitest";
import {
  toPublicDeploymentsPayload,
  verifiedStep2Adapters,
  type StableClubLocalDeployments,
} from "@/lib/stable-club/deployments";
import {
  evaluateApproveEligibility,
  resolveVerifiedAdapterForPool,
  ZERO_ADDRESS,
} from "@/lib/stable-club/nft-approval";
import type { Address, Hex } from "viem";

const ADAPTER = "0x1111111111111111111111111111111111111111" as Address;
const NPM = "0x3333333333333333333333333333333333333333" as Address;
const OTHER = "0x2222222222222222222222222222222222222222" as Address;
const OWNER = "0x4444444444444444444444444444444444444444" as Address;
const CODE = "0x6001600155" as Hex;
const ZERO = ZERO_ADDRESS;

function baseDeployments(
  overrides: Partial<StableClubLocalDeployments> = {},
): StableClubLocalDeployments {
  return {
    chainId: 31337,
    network: "hardhat-local",
    isTestOnly: true,
    label: "test",
    deployedAt: "2026-01-01T00:00:00.000Z",
    deployer: OWNER,
    testUser: OWNER,
    feeRecipient: OWNER,
    permissionRegistry: OTHER,
    feeRouter: OTHER,
    executor: OTHER,
    testAdapter: OTHER,
    usdc: OTHER,
    weth: OTHER,
    poolId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    rpcUrl: "http://127.0.0.1:8545",
    step2Adapters: [
      {
        chainId: 31337,
        poolId: "USDC-cbBTC-AERO-CL100",
        adapter: ADAPTER,
        npm: NPM,
      },
    ],
    ...overrides,
  };
}

describe("stable-club deployments API serialization", () => {
  it("includes chain-filtered step2Adapters in the public payload", () => {
    const payload = toPublicDeploymentsPayload(
      baseDeployments({
        step2Adapters: [
          {
            chainId: 31337,
            poolId: "USDC-cbBTC-AERO-CL100",
            adapter: ADAPTER,
            npm: NPM,
          },
          {
            chainId: 8453,
            poolId: "USDC-cbBTC-UNI-005",
            adapter: OTHER,
            npm: NPM,
          },
          {
            chainId: 31337,
            poolId: "USDC-cbBTC-UNI-005",
            adapter: ZERO,
            npm: NPM,
          },
          {
            chainId: 31337,
            poolId: "",
            adapter: ADAPTER,
            npm: NPM,
          },
        ],
      }),
    );
    expect(payload.step2Adapters).toEqual([
      {
        chainId: 31337,
        poolId: "USDC-cbBTC-AERO-CL100",
        adapter: ADAPTER,
        npm: NPM,
      },
    ]);
  });

  it("rejects missing, zero, and wrong-chain adapters from verified list", () => {
    expect(verifiedStep2Adapters(null)).toEqual([]);
    expect(
      verifiedStep2Adapters(
        baseDeployments({
          step2Adapters: [
            {
              chainId: 1,
              poolId: "USDC-cbBTC-AERO-CL100",
              adapter: ADAPTER,
              npm: NPM,
            },
            {
              chainId: 31337,
              poolId: "USDC-cbBTC-AERO-CL100",
              adapter: ZERO,
              npm: NPM,
            },
            {
              chainId: 31337,
              poolId: "USDC-cbBTC-AERO-CL100",
              adapter: ADAPTER,
              npm: ZERO,
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("resolves approve spender end-to-end from API payload + eligibility gates", () => {
    const apiPayload = toPublicDeploymentsPayload(baseDeployments());
    const verified = verifiedStep2Adapters(apiPayload);
    const match = resolveVerifiedAdapterForPool({
      deployments: verified,
      chainId: apiPayload.chainId,
      poolId: "USDC-cbBTC-AERO-CL100",
    });
    expect(match?.adapter).toBe(ADAPTER);
    expect(match?.npm).toBe(NPM);

    const eligibility = evaluateApproveEligibility({
      walletAddress: OWNER,
      walletChainId: 31337,
      expectedChainId: apiPayload.chainId,
      nftOwner: OWNER,
      positionTokenId: "42",
      adapter: match!.adapter,
      npm: match!.npm,
      adapterBytecode: CODE,
      npmBytecode: CODE,
      fromVerifiedDeployments: true,
    });
    expect(eligibility.ok).toBe(true);

    expect(
      evaluateApproveEligibility({
        walletAddress: OWNER,
        walletChainId: 31337,
        expectedChainId: apiPayload.chainId,
        nftOwner: OWNER,
        positionTokenId: "42",
        adapter: match!.adapter,
        npm: match!.npm,
        adapterBytecode: "0x",
        npmBytecode: CODE,
        fromVerifiedDeployments: true,
      }).ok,
    ).toBe(false);

    expect(
      resolveVerifiedAdapterForPool({
        deployments: verifiedStep2Adapters(
          baseDeployments({ step2Adapters: undefined }),
        ),
        chainId: 31337,
        poolId: "USDC-cbBTC-AERO-CL100",
      }),
    ).toBeNull();
  });
});
