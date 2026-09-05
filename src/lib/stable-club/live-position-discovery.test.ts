/**
 * Live discovery for wallet 0xab4e… after deposit 0x87f01652…
 * Read-only — ERC721Enumerable (not eth_getLogs) against Base RPC.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import {
  concentratedLiquidityAdapterAbi,
  strategyPermissionRegistryAbi,
} from "@/lib/stable-club/abis";
import {
  aeroFactoryGetPoolAbi,
  aeroNpmPositionsAbi,
  collectOwnedNftTokenIds,
  erc721EnumerableAbi,
  exactPoolBindingExpectations,
  matchExactPoolMintTokenId,
  positionNftClaimKey,
  uniV3FactoryGetPoolAbi,
  uniV3NpmPositionsAbi,
  type NpmPositionIdentity,
  type StrategyLegBinding,
} from "@/lib/stable-club/five-pool-positions";
import { FIVE_POOL_LEG_COUNT } from "@/lib/stable-club/five-pool-strategy";
import { TRUSTED_PHASE2A_BASE_DEPLOYMENTS } from "@/lib/stable-club/trusted-phase2a-base-manifest";

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
mkdirSync(resolve("tmp"), { recursive: true });

const WALLET = getAddress("0xab4e242C5b489e8301408C93003903364214559F");
const DEPOSIT_TX =
  "0x87f01652b3716c94be2f1cdb9bb0a9a4c6c2559c57b65a5b27ae884e51970d7b" as Hex;
const EXPECTED_TOKEN_IDS = [
  "76466908",
  "5941416",
  "5579119",
  "76466909",
  "5941417",
] as const;
const hasRpc = Boolean(process.env.BASE_RPC_URL?.trim());

describe.runIf(hasRpc)("live wallet five-pool position discovery (0x87f01652)", () => {
  it("discovers all five minted NFTs via ERC721Enumerable", async () => {
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL),
    });
    const d = TRUSTED_PHASE2A_BASE_DEPLOYMENTS;

    const receipt = await client.getTransactionReceipt({ hash: DEPOSIT_TX });
    expect(receipt.status).toBe("success");

    const sid = await client.readContract({
      address: d.strategyRegistry,
      abi: strategyPermissionRegistryAbi,
      functionName: "strategyIdFor",
      args: [WALLET, BigInt(8453), d.usdc],
    });
    const strategy = (await client.readContract({
      address: d.strategyRegistry,
      abi: strategyPermissionRegistryAbi,
      functionName: "getStrategy",
      args: [sid],
    })) as { user: Address };
    expect(strategy.user.toLowerCase()).toBe(WALLET.toLowerCase());

    const claimedTokenIds = new Set<string>();
    const discovered: { legIndex: number; tokenId: string; npm: string }[] = [];

    for (let legIndex = 0; legIndex < FIVE_POOL_LEG_COUNT; legIndex++) {
      const leg = (await client.readContract({
        address: d.strategyRegistry,
        abi: strategyPermissionRegistryAbi,
        functionName: "getLeg",
        args: [sid, BigInt(legIndex)],
      })) as StrategyLegBinding;
      const adapterMeta = d.adapters.find(
        (a) => a.adapter.toLowerCase() === leg.adapter.toLowerCase(),
      );
      expect(adapterMeta).toBeTruthy();
      const binding = exactPoolBindingExpectations(leg.poolId);
      expect(binding).toBeTruthy();
      const nftContract = adapterMeta!.npm;
      const candidates = await collectOwnedNftTokenIds({
        owner: WALLET,
        balanceOf: (owner) =>
          client.readContract({
            address: nftContract,
            abi: erc721EnumerableAbi,
            functionName: "balanceOf",
            args: [owner],
          }),
        tokenOfOwnerByIndex: (owner, index) =>
          client.readContract({
            address: nftContract,
            abi: erc721EnumerableAbi,
            functionName: "tokenOfOwnerByIndex",
            args: [owner, index],
          }),
      });
      const isUni =
        binding!.protocol === "uniswap-v3" || binding!.protocol === "uniswap";
      const isAero =
        binding!.protocol === "aerodrome-slipstream" ||
        binding!.protocol === "aerodrome";

      const tokenId = await matchExactPoolMintTokenId({
        candidates,
        user: WALLET,
        expectedTokenA: leg.tokenA,
        expectedTokenB: leg.tokenB,
        protocol: binding!.protocol,
        expectedPool: binding!.expectedPool,
        factory: binding!.factory,
        nftContract,
        expectedFee: binding!.expectedFee,
        expectedTickSpacing: binding!.expectedTickSpacing,
        claimedTokenIds,
        readOwner: (id) =>
          client.readContract({
            address: adapterMeta!.adapter,
            abi: concentratedLiquidityAdapterAbi,
            functionName: "ownerOf",
            args: [id],
          }),
        readNpmPosition: async (id): Promise<NpmPositionIdentity> => {
          if (isUni) {
            const pos = await client.readContract({
              address: adapterMeta!.npm,
              abi: uniV3NpmPositionsAbi,
              functionName: "positions",
              args: [id],
            });
            return {
              token0: pos[2],
              token1: pos[3],
              fee: Number(pos[4]),
              liquidity: BigInt(pos[7]),
            };
          }
          if (isAero) {
            const pos = await client.readContract({
              address: adapterMeta!.npm,
              abi: aeroNpmPositionsAbi,
              functionName: "positions",
              args: [id],
            });
            return {
              token0: pos[2],
              token1: pos[3],
              tickSpacing: Number(pos[4]),
              liquidity: BigInt(pos[7]),
            };
          }
          throw new Error("unsupported");
        },
        resolveFactoryPool: async ({ token0, token1, fee, tickSpacing }) => {
          if (isUni && fee != null) {
            return client.readContract({
              address: binding!.factory,
              abi: uniV3FactoryGetPoolAbi,
              functionName: "getPool",
              args: [token0, token1, fee],
            });
          }
          if (isAero && tickSpacing != null) {
            return client.readContract({
              address: binding!.factory,
              abi: aeroFactoryGetPoolAbi,
              functionName: "getPool",
              args: [token0, token1, tickSpacing],
            });
          }
          throw new Error("factory");
        },
        readAmounts: (id) =>
          client.readContract({
            address: adapterMeta!.adapter,
            abi: concentratedLiquidityAdapterAbi,
            functionName: "positionAmounts",
            args: [id],
          }),
      });

      expect(tokenId).not.toBeNull();
      claimedTokenIds.add(positionNftClaimKey(nftContract, tokenId!));
      discovered.push({
        legIndex,
        tokenId: tokenId!.toString(),
        npm: nftContract,
      });
    }

    writeFileSync(
      resolve("tmp/live-position-discovery.json"),
      JSON.stringify(
        {
          wallet: WALLET,
          depositTx: DEPOSIT_TX,
          strategyId: sid,
          discovered,
          expectedTokenIds: EXPECTED_TOKEN_IDS,
        },
        null,
        2,
      ),
    );

    expect(discovered).toHaveLength(5);
    const ids = discovered.map((x) => x.tokenId).sort();
    expect(ids).toEqual([...EXPECTED_TOKEN_IDS].sort());
  }, 180_000);
});
