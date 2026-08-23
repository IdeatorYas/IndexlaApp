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
}: {
  assetId: string;
  size?: number;
  /** When false, logo sits bare (no circular frame) — used inside allocation segments. */
  framed?: boolean;
}) {
  const ticker = resolveAssetTicker(assetId);
  const src = getAssetLogoUrl(assetId);
  const [broken, setBroken] = useState(false);
  const resolved = !src || broken ? GENERIC_ASSET_LOGO : src;
  const isRemote = resolved.startsWith("http");

  if (!framed) {
    if (isRemote) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={ticker}
          width={size}
          height={size}
          className="object-contain"
          style={{ width: size, height: size, display: "block" }}
          loading="lazy"
          title={ticker}
          onError={() => setBroken(true)}
        />
      );
    }
    return (
      <Image
        src={resolved}
        alt={ticker}
        width={size}
        height={size}
        className="object-contain"
        title={ticker}
        onError={() => setBroken(true)}
      />
    );
  }

  if (!src || broken) {
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
          src={src}
          alt={ticker}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <Image
          src={src}
          alt={ticker}
          width={size}
          height={size}
          className="h-full w-full object-cover"
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
