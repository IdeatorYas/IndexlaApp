/** Canonical Degen Club memecoin assets — do not substitute coins. */
import type { NetworkId } from "@/lib/domain/types";

export interface DegenAssetDef {
  /** Stable registry key (lowercase ticker). */
  key: string;
  name: string;
  ticker: string;
  coingeckoId: string;
  networkIds: NetworkId[];
  /** Primary chain label for multi-chain portfolio rows. */
  primaryChain: string;
}

export const DEGEN_ASSETS: Record<string, DegenAssetDef> = {
  pengu: {
    key: "pengu",
    name: "Pudgy Penguins",
    ticker: "PENGU",
    coingeckoId: "pudgy-penguins",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  wif: {
    key: "wif",
    name: "dogwifhat",
    ticker: "WIF",
    coingeckoId: "dogwifcoin",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  bonk: {
    key: "bonk",
    name: "Bonk",
    ticker: "BONK",
    coingeckoId: "bonk",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  fartcoin: {
    key: "fartcoin",
    name: "Fartcoin",
    ticker: "FARTCOIN",
    coingeckoId: "fartcoin",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  popcat: {
    key: "popcat",
    name: "Popcat",
    ticker: "POPCAT",
    coingeckoId: "popcat",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  useless: {
    key: "useless",
    name: "Useless",
    ticker: "USELESS",
    coingeckoId: "useless-3",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  troll: {
    key: "troll",
    name: "Troll",
    ticker: "TROLL",
    coingeckoId: "troll-2",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  pnut: {
    key: "pnut",
    name: "Peanut the Squirrel",
    ticker: "PNUT",
    coingeckoId: "peanut-the-squirrel",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  moodeng: {
    key: "moodeng",
    name: "Moo Deng",
    ticker: "MOODENG",
    coingeckoId: "moo-deng",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  giga: {
    key: "giga",
    name: "Gigachad",
    ticker: "GIGA",
    coingeckoId: "gigachad-2",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  shib: {
    key: "shib",
    name: "Shiba Inu",
    ticker: "SHIB",
    coingeckoId: "shiba-inu",
    networkIds: ["ethereum"],
    primaryChain: "Ethereum",
  },
  pepe: {
    key: "pepe",
    name: "Pepe",
    ticker: "PEPE",
    coingeckoId: "pepe",
    networkIds: ["ethereum"],
    primaryChain: "Ethereum",
  },
  spx: {
    key: "spx",
    name: "SPX6900",
    ticker: "SPX",
    coingeckoId: "spx6900",
    networkIds: ["ethereum"],
    primaryChain: "Ethereum",
  },
  floki: {
    key: "floki",
    name: "FLOKI",
    ticker: "FLOKI",
    coingeckoId: "floki",
    networkIds: ["ethereum", "bnb"],
    primaryChain: "Ethereum/BNB",
  },
  mog: {
    key: "mog",
    name: "Mog Coin",
    ticker: "MOG",
    coingeckoId: "mog-coin",
    networkIds: ["ethereum"],
    primaryChain: "Ethereum",
  },
  turbo: {
    key: "turbo",
    name: "Turbo",
    ticker: "TURBO",
    coingeckoId: "turbo",
    networkIds: ["ethereum"],
    primaryChain: "Ethereum",
  },
  npc: {
    key: "npc",
    name: "Non-Playable Coin",
    ticker: "NPC",
    coingeckoId: "non-playable-coin",
    networkIds: ["ethereum"],
    primaryChain: "Ethereum",
  },
  neiro: {
    key: "neiro",
    name: "Neiro",
    ticker: "NEIRO",
    coingeckoId: "neiro-3",
    networkIds: ["ethereum"],
    primaryChain: "Ethereum",
  },
  meme: {
    key: "meme",
    name: "Memecoin",
    ticker: "MEME",
    coingeckoId: "memecoin-2",
    networkIds: ["ethereum"],
    primaryChain: "Ethereum",
  },
  wojak: {
    key: "wojak",
    name: "Wojak",
    ticker: "WOJAK",
    coingeckoId: "wojak",
    networkIds: ["ethereum"],
    primaryChain: "Ethereum",
  },
  binancelife: {
    key: "binancelife",
    name: "BinanceLife",
    ticker: "币安人生",
    coingeckoId: "binance-life",
    networkIds: ["bnb"],
    primaryChain: "BNB",
  },
  bananas31: {
    key: "bananas31",
    name: "Banana For Scale",
    ticker: "BANANAS31",
    coingeckoId: "banana-for-scale",
    networkIds: ["bnb"],
    primaryChain: "BNB",
  },
  babydoge: {
    key: "babydoge",
    name: "Baby Doge Coin",
    ticker: "BABYDOGE",
    coingeckoId: "baby-doge-coin",
    networkIds: ["bnb"],
    primaryChain: "BNB",
  },
  broccoli: {
    key: "broccoli",
    name: "CZ's Dog / Broccoli",
    ticker: "BROCCOLI",
    coingeckoId: "czs-dog",
    networkIds: ["bnb"],
    primaryChain: "BNB",
  },
  tut: {
    key: "tut",
    name: "Tutorial",
    ticker: "TUT",
    coingeckoId: "tutorial",
    networkIds: ["bnb"],
    primaryChain: "BNB",
  },
  hajimi: {
    key: "hajimi",
    name: "Hajimi",
    ticker: "哈基米",
    coingeckoId: "hajimi-on-bsc",
    networkIds: ["bnb"],
    primaryChain: "BNB",
  },
  cheems: {
    key: "cheems",
    name: "Cheems",
    ticker: "CHEEMS",
    coingeckoId: "cheems-token",
    networkIds: ["bnb"],
    primaryChain: "BNB",
  },
  memecore: {
    key: "memecore",
    name: "MemeCore",
    ticker: "M",
    coingeckoId: "memecore-2",
    networkIds: ["bnb"],
    primaryChain: "BNB",
  },
  tst: {
    key: "tst",
    name: "Test",
    ticker: "TST",
    coingeckoId: "test-2",
    networkIds: ["bnb"],
    primaryChain: "BNB",
  },
  toshi: {
    key: "toshi",
    name: "Toshi",
    ticker: "TOSHI",
    coingeckoId: "toshi",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  brett: {
    key: "brett",
    name: "Brett",
    ticker: "BRETT",
    coingeckoId: "based-brett",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  degen: {
    key: "degen",
    name: "Degen",
    ticker: "DEGEN",
    coingeckoId: "degen-base",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  drb: {
    key: "drb",
    name: "DebtReliefBot",
    ticker: "DRB",
    coingeckoId: "debtreliefbot",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  bald: {
    key: "bald",
    name: "Bald",
    ticker: "BALD",
    coingeckoId: "bald",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  ponke: {
    key: "ponke",
    name: "PONKE",
    ticker: "PONKE",
    coingeckoId: "ponke",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  keycat: {
    key: "keycat",
    name: "Keyboard Cat",
    ticker: "KEYCAT",
    coingeckoId: "keyboard-cat-base",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  doginme: {
    key: "doginme",
    name: "doginme",
    ticker: "DOGINME",
    coingeckoId: "doginme",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  benji: {
    key: "benji",
    name: "Basenji",
    ticker: "BENJI",
    coingeckoId: "basenji",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  miggles: {
    key: "miggles",
    name: "Mr. Miggles",
    ticker: "MIGGLES",
    coingeckoId: "mr-miggles",
    networkIds: ["base"],
    primaryChain: "Base",
  },
  bitty: {
    key: "bitty",
    name: "Bitty",
    ticker: "BITTY",
    coingeckoId: "bitty",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  kitty: {
    key: "kitty",
    name: "Kitty",
    ticker: "KITTY",
    coingeckoId: "kitty-2",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  fwog: {
    key: "fwog",
    name: "Fwog",
    ticker: "FWOG",
    coingeckoId: "fwog",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  mask: {
    key: "mask",
    name: "Catwifmask",
    ticker: "MASK",
    coingeckoId: "catwifmask",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  cupsey: {
    key: "cupsey",
    name: "Cupsey",
    ticker: "CUPSEY",
    coingeckoId: "cupsey",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
  purple: {
    key: "purple",
    name: "Purple Bitcoin",
    ticker: "PURPLE",
    coingeckoId: "purple-bitcoin",
    networkIds: ["solana"],
    primaryChain: "Solana",
  },
};

/** Dominant brand hues for Degen memecoin donut segments — not rainbow fallbacks. */
export const DEGEN_ASSET_BRAND_COLORS: Record<string, string> = {
  pengu: "#6EC1FF",
  wif: "#E8B849",
  bonk: "#F7931A",
  fartcoin: "#84CC16",
  popcat: "#F97316",
  useless: "#94A3B8",
  troll: "#A855F7",
  pnut: "#D97706",
  moodeng: "#EC4899",
  giga: "#6366F1",
  shib: "#FFA409",
  pepe: "#3D9970",
  spx: "#FF4D4D",
  floki: "#FB923C",
  mog: "#2563EB",
  turbo: "#22C55E",
  npc: "#8B5CF6",
  neiro: "#EAB308",
  meme: "#64748B",
  wojak: "#78716C",
  binancelife: "#F3BA2F",
  bananas31: "#FACC15",
  babydoge: "#F59E0B",
  broccoli: "#16A34A",
  tut: "#0EA5E9",
  hajimi: "#F472B6",
  cheems: "#D4A574",
  memecore: "#7C3AED",
  tst: "#06B6D4",
  toshi: "#3B82F6",
  brett: "#2563EB",
  degen: "#A855F7",
  drb: "#14B8A6",
  bald: "#9CA3AF",
  ponke: "#F97316",
  keycat: "#FBBF24",
  doginme: "#EF4444",
  benji: "#10B981",
  miggles: "#F59E0B",
  bitty: "#818CF8",
  kitty: "#FB7185",
  fwog: "#4ADE80",
  mask: "#C084FC",
  cupsey: "#38BDF8",
  purple: "#9333EA",
};

export function getDegenAssetBrandColor(key: string): string | undefined {
  return DEGEN_ASSET_BRAND_COLORS[key.toLowerCase()];
}

export function degenAsset(key: string): DegenAssetDef {
  const asset = DEGEN_ASSETS[key];
  if (!asset) throw new Error(`Unknown degen asset: ${key}`);
  return asset;
}

export function equalAllocations(keys: string[]): {
  assetId: string;
  label: string;
  percent: number;
  name: string;
  ticker: string;
  coingeckoId: string;
  networkLabel: string;
}[] {
  const n = keys.length;
  const base = Math.floor((100 / n) * 100) / 100;
  const rows = keys.map((key) => {
    const a = degenAsset(key);
    return {
      assetId: a.key,
      label: a.ticker,
      name: a.name,
      ticker: a.ticker,
      coingeckoId: a.coingeckoId,
      networkLabel: a.primaryChain,
      percent: base,
    };
  });
  const remainder =
    Math.round((100 - rows.reduce((s, r) => s + r.percent, 0)) * 100) / 100;
  if (rows[0]) rows[0].percent = Math.round((rows[0].percent + remainder) * 100) / 100;
  return rows;
}
