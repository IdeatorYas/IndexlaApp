import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  listSolanaInjectedWallets,
  connectSolanaProvider,
  setActiveSolanaProvider,
} from "@/lib/degen-solana/injected-wallets";

describe("listSolanaInjectedWallets", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    setActiveSolanaProvider(null);
  });

  afterEach(() => {
    // @ts-expect-error test cleanup
    globalThis.window = originalWindow;
  });

  it("returns empty without window", () => {
    // @ts-expect-error deliberate
    delete globalThis.window;
    expect(listSolanaInjectedWallets()).toEqual([]);
  });

  it("detects window.phantom.solana with only connect()", () => {
    const connect = vi.fn(async () => ({
      publicKey: { toString: () => "11111111111111111111111111111111" },
    }));
    // @ts-expect-error mock
    globalThis.window = {
      phantom: { solana: { isPhantom: true, connect } },
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    };
    const list = listSolanaInjectedWallets();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("phantom");
    expect(list[0]?.name).toBe("Phantom");
  });

  it("does not treat bare window.solana MetaMask stub as Phantom", () => {
    // @ts-expect-error mock
    globalThis.window = {
      solana: { connect: vi.fn() }, // no isPhantom
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    };
    expect(listSolanaInjectedWallets()).toEqual([]);
  });
});

describe("connectSolanaProvider", () => {
  it("reads publicKey from connect() result", async () => {
    const pk = await connectSolanaProvider({
      connect: async () => ({
        publicKey: { toString: () => "So11111111111111111111111111111111111111112" },
      }),
    });
    expect(pk.startsWith("So11")).toBe(true);
  });

  it("falls back to provider.publicKey when connect returns void", async () => {
    const provider = {
      publicKey: { toString: () => "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      connect: async () => undefined,
    };
    const pk = await connectSolanaProvider(provider);
    expect(pk.startsWith("Token")).toBe(true);
  });

  it("throws when no address is available", async () => {
    await expect(
      connectSolanaProvider({ connect: async () => undefined }),
    ).rejects.toThrow(/did not return an address/i);
  });
});
