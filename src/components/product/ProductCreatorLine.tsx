"use client";

import { useMemo } from "react";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import { getCreatorsWorkspace } from "@/lib/data";
import { isIndexlaProduct } from "@/lib/product/product-type";

function creatorVisuals(handle: string, displayName: string) {
  const creator = getCreatorsWorkspace().data.creators.find(
    (entry) => entry.handle === handle,
  );
  if (creator) {
    return { initials: creator.avatarInitials, hue: creator.avatarHue };
  }
  const parts = displayName.trim().split(/\s+/);
  const initials =
    parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return { initials, hue: (handle.length * 41) % 360 };
}

export function ProductCreatorLine({
  creatorName,
  creatorHandle,
  compact = false,
  className = "",
}: {
  creatorName: string;
  creatorHandle: string;
  compact?: boolean;
  className?: string;
}) {
  const official = isIndexlaProduct({ creatorName, creatorHandle });
  const avatar = useMemo(
    () => creatorVisuals(creatorHandle, creatorName),
    [creatorHandle, creatorName],
  );

  if (official) {
    return (
      <p
        className={[
          "font-bold text-app-ink",
          compact ? "text-[10px]" : "text-[12px]",
          className,
        ].join(" ")}
      >
        INDEXLA
      </p>
    );
  }

  return (
    <div className={["flex items-center gap-1.5", className].join(" ")}>
      <CreatorAvatar
        initials={avatar.initials}
        hue={avatar.hue}
        size={compact ? 20 : 24}
      />
      <p
        className={[
          "truncate font-semibold text-app-muted",
          compact ? "text-[10px]" : "text-[12px]",
        ].join(" ")}
      >
        {creatorName}
      </p>
    </div>
  );
}
