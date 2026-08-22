import Image from "next/image";

const ASSET_SRC: Record<string, string> = {
  btc: "/images/assets/crypto/btc.svg",
  eth: "/images/assets/crypto/eth.svg",
  sol: "/images/assets/crypto/sol.svg",
  wif: "/images/assets/meme/wif.jpg",
};

const ASSET_COLOR: Record<string, string> = {
  btc: "#f7931a",
  eth: "#627eea",
  sol: "#14f195",
  wif: "#e11d48",
};

export function AssetIcon({
  assetId,
  size = 28,
}: {
  assetId: string;
  size?: number;
}) {
  const src = ASSET_SRC[assetId];
  const label = assetId.toUpperCase();

  if (src) {
    return (
      <span
        className="inline-flex shrink-0 overflow-hidden rounded-full border border-app-line bg-app-elevated shadow-sm"
        style={{ width: size, height: size }}
        title={label}
      >
        <Image
          src={src}
          alt={label}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{
        width: size,
        height: size,
        background: ASSET_COLOR[assetId] ?? "var(--color-brand)",
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
