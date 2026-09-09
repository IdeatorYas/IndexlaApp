/**
 * Uniswap V3 / Aerodrome Slipstream ERC721Permit helpers.
 *
 * Withdraw must NOT use ERC721.approve (selector 0x095ea7b3) — wallets mislabel that
 * as “approves ERC20 tokens to an unverified contract.” Use permit (0x7ac2ff7b) instead.
 * Adapters already accept getApproved(tokenId) == adapter after permit lands.
 */
import {
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";

/** Shared by Uni V3 + Slipstream NPM — keccak256("Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)") */
export const NPM_PERMIT_TYPEHASH =
  "0x49ecf333e5b8c95c40fdafc95c1ad136e8914a8fb55e9dc8bb01eaa83a2df9ad" as const;

/** ERC721.permit — distinct from ERC20/ERC721 approve (0x095ea7b3). */
export const NPM_PERMIT_SELECTOR = "0x7ac2ff7b" as const;

export const APPROVE_SELECTOR = "0x095ea7b3" as const;

export const npmErc721PermitAbi = [
  {
    type: "function",
    name: "permit",
    stateMutability: "payable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "getApproved",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

/** Uni V3 + Aero positions() — first field is the ERC721Permit nonce. */
export const npmPositionsNonceAbi = [
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "feeOrTickSpacing", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

/** Known Base NPM EIP-712 domains (matched to on-chain DOMAIN_SEPARATOR). */
export const BASE_NPM_PERMIT_DOMAINS: Readonly<
  Record<string, { name: string; version: string }>
> = {
  "0x03a520b32c04bf3beef7beb72e919cf822ed34f1": {
    name: "Uniswap V3 Positions NFT-V1",
    version: "1",
  },
  "0x827922686190790b37229fd06084350e74485b72": {
    name: "Slipstream Position NFT v1",
    version: "1",
  },
  "0xe1f8cd9ac4e4a65f54f38a5cdafca44f6dd68b53": {
    name: "Slipstream Position NFT v1",
    version: "1",
  },
};

export const NPM_PERMIT_TYPES = {
  Permit: [
    { name: "spender", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function resolveNpmPermitDomain(params: {
  npm: Address;
  chainId: number;
}): {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
} {
  const npm = getAddress(params.npm);
  const meta = BASE_NPM_PERMIT_DOMAINS[npm.toLowerCase()];
  if (!meta) {
    throw new Error(`No ERC721Permit EIP-712 domain for NPM ${npm}`);
  }
  return {
    name: meta.name,
    version: meta.version,
    chainId: params.chainId,
    verifyingContract: npm,
  };
}

export function assertNotApproveSelector(data: Hex): void {
  if (data.slice(0, 10).toLowerCase() === APPROVE_SELECTOR) {
    throw new Error(
      "Forbidden: ERC721/ERC20 approve selector 0x095ea7b3 triggers wallet ERC20-unverified warnings. Use NPM permit.",
    );
  }
}

export function splitPermitSignature(signature: Hex): {
  v: number;
  r: Hex;
  s: Hex;
} {
  const sig = signature.toLowerCase().replace(/^0x/, "");
  if (sig.length !== 130) {
    throw new Error(`Invalid permit signature length ${sig.length}`);
  }
  const r = `0x${sig.slice(0, 64)}` as Hex;
  const s = `0x${sig.slice(64, 128)}` as Hex;
  let v = parseInt(sig.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}

export function encodeNpmPermitCalldata(params: {
  spender: Address;
  tokenId: bigint;
  deadline: bigint;
  v: number;
  r: Hex;
  s: Hex;
}): Hex {
  const data = encodeFunctionData({
    abi: npmErc721PermitAbi,
    functionName: "permit",
    args: [
      getAddress(params.spender),
      params.tokenId,
      params.deadline,
      params.v,
      params.r,
      params.s,
    ],
  });
  assertNotApproveSelector(data);
  if (data.slice(0, 10).toLowerCase() !== NPM_PERMIT_SELECTOR) {
    throw new Error(`Unexpected permit selector ${data.slice(0, 10)}`);
  }
  return data;
}

export function buildNpmPermitTypedData(params: {
  npm: Address;
  chainId: number;
  spender: Address;
  tokenId: bigint;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: resolveNpmPermitDomain({ npm: params.npm, chainId: params.chainId }),
    types: NPM_PERMIT_TYPES,
    primaryType: "Permit" as const,
    message: {
      spender: getAddress(params.spender),
      tokenId: params.tokenId,
      nonce: params.nonce,
      deadline: params.deadline,
    },
  };
}

/** Default permit validity window (seconds). */
export const DEFAULT_NPM_PERMIT_TTL_SEC = 20 * 60;

/**
 * Sign EIP-712 ERC721Permit and build the on-chain permit tx (never approve).
 */
export async function signAndBuildNpmPermitTx(params: {
  walletClient: Pick<WalletClient, "signTypedData" | "account">;
  npm: Address;
  chainId: number;
  spender: Address;
  tokenId: bigint;
  nonce: bigint;
  deadline?: bigint;
  account: Address;
}): Promise<{
  to: Address;
  data: Hex;
  value: bigint;
  deadline: bigint;
  selector: typeof NPM_PERMIT_SELECTOR;
}> {
  const deadline =
    params.deadline ??
    BigInt(Math.floor(Date.now() / 1000) + DEFAULT_NPM_PERMIT_TTL_SEC);
  const typed = buildNpmPermitTypedData({
    npm: params.npm,
    chainId: params.chainId,
    spender: params.spender,
    tokenId: params.tokenId,
    nonce: params.nonce,
    deadline,
  });
  const signature = await params.walletClient.signTypedData({
    account: params.account,
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
  });
  const { v, r, s } = splitPermitSignature(signature);
  const data = encodeNpmPermitCalldata({
    spender: params.spender,
    tokenId: params.tokenId,
    deadline,
    v,
    r,
    s,
  });
  return {
    to: getAddress(params.npm),
    data,
    value: BigInt(0),
    deadline,
    selector: NPM_PERMIT_SELECTOR,
  };
}
