import {
  Connection,
  VersionedTransaction,
  type SimulateTransactionConfig,
} from "@solana/web3.js";

/**
 * Overwrite Jupiter's pre-stamped (already aging) blockhash before signing.
 * Must run pre-signature only — mutating after sign invalidates the tx.
 */
export function restampVersionedTx(
  tx: VersionedTransaction,
  blockhash: string,
): VersionedTransaction {
  const message = tx.message as { recentBlockhash: string };
  message.recentBlockhash = blockhash;
  return tx;
}

export function decodeSwapTxBase64(base64: string): VersionedTransaction {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return VersionedTransaction.deserialize(bytes);
}

export function isBlockhashNotFoundError(error: string): boolean {
  return /blockhashnotfound|blockhash not found|BlockhashNotFound/i.test(error);
}

export function isRetryableSimError(error: string): boolean {
  return (
    isBlockhashNotFoundError(error) ||
    /429|rate limit|503|502|504|ECONNRESET|ETIMEDOUT|fetch failed|timeout/i.test(
      error,
    )
  );
}

function formatSimErr(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    // Solana often returns { BlockhashNotFound: null } or InstructionError
    const keys = Object.keys(err as object);
    if (keys.length === 1 && keys[0]) return keys[0];
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Phantom docs: simulate with sigVerify:false before wallet signing.
 * Failed / unsimulatable txs trigger "This dApp could be malicious".
 */
export async function simulateVersionedTx(
  connection: Connection,
  tx: VersionedTransaction,
): Promise<
  { ok: true } | { ok: false; error: string; retryable?: boolean }
> {
  const config: SimulateTransactionConfig = {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
  };
  try {
    const res = await connection.simulateTransaction(tx, config);
    if (res.value.err) {
      const error = formatSimErr(res.value.err);
      return {
        ok: false,
        error,
        retryable: isRetryableSimError(error),
      };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error,
      retryable: isRetryableSimError(error),
    };
  }
}

/** Simulate with bounded retries on RPC/transport / BlockhashNotFound only. */
export async function simulateVersionedTxWithRetry(
  connection: Connection,
  tx: VersionedTransaction,
  attempts = 4,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let last = "simulation failed";
  for (let i = 0; i < attempts; i += 1) {
    const sim = await simulateVersionedTx(connection, tx);
    if (sim.ok) return sim;
    last = sim.error;
    if (!sim.retryable || i === attempts - 1) {
      return { ok: false, error: last };
    }
    await new Promise((r) =>
      setTimeout(r, Math.min(8_000, 400 * 2 ** i)),
    );
  }
  return { ok: false, error: last };
}

export type FreshBlockhash = {
  blockhash: string;
  lastValidBlockHeight: number;
};

/**
 * Restamp with a fresh blockhash from the same Connection (RPC proxy),
 * simulate, and on BlockhashNotFound re-fetch + restamp + re-sim.
 * Returns the restamped tx ready for signing (same RPC path as sim).
 */
export async function restampSimulateFresh(
  connection: Connection,
  swapTransactionBase64: string,
  opts?: { attempts?: number },
): Promise<
  | {
      ok: true;
      tx: VersionedTransaction;
      blockhash: string;
      lastValidBlockHeight: number;
    }
  | { ok: false; error: string }
> {
  const attempts = opts?.attempts ?? 4;
  let last = "simulation failed";

  for (let i = 0; i < attempts; i += 1) {
    let latest: FreshBlockhash;
    try {
      latest = await connection.getLatestBlockhash("confirmed");
    } catch (bhErr) {
      last =
        bhErr instanceof Error
          ? `Blockhash fetch failed: ${bhErr.message}`
          : String(bhErr);
      if (i === attempts - 1) return { ok: false, error: last };
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      continue;
    }

    const tx = restampVersionedTx(
      decodeSwapTxBase64(swapTransactionBase64),
      latest.blockhash,
    );
    const sim = await simulateVersionedTx(connection, tx);
    if (sim.ok) {
      return {
        ok: true,
        tx,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      };
    }
    last = sim.error;
    // BlockhashNotFound / transport → loop with a brand-new blockhash.
    if (!sim.retryable || i === attempts - 1) {
      return { ok: false, error: last };
    }
    await new Promise((r) =>
      setTimeout(r, Math.min(4_000, 250 * 2 ** i)),
    );
  }
  return { ok: false, error: last };
}
