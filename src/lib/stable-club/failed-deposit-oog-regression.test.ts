/**
 * Regression: Base deposit 0x1e76759c… reverted OOG at gasLimit≈estimate.
 * Read-only — eth_call / estimateGas only, no broadcast.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import {
  FIVE_POOL_DEPOSIT_GAS_FLOOR,
  applyFivePoolDepositGasBuffer,
  isOutOfGasReceipt,
} from "@/lib/stable-club/five-pool-deposit-gas";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]!]) {
      process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvLocal();

const TX =
  "0x1e76759cd88e68f6ca1ff65aba96a1d1ceeb21b5da033b25dd93847498f0cb21" as Hex;
const hasRpc = Boolean(process.env.BASE_RPC_URL?.trim());

describe.runIf(hasRpc)("failed live deposit OOG regression (0x1e76759c)", () => {
  it("confirms OOG fingerprint and eth_call succeeds with buffered gas", async () => {
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL),
    });
    const receipt = await client.getTransactionReceipt({ hash: TX });
    const tx = await client.getTransaction({ hash: TX });

    expect(receipt.status).toBe("reverted");
    expect(
      isOutOfGasReceipt({
        status: receipt.status,
        gasLimit: tx.gas,
        gasUsed: receipt.gasUsed,
      }),
    ).toBe(true);

    const estimate = await client.estimateGas({
      account: tx.from,
      to: tx.to!,
      data: tx.input,
      value: tx.value,
      blockNumber: receipt.blockNumber - BigInt(1),
    });
    const buffered = applyFivePoolDepositGasBuffer(estimate);
    expect(buffered).toBeGreaterThanOrEqual(FIVE_POOL_DEPOSIT_GAS_FLOOR);
    expect(buffered).toBeGreaterThan(tx.gas);

    await client.call({
      account: tx.from,
      to: tx.to!,
      data: tx.input,
      value: tx.value,
      blockNumber: receipt.blockNumber,
      gas: buffered,
    });
  }, 120_000);
});
