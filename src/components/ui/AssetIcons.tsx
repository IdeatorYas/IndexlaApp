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
}: {
  assetId: string;
  size?: number;
}) {
  const ticker = resolveAssetTicker(assetId);
  const src = getAssetLogoUrl(assetId);
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return <GenericAssetIcon size={size} title={ticker} />;
  }

  const isRemote = src.startsWith("http");

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
      {shown.map((id, index) => (
        <span
          key={`${id}-${index}`}
          className="relative"
          style={{ marginLeft: index === 0 ? 0 : -8, zIndex: shown.length - index }}
        >
          <AssetIcon assetId={id} size={size} />
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="relative z-0 ml-[-6px] inline-flex items-center justify-center rounded-full border border-app-line bg-app-panel text-[10px] font-bold text-app-muted"
          style={{ width: size, height: size }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
