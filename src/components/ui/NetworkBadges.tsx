import { getNetworks } from "@/lib/data";

export function NetworkBadges({ networkIds }: { networkIds: string[] }) {
  const networks = getNetworks().data;
  const labels = networkIds
    .map((id) => networks.find((n) => n.id === id)?.label ?? id)
    .filter(Boolean);

  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-app-line bg-app-panel px-2 py-0.5 text-[10px] font-semibold text-app-muted"
        >
          {label}
        </span>
      ))}
    </div>
  );
}
