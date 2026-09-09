import { describe, expect, it } from "vitest";
import {
  privateKeyToAccount,
  generatePrivateKey,
} from "viem/accounts";
import {
  APPROVE_SELECTOR,
  BASE_NPM_PERMIT_DOMAINS,
  NPM_PERMIT_SELECTOR,
  NPM_PERMIT_TYPEHASH,
  assertNotApproveSelector,
  buildNpmPermitTypedData,
  encodeNpmPermitCalldata,
  resolveNpmPermitDomain,
  signAndBuildNpmPermitTx,
  splitPermitSignature,
} from "@/lib/stable-club/npm-erc721-permit";

describe("npm-erc721-permit", () => {
  it("maps Base NPM EIP-712 domains", () => {
    expect(
      resolveNpmPermitDomain({
        npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
        chainId: 8453,
      }).name,
    ).toBe("Uniswap V3 Positions NFT-V1");
    expect(
      BASE_NPM_PERMIT_DOMAINS["0x827922686190790b37229fd06084350e74485b72"]?.version,
    ).toBe("1");
  });

  it("encodes permit with non-approve selector", () => {
    const data = encodeNpmPermitCalldata({
      spender: "0x6d81BC4748483D61a16dDB9F44C2F4C98301e3ae",
      tokenId: BigInt(5950024),
      deadline: BigInt(1_900_000_000),
      v: 27,
      r: `0x${"11".repeat(32)}`,
      s: `0x${"22".repeat(32)}`,
    });
    expect(data.slice(0, 10).toLowerCase()).toBe(NPM_PERMIT_SELECTOR);
    expect(data.slice(0, 10).toLowerCase()).not.toBe(APPROVE_SELECTOR);
    expect(() => assertNotApproveSelector(data)).not.toThrow();
    expect(() =>
      assertNotApproveSelector(`${APPROVE_SELECTOR}${"00".repeat(64)}` as `0x${string}`),
    ).toThrow(/0x095ea7b3/);
  });

  it("splits 65-byte signatures", () => {
    const { v, r, s } = splitPermitSignature(
      (`0x${"ab".repeat(32)}${"cd".repeat(32)}1b`) as `0x${string}`,
    );
    expect(v).toBe(27);
    expect(r).toBe(`0x${"ab".repeat(32)}`);
    expect(s).toBe(`0x${"cd".repeat(32)}`);
  });

  it("signs typed data and builds permit tx without approve selector", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const typed = buildNpmPermitTypedData({
      npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
      chainId: 8453,
      spender: "0x6d81BC4748483D61a16dDB9F44C2F4C98301e3ae",
      tokenId: BigInt(5950024),
      nonce: BigInt(0),
      deadline: BigInt(1_900_000_000),
    });
    expect(typed.message.tokenId).toBe(BigInt(5950024));
    expect(NPM_PERMIT_TYPEHASH.startsWith("0x49ec")).toBe(true);

    const walletClient = {
      account,
      signTypedData: account.signTypedData.bind(account),
    };
    const tx = await signAndBuildNpmPermitTx({
      walletClient: walletClient as never,
      npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
      chainId: 8453,
      spender: "0x6d81BC4748483D61a16dDB9F44C2F4C98301e3ae",
      tokenId: BigInt(5950024),
      nonce: BigInt(0),
      deadline: BigInt(1_900_000_000),
      account: account.address,
    });
    expect(tx.selector).toBe(NPM_PERMIT_SELECTOR);
    expect(tx.data.slice(0, 10).toLowerCase()).toBe(NPM_PERMIT_SELECTOR);
    expect(tx.to.toLowerCase()).toBe(
      "0x03a520b32c04bf3beef7beb72e919cf822ed34f1",
    );
    expect(tx.value).toBe(BigInt(0));
  });
});
