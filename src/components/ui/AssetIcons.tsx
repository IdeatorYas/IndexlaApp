import Image from "next/image";
import {
  ASSET_COLORS,
  ASSET_ICON_URLS,
} from "@/lib/fixtures/asset-registry";

export function AssetIcon({
  assetId,
  size = 28,
}: {
  assetId: string;
  size?: number;
}) {
  const id = assetId.toLowerCase();
  const src = ASSET_ICON_URLS[id];
  const label = id.toUpperCase();

  if (src) {
    const isRemote = src.startsWith("http");
    return (
      <span
        className="inline-flex shrink-0 overflow-hidden rounded-full border border-app-line bg-app-elevated shadow-sm"
        style={{ width: size, height: size }}
        title={label}
      >
        {isRemote ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={label}
            width={size}
            height={size}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Image
            src={src}
            alt={label}
            width={size}
            height={size}
            className="h-full w-full object-cover"
          />
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 text-[9px] font-bold text-white shadow-sm"
      style={{
        width: size,
        height: size,
        background: ASSET_COLORS[id] ?? "var(--color-brand)",
      }}
      title={label}
    >
      {label.slice(0, 3)}
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
