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
  // MessageV0 / legacy Message expose recentBlockhash; assign before any signature.
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

export function isRetryableSimError(error: string): boolean {
  return /429|rate limit|503|502|504|ECONNRESET|ETIMEDOUT|fetch failed|timeout|blockhash not found/i.test(
    error,
  );
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
      const error =
        typeof res.value.err === "string"
          ? res.value.err
          : JSON.stringify(res.value.err);
      return { ok: false, error, retryable: false };
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

/** Simulate with bounded retries on RPC/transport failures only. */
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
