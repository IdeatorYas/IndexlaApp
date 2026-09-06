import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const res = await fetch("https://yields.llama.fi/pools");
const json = await res.json();
const rows = (json.data || []).filter((r) => r.chain === "Base");
const targets = [
  "0x4e962BB3889Bf030368F56810A9c96B83CB3E778",
  "0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef",
  "0x42d4a22CaD0F5a49681a5715cE994Af73A43B76b",
  "0x70aCDF2Ad0bf2402C957154f944c19Ef4e1cbAE1",
  "0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1",
].map((a) => a.toLowerCase());

const hits = [];
for (const row of rows) {
  const under = (row.underlyingTokens || []).map((t) => String(t).toLowerCase());
  const poolField = String(row.pool || "").toLowerCase();
  const byAddr = targets.includes(poolField);
  const byUnder =
    under.includes("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913") &&
    (row.project || "").toLowerCase().includes("aero") ||
    (row.project || "").toLowerCase().includes("uniswap");
  if (byAddr || targets.some((t) => under.includes(t) && poolField)) {
    hits.push({
      project: row.project,
      pool: row.pool,
      symbol: row.symbol,
      apy: row.apy,
      apyBase: row.apyBase,
      apyReward: row.apyReward,
      tvlUsd: row.tvlUsd,
      underlyingTokens: row.underlyingTokens,
    });
  }
}

// Also search by exact pool address in any field
const byExact = rows.filter((r) => targets.includes(String(r.pool || "").toLowerCase()));
console.log("exact pool address matches", byExact.length);
console.log(
  JSON.stringify(
    {
      sampleProjects: [...new Set(rows.map((r) => r.project))].filter((p) =>
        /aero|uniswap|slipstream/i.test(p || ""),
      ),
      exact: byExact.slice(0, 10),
      sampleAero: rows
        .filter((r) => /aerodrome/i.test(r.project || ""))
        .slice(0, 3)
        .map((r) => ({
          project: r.project,
          pool: r.pool,
          symbol: r.symbol,
          under: r.underlyingTokens,
          apy: r.apy,
        })),
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  path.join(root, "tmp", "defillama-sample.json"),
  JSON.stringify({ exact: byExact, aeroSample: rows.filter((r) => /aerodrome/i.test(r.project || "")).slice(0, 5) }, null, 2),
);
