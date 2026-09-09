/**
 * Pin recover reads to a confirmed block — viem fallback() RPCs can lag and
 * undersell residue (live: sold 4879 instead of true 6066).
 */
export const STALE_READ_RPC_MESSAGE =
  "Base RPC is behind your confirmed transaction, so residue amounts would be stale. Wait a few seconds and tap Resume incomplete withdraw.";

export function maxBlock(
  a: bigint | null | undefined,
  b: bigint | null | undefined,
): bigint {
  const x = a ?? BigInt(0);
  const y = b ?? BigInt(0);
  return x > y ? x : y;
}

export async function waitForReadClientBlock(params: {
  client: { getBlockNumber: (args?: { cacheTime?: number }) => Promise<bigint> };
  minBlock: bigint;
  attempts?: number;
  delayMs?: number;
}): Promise<bigint> {
  if (params.minBlock <= BigInt(0)) {
    return params.client.getBlockNumber({ cacheTime: 0 });
  }
  const attempts = params.attempts ?? 40;
  const delayMs = params.delayMs ?? 500;
  let head = BigInt(0);
  for (let i = 0; i < attempts; i += 1) {
    try {
      head = await params.client.getBlockNumber({ cacheTime: 0 });
      if (head >= params.minBlock) return head;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `${STALE_READ_RPC_MESSAGE} (head ${head.toString()} < ${params.minBlock.toString()})`,
  );
}
