import { describe, expect, it, vi } from "vitest";
import {
  assertRecoverSpendable,
  UNI_SWAP_ROUTER02_STF_MESSAGE,
  waitUntilRouterAllowance,
} from "@/lib/stable-club/recover-loose-assets";

describe("recover-loose-assets allowance gate", () => {
  it("assertRecoverSpendable rejects allowance < amountIn (STF precondition)", () => {
    expect(() =>
      assertRecoverSpendable({
        balance: BigInt(6700),
        allowance: BigInt(0),
        amountIn: BigInt(4504),
      }),
    ).toThrow(/STF|allowance/i);

    expect(() =>
      assertRecoverSpendable({
        balance: BigInt(6700),
        allowance: BigInt(4504),
        amountIn: BigInt(4504),
      }),
    ).not.toThrow();
  });

  it("waitUntilRouterAllowance resolves once HTTP allowance catches up after approve", async () => {
    const reads = [
      BigInt(0),
      BigInt(0),
      BigInt(4504),
    ];
    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === "balanceOf") return BigInt(6700);
        if (functionName === "allowance") {
          const next = reads.shift();
          return next ?? BigInt(4504);
        }
        throw new Error(functionName);
      }),
    };
    const allowance = await waitUntilRouterAllowance({
      publicClient: publicClient as never,
      token: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      owner: "0xab4e242C5b489e8301408C93003903364214559F",
      router: "0x2626664c2603336E57B271c5C0b26F421741e481",
      minAmount: BigInt(4504),
      attempts: 5,
      delayMs: 1,
    });
    expect(allowance).toBe(BigInt(4504));
    expect(UNI_SWAP_ROUTER02_STF_MESSAGE).toMatch(/STF/);
  });
});
