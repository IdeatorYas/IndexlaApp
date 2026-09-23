/**
 * Temporary Phantom Mobile binary diagnostics — NO production withdraw changes.
 * Identifies session vs WC vs gateway calldata/sim vs contract-risk blocking.
 */
import {
  encodeFunctionData,
  getAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
} from "viem";
import { encodeGatewayExitPercentToUsdcCall } from "@/lib/stable-club/ops-gateway";
import { listCatalogueMatchedOpenPositions } from "@/lib/stable-club/list-open-owner-npm-positions";
import { applyGatewayExitGasBuffer } from "@/lib/stable-club/gateway-exit-gas";
import { discoverEip6963Providers } from "@/lib/wallet/eip6963-wallets";

const UNI_FEE_005 = 500;
const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export type DiagProviderKind = "appkit" | "injected-phantom" | "injected-ethereum" | "none";

export type DiagSendResult = {
  ok: boolean;
  hash: Hex | null;
  code: number | string | null;
  message: string;
  nested: string;
  elapsedMs: number;
  providerKind: DiagProviderKind;
  txSummary: string;
};

export function serializeProviderError(err: unknown): {
  code: number | string | null;
  message: string;
  nested: string;
} {
  if (err == null) {
    return { code: null, message: "null error", nested: "" };
  }
  const e = err as Record<string, unknown>;
  const code =
    typeof e.code === "number" || typeof e.code === "string" ? e.code : null;
  const message =
    typeof e.message === "string"
      ? e.message
      : typeof e.shortMessage === "string"
        ? e.shortMessage
        : String(err);
  const parts: string[] = [];
  const push = (label: string, v: unknown) => {
    if (v == null) return;
    try {
      parts.push(`${label}=${typeof v === "string" ? v : JSON.stringify(v)}`);
    } catch {
      parts.push(`${label}=[unserializable]`);
    }
  };
  push("name", e.name);
  push("code", e.code);
  push("data", e.data);
  push("cause", e.cause);
  push("details", e.details);
  push("metaMessages", e.metaMessages);
  push("walk", e.walk);
  if (e.cause && typeof e.cause === "object") {
    const c = e.cause as Record<string, unknown>;
    push("cause.code", c.code);
    push("cause.message", c.message);
    push("cause.data", c.data);
  }
  return { code, message, nested: parts.join(" | ").slice(0, 1200) };
}

export function resolveInjectedPhantomProvider(): {
  provider: EIP1193Provider | null;
  kind: DiagProviderKind;
  label: string;
} {
  if (typeof window === "undefined") {
    return { provider: null, kind: "none", label: "ssr" };
  }
  const w = window as Window & {
    ethereum?: EIP1193Provider & {
      isPhantom?: boolean;
      providers?: Array<EIP1193Provider & { isPhantom?: boolean }>;
    };
    phantom?: { ethereum?: EIP1193Provider };
  };
  if (w.phantom?.ethereum) {
    return {
      provider: w.phantom.ethereum,
      kind: "injected-phantom",
      label: "window.phantom.ethereum",
    };
  }
  const announced = discoverEip6963Providers().find(
    (d) => d.info.rdns.toLowerCase() === "app.phantom",
  );
  if (announced?.provider) {
    return {
      provider: announced.provider,
      kind: "injected-phantom",
      label: `eip6963:${announced.info.name}`,
    };
  }
  const eth = w.ethereum;
  if (eth?.isPhantom) {
    return {
      provider: eth,
      kind: "injected-phantom",
      label: "window.ethereum(isPhantom)",
    };
  }
  const nested = eth?.providers?.find((p) => p.isPhantom);
  if (nested) {
    return {
      provider: nested,
      kind: "injected-phantom",
      label: "window.ethereum.providers[phantom]",
    };
  }
  if (eth) {
    return {
      provider: eth,
      kind: "injected-ethereum",
      label: "window.ethereum",
    };
  }
  return { provider: null, kind: "none", label: "no injected provider" };
}

export async function diagProviderSnapshot(
  provider: EIP1193Provider | null,
): Promise<string> {
  if (!provider) return "provider=null";
  try {
    const [accounts, chainId] = await Promise.all([
      provider.request({ method: "eth_accounts" }) as Promise<string[]>,
      provider.request({ method: "eth_chainId" }) as Promise<string>,
    ]);
    return `accounts=${(accounts ?? []).join(",") || "(empty)"} chainId=${chainId}`;
  } catch (e) {
    const s = serializeProviderError(e);
    return `snapshot_fail code=${s.code} msg=${s.message}`;
  }
}

async function sendRaw(
  provider: EIP1193Provider,
  kind: DiagProviderKind,
  tx: Record<string, unknown>,
): Promise<DiagSendResult> {
  const started = Date.now();
  const txSummary = [
    tx.from != null ? `from=${String(tx.from).slice(0, 12)}…` : null,
    tx.to != null ? `to=${String(tx.to).slice(0, 12)}…` : null,
    tx.data != null
      ? `sel=${String(tx.data).slice(0, 10)} len=${(String(tx.data).length - 2) / 2}`
      : "data=none",
    tx.gas != null ? `gas=${tx.gas}` : null,
    tx.value != null ? `value=${tx.value}` : null,
    tx.chainId != null ? `chainId=${tx.chainId}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  try {
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [tx],
    })) as Hex;
    return {
      ok: true,
      hash,
      code: null,
      message: "broadcast ok",
      nested: "",
      elapsedMs: Date.now() - started,
      providerKind: kind,
      txSummary,
    };
  } catch (err) {
    const s = serializeProviderError(err);
    return {
      ok: false,
      hash: null,
      code: s.code,
      message: s.message,
      nested: s.nested,
      elapsedMs: Date.now() - started,
      providerKind: kind,
      txSummary,
    };
  }
}

/** Test 1 — 1 wei self-transfer (harmless). */
export async function diagSelfTransfer(params: {
  provider: EIP1193Provider;
  kind: DiagProviderKind;
  account: Address;
}): Promise<DiagSendResult> {
  return sendRaw(params.provider, params.kind, {
    from: params.account,
    to: params.account,
    value: "0x1",
    // gas omitted — wallet fills
  });
}

/** Test 2 — USDC.approve(spender, 0) simple contract write. */
export async function diagUsdcApproveZero(params: {
  provider: EIP1193Provider;
  kind: DiagProviderKind;
  account: Address;
  usdc: Address;
  spender: Address;
  publicClient: PublicClient;
}): Promise<DiagSendResult & { httpCallOk: boolean; httpCallErr: string | null }> {
  const data = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [getAddress(params.spender), BigInt(0)],
  });
  let httpCallOk = false;
  let httpCallErr: string | null = null;
  try {
    await params.publicClient.call({
      account: params.account,
      to: getAddress(params.usdc),
      data,
    });
    httpCallOk = true;
  } catch (e) {
    httpCallErr = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
  let gasHex: string | undefined;
  try {
    const g = await params.publicClient.estimateGas({
      account: params.account,
      to: getAddress(params.usdc),
      data,
    });
    gasHex = `0x${g.toString(16)}`;
  } catch {
    // wallet may still estimate
  }
  const result = await sendRaw(params.provider, params.kind, {
    from: params.account,
    to: getAddress(params.usdc),
    data,
    ...(gasHex ? { gas: gasHex } : {}),
  });
  return { ...result, httpCallOk, httpCallErr };
}

export type GatewayExitDiagPrepared = {
  to: Address;
  data: Hex;
  gas: bigint;
  gasHex: `0x${string}`;
  httpCallOk: boolean;
  httpCallErr: string | null;
  estimateErr: string | null;
  tokenId: string;
  npm: Address;
  dataLen: number;
};

/** Build exact chunk-1 exitPercentToUsdc calldata (same shape as production withdraw). */
export async function prepareGatewayExitChunk1(params: {
  publicClient: PublicClient;
  account: Address;
  gateway: Address;
  cbbtc: Address;
  weth: Address;
}): Promise<GatewayExitDiagPrepared> {
  const open = await listCatalogueMatchedOpenPositions({
    publicClient: params.publicClient as never,
    account: params.account,
  });
  if (open.length === 0) {
    throw new Error("No open catalogue LPs — deposit first or pick a funded wallet");
  }
  const first = [...open].sort((a, b) => Number(a.tokenId - b.tokenId))[0]!;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const call = encodeGatewayExitPercentToUsdcCall({
    gateway: getAddress(params.gateway),
    exitLegs: [
      {
        npm: getAddress(first.npm),
        tokenId: first.tokenId,
        liquidity: first.liquidity,
        amount0Min: BigInt(0),
        amount1Min: BigInt(0),
        burnIfEmpty: false,
      },
    ],
    swaps: [
      {
        tokenIn: getAddress(params.cbbtc),
        fee: UNI_FEE_005,
        amountIn: BigInt(0),
        amountOutMinimum: BigInt(1),
      },
      {
        tokenIn: getAddress(params.weth),
        fee: UNI_FEE_005,
        amountIn: BigInt(0),
        amountOutMinimum: BigInt(1),
      },
    ],
    minUsdcOut: BigInt(1),
    deadline,
  });
  let estimateErr: string | null = null;
  let gas = BigInt(800_000);
  try {
    const raw = await params.publicClient.estimateGas({
      account: params.account,
      to: call.to,
      data: call.data,
    });
    gas = applyGatewayExitGasBuffer(raw);
  } catch (e) {
    estimateErr = e instanceof Error ? e.message.slice(0, 240) : String(e);
  }
  let httpCallOk = false;
  let httpCallErr: string | null = null;
  try {
    await params.publicClient.call({
      account: params.account,
      to: call.to,
      data: call.data,
      gas,
    });
    httpCallOk = true;
  } catch (e) {
    httpCallErr = e instanceof Error ? e.message.slice(0, 240) : String(e);
  }
  return {
    to: call.to,
    data: call.data,
    gas,
    gasHex: `0x${gas.toString(16)}` as `0x${string}`,
    httpCallOk,
    httpCallErr,
    estimateErr,
    tokenId: first.tokenId.toString(),
    npm: getAddress(first.npm),
    dataLen: (call.data.length - 2) / 2,
  };
}

/** Test 3/4 — send prepared gateway exit via given provider (no gas wrap). */
export async function diagSendGatewayExit(params: {
  provider: EIP1193Provider;
  kind: DiagProviderKind;
  account: Address;
  prepared: GatewayExitDiagPrepared;
  /** When true, also set chainId 0x2105 (WC often needs it). */
  injectChainId?: boolean;
}): Promise<DiagSendResult> {
  const tx: Record<string, unknown> = {
    from: params.account,
    to: params.prepared.to,
    data: params.prepared.data,
    gas: params.prepared.gasHex,
  };
  if (params.injectChainId) {
    tx.chainId = "0x2105";
  }
  return sendRaw(params.provider, params.kind, tx);
}

export function classifyBinaryMatrix(results: {
  selfTransfer: DiagSendResult | null;
  simpleContract: DiagSendResult | null;
  gatewayAppkit: DiagSendResult | null;
  gatewayInjected: DiagSendResult | null;
  injectedAvailable: boolean;
}): string {
  const a = results.selfTransfer?.ok === true;
  const b = results.simpleContract?.ok === true;
  const c = results.gatewayAppkit?.ok === true;
  const d = results.gatewayInjected?.ok === true;

  if (!a) {
    return "CLASS: Phantom/AppKit SESSION broken (even 1 wei self-transfer fails). Fix session/reconnect before gateway work.";
  }
  if (a && !b) {
    return "CLASS: Provider accepts ETH sends but rejects contract writes (general contract-risk / policy).";
  }
  if (a && b && !c && d) {
    return "CLASS: WalletConnect/AppKit TRANSPORT — injected Phantom broadcast gateway exit; WC path did not. Proven path = injected (or fix WC).";
  }
  if (a && b && !c && !d && results.injectedAvailable) {
    return "CLASS: Gateway calldata / Phantom private-sim / contract-risk on exitPercentToUsdc (both providers reject). Not session.";
  }
  if (a && b && !c && !results.injectedAvailable) {
    return "CLASS: Gateway reject on AppKit provider; no injected Phantom in this browser — cannot split WC vs contract-risk. Retest inside Phantom in-app browser.";
  }
  if (c || d) {
    const path = c && d ? "both AppKit and injected" : c ? "AppKit/WC" : "injected Phantom";
    return `CLASS: PROVEN PATH — gateway exit broadcast via ${path}. Apply only that send path to production withdraw.`;
  }
  return "CLASS: Incomplete — run all four tests.";
}
