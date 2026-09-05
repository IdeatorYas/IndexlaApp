import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  STABLE_CLUB_BASE_RPC_PROXY_PATH,
  STABLE_CLUB_RPC_UNAVAILABLE_USER_MESSAGE,
  formatStableClubRpcUserError,
  isRpcRateLimitError,
  resolveStableClubBaseReadRpcUrls,
  resolveStableClubBaseRpcProxyUrl,
} from "@/lib/stable-club/base-rpc-client";
import {
  clearClFivePoolPermit2AllowanceDedupeForTests,
  dedupeClFivePoolPermit2AllowanceRead,
  readClFivePoolPermit2AllowancesWithRpcGuard,
  withStableClubRpcRetryBackoff,
} from "@/lib/stable-club/permit2-allowance-rpc";
import type { ClFivePoolPermit2LiveAllowances } from "@/lib/stable-club/five-pool-permit2";

const sampleAllowances = (): ClFivePoolPermit2LiveAllowances => ({
  erc20AllowanceToPermit2: BigInt(20_000_000),
  permit2AmountToExecutor: BigInt(20_000_000),
  permit2ExpirationToExecutor: 2_000_000_000,
});

describe("base-rpc-client", () => {
  it("resolves same-origin proxy and excludes mainnet.base.org", () => {
    expect(resolveStableClubBaseRpcProxyUrl("https://app.indexla.tech")).toBe(
      `https://app.indexla.tech${STABLE_CLUB_BASE_RPC_PROXY_PATH}`,
    );
    const urls = resolveStableClubBaseReadRpcUrls({
      origin: "https://app.indexla.tech",
      extraFallbacks: [
        "https://mainnet.base.org",
        "https://example-fallback.rpc/base",
      ],
    });
    expect(urls[0]).toBe(`https://app.indexla.tech${STABLE_CLUB_BASE_RPC_PROXY_PATH}`);
    expect(urls).toContain("https://example-fallback.rpc/base");
    expect(urls.every((u) => !/mainnet\.base\.org/i.test(u))).toBe(true);
  });

  it("maps rate-limit errors to the friendly user message", () => {
    expect(isRpcRateLimitError(new Error("429 Too Many Requests"))).toBe(true);
    expect(isRpcRateLimitError(new Error("call rate limit exceeded"))).toBe(true);
    expect(formatStableClubRpcUserError(new Error("429"))).toBe(
      STABLE_CLUB_RPC_UNAVAILABLE_USER_MESSAGE,
    );
  });
});

describe("permit2-allowance-rpc", () => {
  beforeEach(() => {
    clearClFivePoolPermit2AllowanceDedupeForTests();
  });

  it("dedupes concurrent identical allowance reads", async () => {
    let calls = 0;
    const factory = () => {
      calls += 1;
      return new Promise<ClFivePoolPermit2LiveAllowances>((resolve) => {
        setTimeout(() => resolve(sampleAllowances()), 20);
      });
    };
    const [a, b] = await Promise.all([
      dedupeClFivePoolPermit2AllowanceRead("k1", factory),
      dedupeClFivePoolPermit2AllowanceRead("k1", factory),
    ]);
    expect(calls).toBe(1);
    expect(a).toEqual(b);
  });

  it("retries rate-limit then succeeds", async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const result = await withStableClubRpcRetryBackoff(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("429 rate limit exceeded");
        return "ok";
      },
      { maxAttempts: 4, baseDelayMs: 10, sleep },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenCalled();
  });

  it("surfaces friendly error after exhausting retries", async () => {
    const sleep = vi.fn(async () => undefined);
    await expect(
      withStableClubRpcRetryBackoff(
        async () => {
          throw new Error("Too Many Requests");
        },
        { maxAttempts: 3, baseDelayMs: 1, sleep },
      ),
    ).rejects.toThrow(STABLE_CLUB_RPC_UNAVAILABLE_USER_MESSAGE);
  });

  it("does not rewrite non-retryable errors", async () => {
    await expect(
      withStableClubRpcRetryBackoff(async () => {
        throw new Error("AllowanceExpired");
      }),
    ).rejects.toThrow("AllowanceExpired");
  });

  it("guards read with dedupe + retry", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const p = readClFivePoolPermit2AllowancesWithRpcGuard({
      owner: "0xAbCd",
      token: "0x1111",
      permit2: "0x2222",
      clExecutor: "0x3333",
      sleep,
      maxAttempts: 2,
      baseDelayMs: 1,
      readAllowances: async () => {
        calls += 1;
        return sampleAllowances();
      },
    });
    const q = readClFivePoolPermit2AllowancesWithRpcGuard({
      owner: "0xabcd",
      token: "0x1111",
      permit2: "0x2222",
      clExecutor: "0x3333",
      sleep,
      maxAttempts: 2,
      baseDelayMs: 1,
      readAllowances: async () => {
        calls += 1;
        return sampleAllowances();
      },
    });
    const [a, b] = await Promise.all([p, q]);
    expect(calls).toBe(1);
    expect(a.permit2AmountToExecutor).toBe(b.permit2AmountToExecutor);
  });
});
