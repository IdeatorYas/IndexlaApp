import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, http, parseAbi, toFunctionSelector } from "viem";
import { base } from "viem/chains";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
try {
  const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

const rpc =
  process.env.BASE_RPC_URL ||
  process.env.QUICKNODE_HTTP_URL ||
  process.env.QUICKNODE_URL;
const client = createPublicClient({ chain: base, transport: http(rpc) });
const abi = parseAbi(["function owner() view returns (address)"]);
const swap = "0x46EbaC1c66f1A747084899b61a82Bf5A80E9C3F3";
const exec = "0x1cdE442a760Ddda54087081aF9860471Dc099a9f";
const timelock = "0x6A83733C829B6F8a9C0E0D4d5713D64eE959167a";

const exitAllToUsdcSel = toFunctionSelector(
  "exitAllToUsdc(bytes32,(uint8,address,address,address,uint256,uint128,uint256,uint256,uint256,bool)[5],(bytes32,uint256,uint256,uint256,uint256)[8],uint8,uint256,uint256)",
);

const code = await client.getBytecode({ address: exec });
const swapOwner = await client.readContract({
  address: swap,
  abi,
  functionName: "owner",
});
const execOwner = await client.readContract({
  address: exec,
  abi,
  functionName: "owner",
});

console.log(
  JSON.stringify(
    {
      swapRouterOwner: swapOwner,
      clExecutorOwner: execOwner,
      timelock,
      swapOwnedByTimelock: swapOwner.toLowerCase() === timelock.toLowerCase(),
      execOwnedByTimelock: execOwner.toLowerCase() === timelock.toLowerCase(),
      exitAllToUsdcSelector: exitAllToUsdcSel,
      exitAllToUsdcInBytecode: Boolean(code?.toLowerCase().includes(exitAllToUsdcSel.slice(2).toLowerCase())),
      bytecodeBytes: code ? (code.length - 2) / 2 : 0,
    },
    null,
    2,
  ),
);
