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

/**
 * Phantom docs: simulate with sigVerify:false before wallet signing.
 * Failed / unsimulatable txs trigger "This dApp could be malicious".
 */
export async function simulateVersionedTx(
  connection: Connection,
  tx: VersionedTransaction,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config: SimulateTransactionConfig = {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
  };
  try {
    const res = await connection.simulateTransaction(tx, config);
    if (res.value.err) {
      return {
        ok: false,
        error:
          typeof res.value.err === "string"
            ? res.value.err
            : JSON.stringify(res.value.err),
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
