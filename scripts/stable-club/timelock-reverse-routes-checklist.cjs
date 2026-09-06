#!/usr/bin/env node
/**
 * Timelock ops checklist — reverse USDC unwind routes for exitAllToUsdc.
 * DO NOT broadcast from this script. Produces calldata / route configs for Safe→Timelock.
 */
const { keccak256, stringToHex } = require("viem");

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const WETH = "0x4200000000000000000000000000000000000006";
const SWAP_ROUTER = "0x46EbaC1c66f1A747084899b61a82Bf5A80E9C3F3";
const TIMELOCK = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";

const routes = [
  {
    name: "CBBTC_USDC_UNI",
    label: "ROUTE_CBBTC_USDC_UNI_005",
    tokenIn: CBBTC,
    tokenOut: USDC,
    note: "Mirror of USDC_CBBTC_UNI with tokenIn/Out swapped; same Uni pool/fee",
  },
  {
    name: "CBBTC_USDC_AERO_L",
    label: "ROUTE_CBBTC_USDC_AERO_LEGACY_100",
    tokenIn: CBBTC,
    tokenOut: USDC,
    note: "Mirror of USDC_CBBTC_AERO_L",
  },
  {
    name: "WETH_USDC_UNI",
    label: "ROUTE_WETH_USDC_UNI_005",
    tokenIn: WETH,
    tokenOut: USDC,
    note: "Mirror of USDC_WETH_UNI",
  },
  {
    name: "WETH_USDC_AERO_L",
    label: "ROUTE_WETH_USDC_AERO_LEGACY_100",
    tokenIn: WETH,
    tokenOut: USDC,
    note: "Mirror of USDC_WETH_AERO_L",
  },
].map((r) => ({ ...r, routeId: keccak256(stringToHex(r.label)) }));

console.log(
  JSON.stringify(
    {
      status: "CHECKLIST_ONLY_NO_BROADCAST",
      swapRouter: SWAP_ROUTER,
      timelock: TIMELOCK,
      delayHours: 48,
      prerequisite:
        "New CL executor + 5 adapters must be deployed (immutable executor binding). Then Timelock configureRoute for reverse routes. Then pin trusted manifest features.exitAllToUsdc=true.",
      reverseRoutes: routes,
      blockers: [
        "Timelock owns swapRouter and clExecutor",
        "Live clExecutor bytecode lacks exitAllToUsdc",
        "Adapters bind immutable executor address",
        "Harvest/Compound All have no strategy-level Base contracts",
      ],
    },
    null,
    2,
  ),
);
