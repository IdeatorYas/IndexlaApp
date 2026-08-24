"use client";

import Image from "next/image";
import { useState } from "react";
import {
  GENERIC_ASSET_LOGO,
  getAssetLogoUrl,
  resolveAssetTicker,
} from "@/lib/fixtures/asset-registry";

function GenericAssetIcon({ size, title }: { size: number; title: string }) {
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-full border border-app-line bg-app-elevated shadow-sm"
      style={{ width: size, height: size }}
      title={title}
    >
      <Image
        src={GENERIC_ASSET_LOGO}
        alt={title}
        width={size}
        height={size}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

export function AssetIcon({
  assetId,
  size = 28,
  framed = true,
  variant = "default",
  imageUrl = null,
}: {
  assetId: string;
  size?: number;
  /** When false, logo sits bare (no circular frame) — used inside allocation segments. */
  framed?: boolean;
  /** Donut: crisp circular disc with contained HQ logo (no crop/stretch). */
  variant?: "default" | "donut";
  /** Optional remote logo (e.g. CoinGecko) when registry has no match. */
  imageUrl?: string | null;
}) {
  const ticker = resolveAssetTicker(assetId);
  const registry = getAssetLogoUrl(assetId);
  const [broken, setBroken] = useState(false);
  const preferred =
    registry ||
    (imageUrl && imageUrl.trim() !== "" ? imageUrl.trim() : null);
  const resolved = !preferred || broken ? GENERIC_ASSET_LOGO : preferred;
  const isRemote = resolved.startsWith("http");
  const renderPx = Math.max(Math.round(size * 2), 64);

  if (variant === "donut") {
    const inner = Math.max(10, Math.round(size * 0.72));
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] dark:border-white/15 dark:bg-[#0F141C]"
        style={{ width: size, height: size }}
        title={ticker}
      >
        {isRemote ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolved}
            alt={ticker}
            width={renderPx}
            height={renderPx}
            className="object-contain"
            style={{
              width: inner,
              height: inner,
              display: "block",
            }}
            decoding="async"
            loading="eager"
            onError={() => setBroken(true)}
          />
        ) : (
          <Image
            src={resolved}
            alt={ticker}
            width={renderPx}
            height={renderPx}
            className="object-contain"
            style={{ width: inner, height: inner }}
            quality={95}
            onError={() => setBroken(true)}
          />
        )}
      </span>
    );
  }

  if (!framed) {
    if (isRemote) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={ticker}
          width={renderPx}
          height={renderPx}
          className="object-contain"
          style={{ width: size, height: size, display: "block" }}
          loading="lazy"
          decoding="async"
          title={ticker}
          onError={() => setBroken(true)}
        />
      );
    }
    return (
      <Image
        src={resolved}
        alt={ticker}
        width={renderPx}
        height={renderPx}
        className="object-contain"
        style={{ width: size, height: size }}
        quality={95}
        title={ticker}
        onError={() => setBroken(true)}
      />
    );
  }

  if (!preferred || broken) {
    return <GenericAssetIcon size={size} title={ticker} />;
  }

  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-full border border-app-line bg-app-elevated shadow-sm"
      style={{ width: size, height: size }}
      title={ticker}
    >
      {isRemote ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={ticker}
          width={renderPx}
          height={renderPx}
          className="h-full w-full object-contain p-[12%]"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <Image
          src={resolved}
          alt={ticker}
          width={renderPx}
          height={renderPx}
          className="h-full w-full object-contain p-[12%]"
          quality={95}
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}

export function AssetIconStack({
  assetIds,
  size = 28,
  max = 4,
}: {
  assetIds: string[];
  size?: number;
  max?: number;
}) {
  const shown = assetIds.slice(0, max);
  const overflow = assetIds.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((id, i) => (
        <span
          key={`${id}-${i}`}
          className="relative"
          style={{ marginLeft: i === 0 ? 0 : -size * 0.28, zIndex: shown.length - i }}
        >
          <AssetIcon assetId={id} size={size} />
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="relative flex items-center justify-center rounded-full border border-app-line bg-app-panel text-[9px] font-bold text-app-muted"
          style={{
            width: size,
            height: size,
            marginLeft: -size * 0.28,
            zIndex: 0,
          }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
