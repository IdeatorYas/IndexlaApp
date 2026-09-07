/**
 * Regression: Base deposit 0xac64ff1b… reverted OOG after wallet substituted ~6.56M gas
 * (app floor is 10M). Read-only — eth_call only, no broadcast.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import {
  FIVE_POOL_DEPOSIT_GAS_FLOOR,
  FIVE_POOL_DEPOSIT_OOG_USER_MESSAGE,
  applyFivePoolDepositGasBuffer,
  isOutOfGasReceipt,
  requireFivePoolDepositGasLimit,
} from "@/lib/stable-club/five-pool-deposit-gas";
import {
  assertSuccessfulTransactionReceipt,
  TransactionRevertedError,
} from "@/lib/stable-club/transaction-receipt";

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
  "0xac64ff1b9959ba141c8ec41e406e50a9ef41f86fd58d6d4cae1872dc2852a682" as Hex;
const hasRpc = Boolean(process.env.BASE_RPC_URL?.trim());

describe.runIf(hasRpc)("failed live deposit OOG regression (0xac64ff1b)", () => {
  it("confirms mined-gas OOG fingerprint; eth_call fails at mined gas and succeeds at 10M", async () => {
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

    // Requested 10M would miss OOG — prove mined limit is required
    expect(
      isOutOfGasReceipt({
        status: receipt.status,
        gasLimit: FIVE_POOL_DEPOSIT_GAS_FLOOR,
        gasUsed: receipt.gasUsed,
      }),
    ).toBe(false);

    try {
      assertSuccessfulTransactionReceipt(
        { status: "reverted", gasUsed: receipt.gasUsed, transactionHash: TX },
        TX,
        { gasLimit: FIVE_POOL_DEPOSIT_GAS_FLOOR, minedGasLimit: tx.gas },
      );
      expect.unreachable("expected OOG TransactionRevertedError");
    } catch (err) {
      expect(err).toBeInstanceOf(TransactionRevertedError);
      expect((err as Error).message).toBe(FIVE_POOL_DEPOSIT_OOG_USER_MESSAGE);
    }

    const impliedEstimate = (tx.gas * BigInt(10_000)) / BigInt(14_000);
    const buffered = requireFivePoolDepositGasLimit(
      applyFivePoolDepositGasBuffer(impliedEstimate),
    );
    expect(buffered).toBeGreaterThanOrEqual(FIVE_POOL_DEPOSIT_GAS_FLOOR);
    expect(buffered).toBeGreaterThan(tx.gas);

    await expect(
      client.call({
        account: tx.from,
        to: tx.to!,
        data: tx.input,
        value: tx.value,
        blockNumber: tx.blockNumber! - BigInt(1),
        gas: tx.gas,
      }),
    ).rejects.toThrow();

    await client.call({
      account: tx.from,
      to: tx.to!,
      data: tx.input,
      value: tx.value,
      blockNumber: tx.blockNumber! - BigInt(1),
      gas: FIVE_POOL_DEPOSIT_GAS_FLOOR,
    });
  }, 120_000);
});
