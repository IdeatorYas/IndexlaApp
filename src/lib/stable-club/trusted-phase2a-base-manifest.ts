/**
 * Source-controlled Base Phase 2a trust root — pinned from the verified
 * `deployments/base-mainnet/stable-club-phase2a.deploy-artifact.json` after
 * live Base broadcast (2026-09-04). Addresses and runtime keccak256 hashes
 * are recorded evidence only — do not invent or edit casually.
 *
 * Automation remains disabled; pools are registered on clExecutor but the
 * deploy artifact `poolsActivated` flag stays false.
 */
import type { Address, Hex } from "viem";
import type {
  StableClubPhase2aDeployments,
  TrustedPhase2aBaseManifest,
} from "@/lib/stable-club/phase2a-deployments";

export const TRUSTED_PHASE2A_BASE_MANIFEST = {
  chainId: 8453,
  network: "base",
  isTestOnly: false,
  contracts: {
    permissionRegistry: "0xe7b38db8B3910fd65486e33C684cEB5b0Cb56196",
    strategyRegistry: "0x6052FD15529B9d77aDd7F9C4b45804a7d07BEd83",
    feeRouter: "0x4660Fd35f6e856ED1a959d5261F0E8a132E8E39c",
    swapRouter: "0x46EbaC1c66f1A747084899b61a82Bf5A80E9C3F3",
    clExecutor: "0x1cdE442a760Ddda54087081aF9860471Dc099a9f",
    oracleGuard: "0x77a52E22df013D05dD8b3D758dfDED406FB8e73e",
    mevGuard: "0xA5c23ec5455f83Ea7db78c5Fb5c57fB528ECC3C4",
    safetyController: "0x7d561570da936a5726e233e6f2A7387B9997c9A1",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    cbbtc: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    weth: "0x4200000000000000000000000000000000000006",
    adapters: [
      "0x7E2108d171681741d279570bECA5E64b6e5e1f6a",
      "0x0ef6d46720af642bFA37a288121D94de2204ae37",
      "0xf1899dcb73Ad6D45b69C2870728FBd825B0c8C46",
      "0x449F60915CD4365ee4dDeb070353c8A62B757f12",
      "0x877A080Bbe4f831DfA577936e33972E7c50f09a6",
    ],
  },
  runtimeCodeHashes: {
    "0xe7b38db8b3910fd65486e33c684ceb5b0cb56196":
      "0xd003cf46e4c9eeb9c0ea2051b8aee099ef1ec006c022dca05b35644e739148bc",
    "0x6052fd15529b9d77add7f9c4b45804a7d07bed83":
      "0x8cf621de1c0c7eecb49fb9d5c897d4099f39d276fb143e5e11632cc206ec7c87",
    "0x4660fd35f6e856ed1a959d5261f0e8a132e8e39c":
      "0xabbeafc96fc1f32f6ba7279aaf1980b27eed78746b37665fe1f7ffa1b9ddff37",
    "0x46ebac1c66f1a747084899b61a82bf5a80e9c3f3":
      "0xd7505a04f222bb3c9bebf371b454ce87479b02b09e60eda7e3ed2c05a34223b4",
    "0x1cde442a760ddda54087081af9860471dc099a9f":
      "0x8b997d381f3b6a798cdbef7aa4a7e330795383c681a24217b9f55c44ce294c4b",
    "0x77a52e22df013d05dd8b3d758dfded406fb8e73e":
      "0x72abe7dc9e08714ec8f299076928b564cbc926e1b01b41d3c62a80808e3a7ab9",
    "0xa5c23ec5455f83ea7db78c5fb5c57fb528ecc3c4":
      "0x9f69e05677f1f7e62f20b3f0ebdc19a68c06900e81326860ee3311ed30065c5d",
    "0x7d561570da936a5726e233e6f2a7387b9997c9a1":
      "0x49ab1c096c22d49aff99cd35c73d3ace9b056b337c12b7296309a50ffc542ead",
    "0x000000000022d473030f116ddee9f6b43ac78ba3":
      "0xa67739abc3ede9dbdc0491636c67d6a14ac07fab9030c3f509b1eb7b11dff8ed",
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":
      "0xa6705a10bb756b5dea144591118be77d7af0c3eee3bf2dfe2583dcb0364fefab",
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf":
      "0x91149353e08445ba77a52bf7e4cef919054027f4ad42812b4314bbaf2abd8b71",
    "0x4200000000000000000000000000000000000006":
      "0x8a3a1f6a9f9dce633117adee5b458245835a8645a8c8726a26382a4622508b1c",
    "0x7e2108d171681741d279570beca5e64b6e5e1f6a":
      "0x18986178a4d12b21929728b322f12772301255d8b767224f1fd33530df5b82b7",
    "0x0ef6d46720af642bfa37a288121d94de2204ae37":
      "0xd21a55152e6ee19e495f24ab70557f63f2658b83b6bd074972b24050d68049a8",
    "0xf1899dcb73ad6d45b69c2870728fbd825b0c8c46":
      "0xe3fdee603c37c796dc85286ccaec6f956839a4770afbc1dbd86e3bee1962a36c",
    "0x449f60915cd4365ee4ddeb070353c8a62b757f12":
      "0x370728eecd9b101af7763987108db502bae1939836206bcfc4a430205153c097",
    "0x877a080bbe4f831dfa577936e33972e7c50f09a6":
      "0x3431baf9dbffbfacdd992b0579e7dd53a11501f2304f9ff02822a577595ab39d",
  },
} as const satisfies TrustedPhase2aBaseManifest;

/** Full Phase 2a deployments payload aligned to {@link TRUSTED_PHASE2A_BASE_MANIFEST}. */
export const TRUSTED_PHASE2A_BASE_DEPLOYMENTS = {
  chainId: 8453,
  network: "base",
  isTestOnly: false,
  label: "INDEXLA Stable Club five-pool Base mainnet (deploy artifact)",
  deployedAt: "2026-09-04T21:12:13.258Z",
  deployer: "0x977e7055D097bE5924fBdAd7e5a330405820f168" as Address,
  /** Unused on Base (isTestOnly=false); required by payload shape only. */
  testUser: "0x0000000000000000000000000000000000000001" as Address,
  feeRecipient: "0x9d269f7A3d3f781740081D35F086D68a4a21442D" as Address,
  permissionRegistry: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.permissionRegistry,
  strategyRegistry: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.strategyRegistry,
  feeRouter: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.feeRouter,
  swapRouter: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.swapRouter,
  clExecutor: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.clExecutor,
  oracleGuard: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.oracleGuard,
  mevGuard: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.mevGuard,
  safetyController: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.safetyController,
  permit2: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.permit2,
  canonicalBasePermit2: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.permit2,
  usdc: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.usdc,
  cbbtc: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.cbbtc,
  weth: TRUSTED_PHASE2A_BASE_MANIFEST.contracts.weth,
  poolIds: [
    "0xb51b99144079a80e7d705d0dbef80a3e5e0b55eba8199486dc8d3770c3c14c11",
    "0xa72adbe1cdd7bb579a7f6915e7a89382f5a6640b29420fca351c0e1324dfbfcd",
    "0xab4b5c2fb326832537b899664425f8ea62c5385ea66ed996cfcb1a88471ed35f",
    "0x1749006c0f94a576f9ebaf7247b101875ca44fcc89e31ed9e52283a4d2e2e7db",
    "0xbce3446eaf96f286e047b7bed5939761058ea9d7ddcf21a40abb53a9d93a89af",
  ] as Hex[],
  adapters: [
    {
      poolId: "0xb51b99144079a80e7d705d0dbef80a3e5e0b55eba8199486dc8d3770c3c14c11",
      protocol: "aerodrome-slipstream",
      adapter: "0x7E2108d171681741d279570bECA5E64b6e5e1f6a",
      tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      tokenB: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
      npm: "0x827922686190790b37229fd06084350e74485b72",
      router: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5",
    },
    {
      poolId: "0xa72adbe1cdd7bb579a7f6915e7a89382f5a6640b29420fca351c0e1324dfbfcd",
      protocol: "uniswap-v3",
      adapter: "0x0ef6d46720af642bFA37a288121D94de2204ae37",
      tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      tokenB: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
      router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    },
    {
      poolId: "0xab4b5c2fb326832537b899664425f8ea62c5385ea66ed996cfcb1a88471ed35f",
      protocol: "aerodrome-slipstream",
      adapter: "0xf1899dcb73Ad6D45b69C2870728FBd825B0c8C46",
      tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      tokenB: "0x4200000000000000000000000000000000000006",
      factory: "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef",
      npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53",
      router: "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F",
    },
    {
      poolId: "0x1749006c0f94a576f9ebaf7247b101875ca44fcc89e31ed9e52283a4d2e2e7db",
      protocol: "aerodrome-slipstream",
      adapter: "0x449F60915CD4365ee4dDeb070353c8A62B757f12",
      tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      tokenB: "0x4200000000000000000000000000000000000006",
      factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
      npm: "0x827922686190790b37229fd06084350e74485b72",
      router: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5",
    },
    {
      poolId: "0xbce3446eaf96f286e047b7bed5939761058ea9d7ddcf21a40abb53a9d93a89af",
      protocol: "uniswap-v3",
      adapter: "0x877A080Bbe4f831DfA577936e33972E7c50f09a6",
      tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      tokenB: "0x4200000000000000000000000000000000000006",
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
      router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    },
  ],
  routes: [
    {
      name: "USDC_CBBTC_AERO_L",
      routeId: "0xd2d2b417c17973d9768956f0be6e40579c1306d8b2e1e0e6f2536816ea024fac",
      enabled: true,
    },
    {
      name: "USDC_CBBTC_UNI",
      routeId: "0x35a54be70bd45014962d39a5cf510d3af695cfd0e7aacc9a3ce67f9b28b4e6a6",
      enabled: true,
    },
    {
      name: "USDC_WETH_UNI",
      routeId: "0xc7f3d85f984bf6e1237310028e0846db312be0260df61614bf0bda9301a15c2f",
      enabled: true,
    },
    {
      name: "USDC_WETH_AERO_L",
      routeId: "0x4592ffdd4499ee77c400d997d84d3fadc256dd3017826262cc379d355cb5ab40",
      enabled: true,
    },
  ],
  strategyKind: "0x6aa596a46004a6b2f72b8c68391496a8652d1d0b070918ccb9752fba243846c3" as Hex,
  discoveryStartBlock: 50881768,
  /**
   * Manifest-only placeholder. Public API rewrites Base `rpcUrl` to
   * `/api/stable-club/base-rpc` (server BASE_RPC_URL). Do not use this URL in the browser.
   */
  rpcUrl: "https://mainnet.base.org",
} as const satisfies StableClubPhase2aDeployments;

/** Governance Timelock owner (not part of attestation core set; recorded for ops). */
export const TRUSTED_PHASE2A_BASE_TIMELOCK =
  "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a" as Address;
