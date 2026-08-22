import { ILLUSTRATIVE_NETWORKS } from "@/lib/fixtures";

export function NetworkBadges({ networkIds }: { networkIds: string[] }) {
  const labels = networkIds
    .map((id) => ILLUSTRATIVE_NETWORKS.find((n) => n.id === id)?.label ?? id)
    .filter(Boolean);

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-app-line bg-app-panel px-2 py-0.5 text-[11px] font-medium text-app-muted"
        >
          {label}
        </span>
      ))}
    </div>
  );
}
