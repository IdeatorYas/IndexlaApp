/**
 * Source-controlled Base Phase 2a trust root — pinned from the verified
 * Safe-owned stack CREATE + MultiSend config after live Base E2E
 * (deposit → harvest → compound → exitAllToUsdc, USDC-only).
 *
 * Exit-percent cutover (2026-09-08): primary CL executor + adapters include
 * decreaseLiquidityTo. Pre-cutover stack retained as legacyExitStack (100% only).
 *
 * Addresses and runtime keccak256 hashes are recorded evidence only —
 * do not invent or edit casually.
 */
import type { Address, Hex } from "viem";
import type {
  StableClubPhase2aDeployments,
  TrustedPhase2aBaseManifest,
} from "@/lib/stable-club/phase2a-deployments";

/** Pre-cutover CL executor (no decreaseLiquidityTo on adapters). */
const LEGACY_CL_EXECUTOR =
  "0x488f0680ff28908F49CC85C05b9E4813e657FcD2" as Address;

const LEGACY_ADAPTERS = [
  {
    poolId: "0xb51b99144079a80e7d705d0dbef80a3e5e0b55eba8199486dc8d3770c3c14c11" as Hex,
    protocol: "aerodrome-slipstream",
    adapter: "0x518aB4069fB15dC201a00D19a9bC65CCB4D23fA8" as Address,
    tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    tokenB: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address,
    npm: "0x827922686190790b37229fd06084350e74485b72" as Address,
    router: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5" as Address,
  },
  {
    poolId: "0xa72adbe1cdd7bb579a7f6915e7a89382f5a6640b29420fca351c0e1324dfbfcd" as Hex,
    protocol: "uniswap-v3",
    adapter: "0x27dB4752042A1de36Dae6Ee473Df32Ec5dBA2216" as Address,
    tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    tokenB: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as Address,
    npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as Address,
    router: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  },
  {
    poolId: "0xab4b5c2fb326832537b899664425f8ea62c5385ea66ed996cfcb1a88471ed35f" as Hex,
    protocol: "aerodrome-slipstream",
    adapter: "0xf116E439128c9ba2E7824BB46dF12877BcBaC41f" as Address,
    tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    tokenB: "0x4200000000000000000000000000000000000006" as Address,
    factory: "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef" as Address,
    npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53" as Address,
    router: "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F" as Address,
  },
  {
    poolId: "0x1749006c0f94a576f9ebaf7247b101875ca44fcc89e31ed9e52283a4d2e2e7db" as Hex,
    protocol: "aerodrome-slipstream",
    adapter: "0xcb58E708fAa868b8D2052c33a798b4BAEa2FAD7b" as Address,
    tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    tokenB: "0x4200000000000000000000000000000000000006" as Address,
    factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address,
    npm: "0x827922686190790b37229fd06084350e74485b72" as Address,
    router: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5" as Address,
  },
  {
    poolId: "0xbce3446eaf96f286e047b7bed5939761058ea9d7ddcf21a40abb53a9d93a89af" as Hex,
    protocol: "uniswap-v3",
    adapter: "0xf51bd174b19008526594E9ae5837FcA66BEB6adf" as Address,
    tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    tokenB: "0x4200000000000000000000000000000000000006" as Address,
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as Address,
    npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as Address,
    router: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  },
] as const;

const PRIMARY_ADAPTERS = [
  {
    poolId: "0xb51b99144079a80e7d705d0dbef80a3e5e0b55eba8199486dc8d3770c3c14c11" as Hex,
    protocol: "aerodrome-slipstream",
    adapter: "0x426dF92067335e3B5Df01a8e0165Ac7BFCA27E8D" as Address,
    tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    tokenB: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address,
    npm: "0x827922686190790b37229fd06084350e74485b72" as Address,
    router: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5" as Address,
  },
  {
    poolId: "0xa72adbe1cdd7bb579a7f6915e7a89382f5a6640b29420fca351c0e1324dfbfcd" as Hex,
    protocol: "uniswap-v3",
    adapter: "0x6d81BC4748483D61a16dDB9F44C2F4C98301e3ae" as Address,
    tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    tokenB: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as Address,
    npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as Address,
    router: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  },
  {
    poolId: "0xab4b5c2fb326832537b899664425f8ea62c5385ea66ed996cfcb1a88471ed35f" as Hex,
    protocol: "aerodrome-slipstream",
    adapter: "0x60DD0546b4816DAaEb864F1A3EbF3619D60646d3" as Address,
    tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    tokenB: "0x4200000000000000000000000000000000000006" as Address,
    factory: "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef" as Address,
    npm: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53" as Address,
    router: "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F" as Address,
  },
  {
    poolId: "0x1749006c0f94a576f9ebaf7247b101875ca44fcc89e31ed9e52283a4d2e2e7db" as Hex,
    protocol: "aerodrome-slipstream",
    adapter: "0x76C480a97589f4384E20d35F08436FA2758CE58b" as Address,
    tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    tokenB: "0x4200000000000000000000000000000000000006" as Address,
    factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as Address,
    npm: "0x827922686190790b37229fd06084350e74485b72" as Address,
    router: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5" as Address,
  },
  {
    poolId: "0xbce3446eaf96f286e047b7bed5939761058ea9d7ddcf21a40abb53a9d93a89af" as Hex,
    protocol: "uniswap-v3",
    adapter: "0x5831Dbc39a336e22A54F828fDcd3d75CfE26Ef1D" as Address,
    tokenA: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    tokenB: "0x4200000000000000000000000000000000000006" as Address,
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as Address,
    npm: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as Address,
    router: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
  },
] as const;

export const TRUSTED_PHASE2A_BASE_MANIFEST = {
  chainId: 8453,
  network: "base",
  isTestOnly: false,
  contracts: {
    permissionRegistry: "0xF75423289baA42A44981533152c81E16f1aFa069",
    strategyRegistry: "0xf6696C45A1A186712c530696a5B392Ed9E18ae24",
    feeRouter: "0xf33239712875a7BD9d171cdD4d782c8FC022154C",
    swapRouter: "0x56c6c76B4d5997754988d3C26083af315BfFa98F",
    clExecutor: "0x455cc33194f82E253F41d91C1201eB4095c9D1Fa",
    oracleGuard: "0x0cD087927F590B28737dFd9c7AAeB73B8ede70Ba",
    mevGuard: "0xa524506a21a9a5105c535a45c55Fe5dF9970c540",
    safetyController: "0x429df0c70eEfCC5CD6b8B8FB94Ca8eDe226feDe5",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    cbbtc: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    weth: "0x4200000000000000000000000000000000000006",
    adapters: [
      "0x426dF92067335e3B5Df01a8e0165Ac7BFCA27E8D",
      "0x6d81BC4748483D61a16dDB9F44C2F4C98301e3ae",
      "0x60DD0546b4816DAaEb864F1A3EbF3619D60646d3",
      "0x76C480a97589f4384E20d35F08436FA2758CE58b",
      "0x5831Dbc39a336e22A54F828fDcd3d75CfE26Ef1D",
    ],
  },
  runtimeCodeHashes: {
    "0xf75423289baa42a44981533152c81e16f1afa069":
      "0xd003cf46e4c9eeb9c0ea2051b8aee099ef1ec006c022dca05b35644e739148bc",
    "0xf6696c45a1a186712c530696a5b392ed9e18ae24":
      "0xc66338342c990d013e464935deb4e8662c9aad95c44744eeafe0a36eff85db0e",
    "0xf33239712875a7bd9d171cdd4d782c8fc022154c":
      "0xabbeafc96fc1f32f6ba7279aaf1980b27eed78746b37665fe1f7ffa1b9ddff37",
    "0x56c6c76b4d5997754988d3c26083af315bffa98f":
      "0xd7505a04f222bb3c9bebf371b454ce87479b02b09e60eda7e3ed2c05a34223b4",
    "0x455cc33194f82e253f41d91c1201eb4095c9d1fa":
      "0x61a8c3ff3ae721bbd780e944790cbca0d04c54540806f91f475b996259bccdf9",
    "0x0cd087927f590b28737dfd9c7aaeb73b8ede70ba":
      "0x72abe7dc9e08714ec8f299076928b564cbc926e1b01b41d3c62a80808e3a7ab9",
    "0xa524506a21a9a5105c535a45c55fe5df9970c540":
      "0x9f69e05677f1f7e62f20b3f0ebdc19a68c06900e81326860ee3311ed30065c5d",
    "0x429df0c70eefcc5cd6b8b8fb94ca8ede226fede5":
      "0x49ab1c096c22d49aff99cd35c73d3ace9b056b337c12b7296309a50ffc542ead",
    "0x000000000022d473030f116ddee9f6b43ac78ba3":
      "0xa67739abc3ede9dbdc0491636c67d6a14ac07fab9030c3f509b1eb7b11dff8ed",
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913":
      "0xa6705a10bb756b5dea144591118be77d7af0c3eee3bf2dfe2583dcb0364fefab",
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf":
      "0x91149353e08445ba77a52bf7e4cef919054027f4ad42812b4314bbaf2abd8b71",
    "0x4200000000000000000000000000000000000006":
      "0x8a3a1f6a9f9dce633117adee5b458245835a8645a8c8726a26382a4622508b1c",
    "0x426df92067335e3b5df01a8e0165ac7bfca27e8d":
      "0x1b96e6d26103cb26b52bdb03c0d8c1aa2cdfcdb3202a1897d79ef40580db6041",
    "0x6d81bc4748483d61a16ddb9f44c2f4c98301e3ae":
      "0x8b400b938f9d899e13ad58ebfc6012bef119b57bdbef8616a1658a14177fa4d4",
    "0x60dd0546b4816daaeb864f1a3ebf3619d60646d3":
      "0xe1900c8f59c0f796aa679b864800865c24b623c1008c0d168cbe331307282c91",
    "0x76c480a97589f4384e20d35f08436fa2758ce58b":
      "0xca10e3a7cf54da4f956a105b633aee3972b9dc033a4bcd720ef3fc08fab5fbe1",
    "0x5831dbc39a336e22a54f828fdcd3d75cfe26ef1d":
      "0x1e52b8796d9e129e798274df27d988fa58b0f411c0d60dca3a46b4e897b9ae84",
  },
} as const satisfies TrustedPhase2aBaseManifest;

/** Full Phase 2a deployments payload aligned to {@link TRUSTED_PHASE2A_BASE_MANIFEST}. */
export const TRUSTED_PHASE2A_BASE_DEPLOYMENTS = {
  chainId: 8453,
  network: "base",
  isTestOnly: false,
  label:
    "INDEXLA Stable Club five-pool Base mainnet (Safe-owned exit-percent stack)",
  deployedAt: "2026-09-08T17:12:17.000Z",
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
  adapters: [...PRIMARY_ADAPTERS],
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
    {
      name: "CBBTC_USDC_UNI",
      routeId: "0x792d70605bc949941ebcc28c02388abcc68f73c3f3158e36086fe7533a0bc3bf",
      enabled: true,
    },
    {
      name: "CBBTC_USDC_AERO_L",
      routeId: "0xcce2f23e7b15854497727b7a4d660e450d2c65073ef9289e985e776ca6101720",
      enabled: true,
    },
    {
      name: "WETH_USDC_UNI",
      routeId: "0x39b53d947f9b039d6f66877cbf3d95c2e9d90e89d6ade76fa1c43994eb2c6777",
      enabled: true,
    },
    {
      name: "WETH_USDC_AERO_L",
      routeId: "0x8092322c104f0a5dcbf6325eb67741dbf5ec7c40a3661d14d4f1ed950a92e3f8",
      enabled: true,
    },
  ],
  strategyKind: "0x6aa596a46004a6b2f72b8c68391496a8652d1d0b070918ccb9752fba243846c3" as Hex,
  discoveryStartBlock: 50968399,
  /**
   * Safe-owned withdraw Ops Gateway (NPM exitPercentToUsdc). Live deposits stay on
   * clExecutor — opsGatewayDeposit remains false.
   */
  opsGateway: "0xE82d1602c2953D805ea8Ebe3056804e4f60d4316" as Address,
  features: {
    exitAllToUsdc: true,
    exitPercentToUsdc: true,
    opsGatewayWithdraw: true,
    opsGatewayDeposit: false,
  },
  legacyExitStack: {
    clExecutor: LEGACY_CL_EXECUTOR,
    adapters: [...LEGACY_ADAPTERS],
  },
  /**
   * Manifest-only placeholder. Public API rewrites Base `rpcUrl` to
   * `/api/stable-club/base-rpc` (server BASE_RPC_URL). Do not use this URL in the browser.
   */
  rpcUrl: "https://mainnet.base.org",
} as const satisfies StableClubPhase2aDeployments;

/** Protocol owner is the 2-of-3 Safe (no Timelock on this cutover). */
export const TRUSTED_PHASE2A_BASE_SAFE =
  "0x356A4A432EE57F31F5cF8Fdd55F95c1FF6Cd5910" as Address;

/** @deprecated Superseded Timelock — retained for ops archaeology only. */
export const TRUSTED_PHASE2A_BASE_TIMELOCK =
  "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a" as Address;
