import { describe, expect, it, vi } from "vitest";
import {
  isCaliburDelegated,
  signEip7702AuthorizationViaProvider,
  CALIBUR_RH,
} from "@/lib/utility-index/sell-batch";

describe("signEip7702AuthorizationViaProvider", () => {
  it("does not use viem json-rpc signAuthorization; parses eth_signAuthorization object", async () => {
    const ethereum = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "eth_signAuthorization") {
          return {
            chainId: 4663,
            address: CALIBUR_RH,
            nonce: 7,
            yParity: 1,
            r: ("0x" + "11".repeat(32)) as `0x${string}`,
            s: ("0x" + "22".repeat(32)) as `0x${string}`,
          };
        }
        throw new Error(`unexpected ${method}`);
      }),
    };
    const auth = await signEip7702AuthorizationViaProvider({
      ethereum,
      signer: "0x1111111111111111111111111111111111111111",
      nonce: 7,
    });
    expect(auth.yParity).toBe(1);
    expect(auth.nonce).toBe(7);
    expect(auth.address.toLowerCase()).toBe(CALIBUR_RH.toLowerCase());
    expect(ethereum.request).toHaveBeenCalled();
  });

  it("falls through method shapes until one succeeds", async () => {
    let calls = 0;
    const ethereum = {
      request: vi.fn(async () => {
        calls += 1;
        if (calls < 2) throw new Error("method not found");
        return {
          r: ("0x" + "aa".repeat(32)) as `0x${string}`,
          s: ("0x" + "bb".repeat(32)) as `0x${string}`,
          v: 28,
        };
      }),
    };
    const auth = await signEip7702AuthorizationViaProvider({
      ethereum,
      signer: "0x2222222222222222222222222222222222222222",
      nonce: 3,
    });
    expect(auth.yParity).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

describe("isCaliburDelegated", () => {
  it("detects 0xef0100 || calibur", () => {
    const code = (`0xef0100` + CALIBUR_RH.slice(2).toLowerCase()) as `0x${string}`;
    expect(isCaliburDelegated(code)).toBe(true);
    expect(isCaliburDelegated("0x")).toBe(false);
  });
});
