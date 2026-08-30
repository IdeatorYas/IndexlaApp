import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";

const HASH = "0xabc123" as Hex;

const sendTransaction = vi.fn(async () => HASH);
const privateKeyToAccount = vi.fn(() => ({ address: "0x1111111111111111111111111111111111111111" }));
const createWalletClient = vi.fn(() => ({ sendTransaction }));
const createPublicClient = vi.fn(() => ({ waitForTransactionReceipt: vi.fn() }));
const http = vi.fn(() => ({}));
const waitForSuccessfulTransactionReceipt = vi.fn(async () => ({ status: "success", transactionHash: HASH }));

vi.mock("viem", () => ({
  createWalletClient: (...args: unknown[]) => createWalletClient(...args),
  createPublicClient: (...args: unknown[]) => createPublicClient(...args),
  http: (...args: unknown[]) => http(...args),
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: (...args: unknown[]) => privateKeyToAccount(...args),
}));

vi.mock("@/lib/stable-club/transaction-receipt", () => ({
  waitForSuccessfulTransactionReceipt: (...args: unknown[]) =>
    waitForSuccessfulTransactionReceipt(...args),
}));

vi.mock("@/lib/stable-club/constants", () => ({
  STABLE_CLUB_LOCAL_CHAIN: { id: 31337 },
  STABLE_CLUB_LOCAL_RPC_URL: "http://127.0.0.1:8545",
}));

function mockRequest(host: string, jsonImpl?: () => Promise<unknown>): Request {
  return {
    headers: new Headers({ host }),
    json:
      jsonImpl ??
      vi.fn(async () => ({
        to: "0x2222222222222222222222222222222222222222",
        data: "0x",
      })),
  } as unknown as Request;
}

describe("SC-F07 e2e/send-tx route gate", () => {
  const originalDev = process.env.STABLE_CLUB_DEV_ENABLED;
  const originalE2e = process.env.STABLE_CLUB_E2E_SIGNING;

  beforeEach(() => {
    vi.resetModules();
    sendTransaction.mockClear();
    privateKeyToAccount.mockClear();
    createWalletClient.mockClear();
    createPublicClient.mockClear();
    waitForSuccessfulTransactionReceipt.mockClear();
  });

  afterEach(() => {
    if (originalDev === undefined) delete process.env.STABLE_CLUB_DEV_ENABLED;
    else process.env.STABLE_CLUB_DEV_ENABLED = originalDev;
    if (originalE2e === undefined) delete process.env.STABLE_CLUB_E2E_SIGNING;
    else process.env.STABLE_CLUB_E2E_SIGNING = originalE2e;
  });

  async function loadPost() {
    const mod = await import("./route");
    return mod.POST;
  }

  it("both flags true + localhost → signs and returns hash", async () => {
    process.env.STABLE_CLUB_DEV_ENABLED = "true";
    process.env.STABLE_CLUB_E2E_SIGNING = "true";
    const POST = await loadPost();
    const json = vi.fn(async () => ({
      to: "0x2222222222222222222222222222222222222222",
      data: "0x",
    }));
    const res = await POST(mockRequest("localhost:3457", json));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hash: HASH });
    expect(json).toHaveBeenCalledTimes(1);
    expect(privateKeyToAccount).toHaveBeenCalledTimes(1);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("DEV false + E2E true → 404 before signing", async () => {
    process.env.STABLE_CLUB_DEV_ENABLED = "false";
    process.env.STABLE_CLUB_E2E_SIGNING = "true";
    const POST = await loadPost();
    const json = vi.fn(async () => ({ to: "0x22", data: "0x" }));
    const res = await POST(mockRequest("localhost", json));
    expect(res.status).toBe(404);
    expect(json).not.toHaveBeenCalled();
    expect(privateKeyToAccount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("DEV true + E2E unset → 404 before signing", async () => {
    process.env.STABLE_CLUB_DEV_ENABLED = "true";
    delete process.env.STABLE_CLUB_E2E_SIGNING;
    const POST = await loadPost();
    const json = vi.fn(async () => ({ to: "0x22", data: "0x" }));
    const res = await POST(mockRequest("127.0.0.1", json));
    expect(res.status).toBe(404);
    expect(json).not.toHaveBeenCalled();
    expect(privateKeyToAccount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("both true + non-local Host → 404 before signing", async () => {
    process.env.STABLE_CLUB_DEV_ENABLED = "true";
    process.env.STABLE_CLUB_E2E_SIGNING = "true";
    const POST = await loadPost();
    const json = vi.fn(async () => ({ to: "0x22", data: "0x" }));
    const res = await POST(mockRequest("indexla.tech", json));
    expect(res.status).toBe(404);
    expect(json).not.toHaveBeenCalled();
    expect(privateKeyToAccount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("True (wrong case) fails closed before signing", async () => {
    process.env.STABLE_CLUB_DEV_ENABLED = "True";
    process.env.STABLE_CLUB_E2E_SIGNING = "true";
    const POST = await loadPost();
    const json = vi.fn(async () => ({ to: "0x22", data: "0x" }));
    const res = await POST(mockRequest("localhost", json));
    expect(res.status).toBe(404);
    expect(json).not.toHaveBeenCalled();
    expect(privateKeyToAccount).not.toHaveBeenCalled();
  });
});
