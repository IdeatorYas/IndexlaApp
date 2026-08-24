"use client";

import Image from "next/image";
import { useState } from "react";
import { degenAsset } from "@/lib/fixtures/degen-asset-registry";

/** Degen-scoped asset icon — prefers CoinGecko imageUrl, falls back to ticker initial. */
export function DegenAssetIcon({
  assetKey,
  size = 24,
  imageUrl = null,
}: {
  assetKey: string;
  size?: number;
  imageUrl?: string | null;
}) {
  const [broken, setBroken] = useState(false);
  let ticker = assetKey.toUpperCase();
  try {
    ticker = degenAsset(assetKey).ticker;
  } catch {
    /* unknown key */
  }
  const initial = ticker.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "?";
  const src =
    imageUrl && !broken && imageUrl.trim() !== "" ? imageUrl.trim() : null;

  if (src) {
    return (
      <span
        className="inline-flex shrink-0 overflow-hidden rounded-full border-2 border-[#0e0818] bg-[#1a1028] shadow-[0_0_8px_rgba(168,85,247,0.25)]"
        style={{ width: size, height: size }}
        title={ticker}
      >
        <Image
          src={src}
          alt={ticker}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          unoptimized
          onError={() => setBroken(true)}
        />
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#0e0818] bg-gradient-to-br from-[#a855f7]/30 to-[#ff00aa]/20 text-[9px] font-black uppercase text-[#f4f0ff] shadow-[0_0_8px_rgba(168,85,247,0.2)]"
      style={{ width: size, height: size }}
      title={ticker}
    >
      {initial.slice(0, 2)}
    </span>
  );
}
