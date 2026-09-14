/** Robinhood Utility Index — direct wallet ownership (eight ERC20s). No vault / xINDEX. */
import type { Address } from "viem";

export const RH_CHAIN_ID = 4663;
export const RH_RPC = "https://rpc.mainnet.chain.robinhood.com";
export const RH_EXPLORER = "https://explorer.mainnet.chain.robinhood.com";

export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address;
export const SWAP_ROUTER02 = "0xCaf681a66D020601342297493863E78C959E5cb2" as Address;
export const V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba" as Address;
export const UNIVERSAL_ROUTER = "0x8876789976decbfcbbbe364623c63652db8c0904" as Address;

/** Gateway that sends basket tokens to msg.sender (user wallet). */
export const GATEWAY_ADDRESS = (
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_INDEXLA_GATEWAY_4663?.trim()) ||
  "0x4660fd35f6e856ed1a959d5261f0e8a132e8e39c"
) as Address;

export const INDEXLA_FEE_BPS = 100;

export const BASKET = [
  {
    symbol: "PONS",
    weightBps: 2200,
    address: "0x39dBED3a2bd333467115dE45665cC57F813C4571" as Address,
    venue: "v3" as const,
    fee: 3000,
  },
  {
    symbol: "UP",
    weightBps: 1800,
    address: "0x57C0E45cB534413D1C20A4240955d6bB250BB4F1" as Address,
    venue: "v3" as const,
    fee: 10000,
  },
  {
    symbol: "PROLOGUE",
    weightBps: 1500,
    address: "0xb9972CA7188e511174947E3936a5315ac7073277" as Address,
    venue: "v4" as const,
    fee: 2500,
    tickSpacing: 25,
  },
  {
    symbol: "RAM",
    weightBps: 1300,
    address: "0x5173D45A1191eE33cBB7D8c7e65f21B04eD54802" as Address,
    venue: "v3" as const,
    fee: 10000,
  },
  {
    symbol: "PRISM",
    weightBps: 1200,
    address: "0x20024E485c0B22b42855589700721b28320A7777" as Address,
    venue: "v2" as const,
    fee: 0,
  },
  {
    symbol: "STONKBROKER",
    weightBps: 800,
    address: "0xe934e36A439C94017B64a3FecE66AF12099aBF50" as Address,
    venue: "v3" as const,
    fee: 3000,
  },
  {
    symbol: "INDEX",
    weightBps: 700,
    address: "0x56910D4409F3a0C78C64DD8D0545FF0705389870" as Address,
    venue: "v3" as const,
    fee: 10000,
  },
  {
    symbol: "HOOKR",
    weightBps: 500,
    address: "0x18E674231A58c239Dc7DaeDcffE15Ec3A24cff5c" as Address,
    venue: "v3" as const,
    fee: 10000,
  },
] as const;

/** Target prompt inventory for wallet UX (atomic batch path). */
export const PROMPT_INVENTORY = {
  buy: 1,
  /** Cold first sell: wallet_sendCalls(approves+exit); target ≤3–4 confirms when atomic works. */
  firstSellColdTarget: 3,
  /** Without atomic batching, plain EOA would need 8 approve + 1 exit = 9. */
  firstSellColdSequential: 9,
  repeatSellWarm: 1,
  maxAllowed: 4,
  note:
    "Buy is 1 confirm. First sell requires atomic wallet_sendCalls for approvals+exit (no sequential fallback). Warm sells are 1 confirm after maxUint256 allowances. ≤3 first-sell is live-verified only with wallet_sendCalls receipts.",
} as const;

export const gatewayAbi = [
  {
    type: "function",
    name: "depositFromEth",
    stateMutability: "payable",
    inputs: [
      {
        name: "v3Legs",
        type: "tuple[]",
        components: [
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "weightBps", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
      {
        name: "v2Legs",
        type: "tuple[]",
        components: [
          { name: "tokenOut", type: "address" },
          { name: "weightBps", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
      {
        name: "v4Legs",
        type: "tuple[]",
        components: [
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
          { name: "weightBps", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "exitPercentToEth",
    stateMutability: "nonpayable",
    inputs: [
      { name: "percentBps", type: "uint256" },
      {
        name: "v3Legs",
        type: "tuple[]",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
      {
        name: "v2Legs",
        type: "tuple[]",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
      {
        name: "v4Legs",
        type: "tuple[]",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
      { name: "minAmountOutEth", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export function buildBuyLegs(minOuts?: Record<string, bigint>) {
  const zero = "0x0000000000000000000000000000000000000000" as Address;
  const m = (sym: string) => minOuts?.[sym] ?? BigInt(0);
  return {
    v3: BASKET.filter((t) => t.venue === "v3").map((t) => ({
      tokenOut: t.address,
      fee: t.fee,
      weightBps: BigInt(t.weightBps),
      amountOutMinimum: m(t.symbol),
    })),
    v2: BASKET.filter((t) => t.venue === "v2").map((t) => ({
      tokenOut: t.address,
      weightBps: BigInt(t.weightBps),
      amountOutMinimum: m(t.symbol),
    })),
    v4: BASKET.filter((t) => t.venue === "v4").map((t) => ({
      tokenOut: t.address,
      fee: t.fee,
      tickSpacing: ("tickSpacing" in t ? t.tickSpacing : 25) as number,
      hooks: zero,
      weightBps: BigInt(t.weightBps),
      amountOutMinimum: m(t.symbol),
    })),
  };
}

export function buildExitLegs(minOuts?: Record<string, bigint>) {
  const zero = "0x0000000000000000000000000000000000000000" as Address;
  const m = (sym: string) => minOuts?.[sym] ?? BigInt(0);
  return {
    v3: BASKET.filter((t) => t.venue === "v3").map((t) => ({
      tokenIn: t.address,
      fee: t.fee,
      amountOutMinimum: m(t.symbol),
    })),
    v2: BASKET.filter((t) => t.venue === "v2").map((t) => ({
      tokenIn: t.address,
      amountOutMinimum: m(t.symbol),
    })),
    v4: BASKET.filter((t) => t.venue === "v4").map((t) => ({
      tokenIn: t.address,
      fee: t.fee,
      tickSpacing: ("tickSpacing" in t ? t.tickSpacing : 25) as number,
      hooks: zero,
      amountOutMinimum: m(t.symbol),
    })),
  };
}
