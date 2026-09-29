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

/**
 * Fast gate between sibling sends that share a WSOL ATA write-lock.
 * Returns as soon as the sig is processed/confirmed/failed, or timeout.
 * Does NOT wait for full confirmed — keeps shared blockhash alive.
 */
export async function waitSignatureProcessed(
  connection: Connection,
  signature: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<"processed" | "confirmed" | "failed" | "timeout"> {
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const pollMs = opts.pollMs ?? 400;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const statuses = await withRpcRetry(() =>
        connection.getSignatureStatuses([signature], {
          searchTransactionHistory: false,
        }),
      );
      const st = statuses.value[0];
      if (st?.err) return "failed";
      if (
        st?.confirmationStatus === "processed" ||
        st?.confirmationStatus === "confirmed" ||
        st?.confirmationStatus === "finalized"
      ) {
        return st.confirmationStatus === "processed"
          ? "processed"
          : "confirmed";
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return "timeout";
}

/**
 * Confirm with periodic rebroadcast — sibling WSOL-lock drops need re-send
 * until the prior leg frees the ATA or the blockhash dies.
 */
export async function confirmWithRebroadcast(
  connection: Connection,
  signature: string,
  raw: Uint8Array,
  opts: {
    blockhash: string;
    lastValidBlockHeight: number;
    timeoutMs?: number;
    pollMs?: number;
    rebroadcastMs?: number;
  },
): Promise<ConfirmOutcome> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const pollMs = opts.pollMs ?? 1_200;
  const rebroadcastMs = opts.rebroadcastMs ?? 2_000;
  const started = Date.now();
  let lastBroadcast = 0;

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
        connection.isBlockhashValid(opts.blockhash, {
          commitment: "confirmed",
        }),
      );
      if (!valid.value) {
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

      // Rebroadcast while still pending — recovers WSOL write-lock drops.
      if (Date.now() - lastBroadcast >= rebroadcastMs) {
        lastBroadcast = Date.now();
        try {
          await connection.sendRawTransaction(raw, {
            skipPreflight: true,
            maxRetries: 0,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/already.*(process|been)|duplicate|node is behind/i.test(msg)) {
            /* keep polling — may still land */
          }
        }
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return confirmSignatureHttp(connection, signature, {
    blockhash: opts.blockhash,
    lastValidBlockHeight: opts.lastValidBlockHeight,
    timeoutMs: 5_000,
    pollMs: 800,
  });
}
