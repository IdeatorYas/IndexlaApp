/**
 * Regression: Base deposit 0x5bab6b53… reverted after wallet used raw
 * eth_estimateGas gasLimit=6221050 (ignored app 10M floor). Read-only.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPublicClient, http, type Hex } from "viem";
import { base } from "viem/chains";
import {
  DEPOSIT_FIVE_POOL_STRATEGY_SELECTOR,
  FIVE_POOL_DEPOSIT_GAS_FLOOR,
  FIVE_POOL_DEPOSIT_OOG_USER_MESSAGE,
  applyFivePoolDepositGasBuffer,
  isDepositFivePoolStrategyCalldata,
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
  "0x5bab6b53a41cc50a3a5880b3424084ed43ccf972dcff58a839c16981a98d4764" as Hex;
const hasRpc = Boolean(process.env.BASE_RPC_URL?.trim());

describe.runIf(hasRpc)("failed live deposit OOG regression (0x5bab6b53)", () => {
  it("confirms wallet-substituted estimate OOG; buffer floors to 10M", async () => {
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL),
    });
    const receipt = await client.getTransactionReceipt({ hash: TX });
    const tx = await client.getTransaction({ hash: TX });

    expect(receipt.status).toBe("reverted");
    expect(tx.gas).toBe(BigInt(6_221_050));
    expect(isDepositFivePoolStrategyCalldata(tx.input)).toBe(true);
    expect(tx.input.toLowerCase().startsWith(DEPOSIT_FIVE_POOL_STRATEGY_SELECTOR)).toBe(
      true,
    );
    expect(
      isOutOfGasReceipt({
        status: receipt.status,
        gasLimit: tx.gas,
        gasUsed: receipt.gasUsed,
      }),
    ).toBe(true);

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

    const buffered = requireFivePoolDepositGasLimit(
      applyFivePoolDepositGasBuffer(tx.gas),
    );
    expect(buffered).toBe(FIVE_POOL_DEPOSIT_GAS_FLOOR);
    expect(buffered).toBeGreaterThan(tx.gas);
  }, 120_000);
});
