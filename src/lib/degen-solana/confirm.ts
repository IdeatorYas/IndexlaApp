import type { Connection } from "@solana/web3.js";

export type ConfirmOutcome =
  | { status: "confirmed" }
  | { status: "failed"; err: string }
  | { status: "expired" }
  | { status: "pending" };

function isRetryableRpcError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate limit|503|502|504|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
    msg,
  );
}

async function withRpcRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isRetryableRpcError(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw last;
}

/**
 * HTTP-only confirmation — never uses websocket subscriptions.
 * Safe behind `/api/degen-solana/rpc` which has no WS upgrade.
 */
export async function confirmSignatureHttp(
  connection: Connection,
  signature: string,
  opts: {
    blockhash: string;
    lastValidBlockHeight: number;
    timeoutMs?: number;
    pollMs?: number;
  },
): Promise<ConfirmOutcome> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const pollMs = opts.pollMs ?? 1_500;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const statuses = await withRpcRetry(() =>
        connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true,
        }),
      );
      const st = statuses.value[0];
      if (st) {
        if (st.err) {
          return {
            status: "failed",
            err:
              typeof st.err === "string"
                ? st.err
                : JSON.stringify(st.err),
          };
        }
        if (
          st.confirmationStatus === "confirmed" ||
          st.confirmationStatus === "finalized"
        ) {
          return { status: "confirmed" };
        }
      }

      const valid = await withRpcRetry(() =>
        connection.isBlockhashValid(opts.blockhash, { commitment: "confirmed" }),
      );
      if (!valid.value) {
        // Final status check after blockhash invalid — may still have landed.
        const finalStatuses = await withRpcRetry(() =>
          connection.getSignatureStatuses([signature], {
            searchTransactionHistory: true,
          }),
        );
        const fin = finalStatuses.value[0];
        if (fin?.err) {
          return {
            status: "failed",
            err:
              typeof fin.err === "string"
                ? fin.err
                : JSON.stringify(fin.err),
          };
        }
        if (
          fin &&
          (fin.confirmationStatus === "confirmed" ||
            fin.confirmationStatus === "finalized")
        ) {
          return { status: "confirmed" };
        }
        return { status: "expired" };
      }
    } catch (err) {
      if (!isRetryableRpcError(err)) {
        // Transient unknown — keep polling until timeout/blockhash.
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  // Timeout: one last look
  try {
    const statuses = await withRpcRetry(() =>
      connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      }),
    );
    const st = statuses.value[0];
    if (st?.err) {
      return {
        status: "failed",
        err: typeof st.err === "string" ? st.err : JSON.stringify(st.err),
      };
    }
    if (
      st &&
      (st.confirmationStatus === "confirmed" ||
        st.confirmationStatus === "finalized")
    ) {
      return { status: "confirmed" };
    }
  } catch {
    /* ignore */
  }
  return { status: "expired" };
}
