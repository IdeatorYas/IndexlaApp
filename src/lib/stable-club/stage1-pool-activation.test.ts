import { describe, expect, it } from "vitest";
import { type Address, type Hex } from "viem";
import { PRIVATE_BETA_LAUNCH_PARAMS } from "@/lib/stable-club/launch-params";
import { MVP_GOVERNANCE_SAFE } from "@/lib/stable-club/mvp-governance";
import { CRITICAL_OWNABLE_CONTRACT_KEYS } from "@/lib/stable-club/governance-activation";
import { activateStage1OfficialPools } from "@/lib/stable-club/stage1-pool-activation";

const TIMELOCK = "0x1111111111111111111111111111111111111111" as Address;
const CONTRACT_CODE = "0x60006000" as Hex;
const PROPOSER_ROLE = "0xb09f1266e6a2293f5c7361b9064a616c2168795" as Hex;
const EXECUTOR_ROLE = "0xd8aa0f3194971a2a116513f198a2fd19234636ea172f6948" as Hex;

function criticalAddresses(): Record<(typeof CRITICAL_OWNABLE_CONTRACT_KEYS)[number], Address> {
  const out = {} as Record<(typeof CRITICAL_OWNABLE_CONTRACT_KEYS)[number], Address>;
  CRITICAL_OWNABLE_CONTRACT_KEYS.forEach((key, i) => {
    out[key] = `0x${String(i + 1).padStart(40, "0")}` as Address;
  });
  return out;
}

function mockPublicClient(overrides?: {
  owners?: Partial<Record<(typeof CRITICAL_OWNABLE_CONTRACT_KEYS)[number], Address>>;
  minDelay?: bigint;
  safeHasProposer?: boolean;
  safeHasExecutor?: boolean;
}) {
  const owners = overrides?.owners ?? {};
  return {
    getBytecode: async () => CONTRACT_CODE,
    readContract: async (args: {
      address: Address;
      functionName: string;
      args?: readonly unknown[];
    }) => {
      if (args.functionName === "owner") {
        for (const [key, contract] of Object.entries(criticalAddresses()) as [string, Address][]) {
          if (contract.toLowerCase() === args.address.toLowerCase()) {
            return owners[key as (typeof CRITICAL_OWNABLE_CONTRACT_KEYS)[number]] ?? TIMELOCK;
          }
        }
        return TIMELOCK;
      }
      if (args.functionName === "PROPOSER_ROLE") return PROPOSER_ROLE;
      if (args.functionName === "EXECUTOR_ROLE") return EXECUTOR_ROLE;
      if (args.functionName === "getMinDelay") {
        return overrides?.minDelay ?? BigInt(PRIVATE_BETA_LAUNCH_PARAMS.governance.timelockSeconds);
      }
      if (args.functionName === "hasRole") {
        const [, account] = args.args ?? [];
        if ((account as Address).toLowerCase() !== MVP_GOVERNANCE_SAFE.toLowerCase()) return false;
        const role = args.args?.[0];
        if (role === PROPOSER_ROLE) return overrides?.safeHasProposer ?? true;
        if (role === EXECUTOR_ROLE) return overrides?.safeHasExecutor ?? true;
      }
      throw new Error(`unexpected readContract ${args.functionName}`);
    },
  };
}

describe("Stage 1 pool activation (canonical path)", () => {
  it("activates UNI-005 only after governance preflight passes on mainnet", async () => {
    const result = await activateStage1OfficialPools({
      testPoolValidated: true,
      environment: "mainnet",
      governanceSafeAddress: MVP_GOVERNANCE_SAFE,
      timelockAddress: TIMELOCK,
      criticalContracts: criticalAddresses(),
      publicClient: mockPublicClient(),
    });
    expect(result.stage).toBe("stage1-private-beta");
    expect(result.activatedPoolIds).toEqual(["USDC-cbBTC-UNI-005"]);
  });

  it("blocks local environment from activating production catalogue pools", async () => {
    await expect(
      activateStage1OfficialPools({
        testPoolValidated: true,
        environment: "local",
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient(),
      }),
    ).rejects.toThrow(/local Hardhat environment cannot activate production catalogue pools/);
  });

  it("blocks when test pool is not validated", async () => {
    await expect(
      activateStage1OfficialPools({
        testPoolValidated: false,
        environment: "mainnet",
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient(),
      }),
    ).rejects.toThrow(/test pool validation required/);
  });

  it("blocks missing timelock governance wiring", async () => {
    await expect(
      activateStage1OfficialPools({
        testPoolValidated: true,
        environment: "mainnet",
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: null,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient(),
      }),
    ).rejects.toThrow(/Timelock address is required/);
  });

  it("blocks EOA owner mismatch and insufficient on-chain delay", async () => {
    await expect(
      activateStage1OfficialPools({
        testPoolValidated: true,
        environment: "mainnet",
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient({
          owners: { executor: "0x9999999999999999999999999999999999999999" },
        }),
      }),
    ).rejects.toThrow(/owner must equal configured Timelock/);

    await expect(
      activateStage1OfficialPools({
        testPoolValidated: true,
        environment: "mainnet",
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient({
          minDelay: BigInt(PRIVATE_BETA_LAUNCH_PARAMS.governance.timelockSeconds - 1),
        }),
      }),
    ).rejects.toThrow(/below configured minimum/);
  });

  it("uses launch-params timelockSeconds as configured minimum (48h policy)", () => {
    expect(PRIVATE_BETA_LAUNCH_PARAMS.governance.timelockSeconds).toBe(48 * 60 * 60);
  });
});
