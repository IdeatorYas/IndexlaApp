import { describe, expect, it } from "vitest";
import { type Address, type Hex } from "viem";
import {
  CRITICAL_OWNABLE_CONTRACT_KEYS,
  runGovernanceActivationPreflight,
  assertGovernanceActivationPreflight,
  addressHasContractCode,
} from "@/lib/stable-club/governance-activation";
import { MVP_GOVERNANCE_SAFE } from "@/lib/stable-club/mvp-governance";
import { STABLE_CLUB_TIMELOCK_SECONDS } from "@/lib/stable-club/governance";

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
  bytecode?: Record<string, Hex | undefined>;
}) {
  const owners = overrides?.owners ?? {};
  const bytecode = overrides?.bytecode ?? {};
  const defaultBytecode = (addr: Address) => {
    const key = addr.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(bytecode, key)) {
      return bytecode[key];
    }
    return CONTRACT_CODE;
  };

  return {
    getBytecode: async ({ address }: { address: Address }) => defaultBytecode(address),
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
      if (args.functionName === "getMinDelay") return overrides?.minDelay ?? BigInt(STABLE_CLUB_TIMELOCK_SECONDS);
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

describe("governance activation preflight", () => {
  it("passes when Safe/Timelock have code, owners match, roles and delay ok", async () => {
    const result = await runGovernanceActivationPreflight({
      governanceSafeAddress: MVP_GOVERNANCE_SAFE,
      timelockAddress: TIMELOCK,
      criticalContracts: criticalAddresses(),
      publicClient: mockPublicClient(),
    });
    expect(result).toEqual({ ok: true });
    await expect(
      assertGovernanceActivationPreflight({
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient(),
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects missing, zero, EOA Safe/Timelock and mismatched Safe", async () => {
    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: null,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient(),
      }),
    ).toMatchObject({ ok: false, code: "missing-safe" });

    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: null,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient(),
      }),
    ).toMatchObject({ ok: false, code: "missing-timelock" });

    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: "0x0000000000000000000000000000000000000000",
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient(),
      }),
    ).toMatchObject({ ok: false, code: "zero-safe" });

    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: "0x2222222222222222222222222222222222222222",
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient(),
      }),
    ).toMatchObject({ ok: false, code: "safe-mismatch" });

    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient({
          bytecode: { [MVP_GOVERNANCE_SAFE.toLowerCase()]: "0x" },
        }),
      }),
    ).toMatchObject({ ok: false, code: "safe-not-contract" });

    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient({
          bytecode: { [TIMELOCK.toLowerCase()]: undefined },
        }),
      }),
    ).toMatchObject({ ok: false, code: "timelock-not-contract" });
  });

  it("rejects owner mismatch, missing critical contract, missing roles, low delay", async () => {
    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: { permissionRegistry: criticalAddresses().permissionRegistry },
        publicClient: mockPublicClient(),
      }),
    ).toMatchObject({ ok: false, code: "missing-critical-contract" });

    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient({
          owners: { executor: "0x9999999999999999999999999999999999999999" },
        }),
      }),
    ).toMatchObject({ ok: false, code: "owner-mismatch" });

    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient({ safeHasProposer: false }),
      }),
    ).toMatchObject({ ok: false, code: "safe-missing-proposer-role" });

    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient({ safeHasExecutor: false }),
      }),
    ).toMatchObject({ ok: false, code: "safe-missing-executor-role" });

    expect(
      await runGovernanceActivationPreflight({
        governanceSafeAddress: MVP_GOVERNANCE_SAFE,
        timelockAddress: TIMELOCK,
        criticalContracts: criticalAddresses(),
        publicClient: mockPublicClient({ minDelay: BigInt(STABLE_CLUB_TIMELOCK_SECONDS - 1) }),
      }),
    ).toMatchObject({ ok: false, code: "timelock-delay-below-minimum" });
  });

  it("addressHasContractCode rejects EOAs", () => {
    expect(addressHasContractCode(undefined)).toBe(false);
    expect(addressHasContractCode("0x")).toBe(false);
    expect(addressHasContractCode(CONTRACT_CODE)).toBe(true);
  });
});
