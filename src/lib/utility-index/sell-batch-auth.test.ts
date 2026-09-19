import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { hashAuthorization } from "viem/utils";
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

  it("C2c: eth_sign of hashAuthorization when recover matches signer", async () => {
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    const nonce = 7;
    const digest = hashAuthorization({
      address: CALIBUR_RH,
      chainId: 4663,
      nonce,
    });
    const ethereum = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (
          method === "eth_signAuthorization" ||
          method === "wallet_signAuthorization"
        ) {
          throw new Error("Unsupported method");
        }
        if (method === "eth_sign") {
          return account.sign({ hash: digest });
        }
        throw new Error(`unexpected ${method}`);
      }),
    };
    const auth = await signEip7702AuthorizationViaProvider({
      ethereum,
      signer: account.address,
      nonce,
    });
    expect(auth.nonce).toBe(nonce);
    expect(auth.address.toLowerCase()).toBe(CALIBUR_RH.toLowerCase());
  });

  it("C2c: hard-blocks when eth_sign also unsupported", async () => {
    const ethereum = {
      request: vi.fn(async () => {
        throw new Error('{"code":-32600,"message":"Unsupported method"}');
      }),
    };
    await expect(
      signEip7702AuthorizationViaProvider({
        ethereum,
        signer: "0x3333333333333333333333333333333333333333",
        nonce: 1,
      }),
    ).rejects.toThrow(/Cold sell blocked|Unlock requires/);
  });
});

describe("isCaliburDelegated", () => {
  it("detects 0xef0100 || calibur", () => {
    const code = (`0xef0100` +
      CALIBUR_RH.slice(2).toLowerCase()) as `0x${string}`;
    expect(isCaliburDelegated(code)).toBe(true);
    expect(isCaliburDelegated("0x")).toBe(false);
  });
});
