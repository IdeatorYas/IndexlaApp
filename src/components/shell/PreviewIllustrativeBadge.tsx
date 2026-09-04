"use client";

import { useEffect, useRef, useState } from "react";
import { getClientFeatureFlags } from "@/lib/feature-flags";

const PREVIEW_DISCLOSURE =
  "Preview · Illustrative Data — No real wallet signing, transactions or execution";

/** Stable id — avoids SSR/client useId() drift under wallet provider trees. */
const PREVIEW_PANEL_ID = "indexla-preview-illustrative-panel";

export function PreviewIllustrativeBadge() {
  const { ILLUSTRATIVE_DEMO_DATA } = getClientFeatureFlags();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!ILLUSTRATIVE_DEMO_DATA) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={PREVIEW_PANEL_ID}
        title={PREVIEW_DISCLOSURE}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1 rounded-full border border-app-warning/35 bg-app-warning/10 px-2 text-[9px] font-bold uppercase tracking-[0.06em] text-app-warning hover:border-app-warning/55 sm:h-9 sm:px-2.5 sm:text-[10px]"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-app-warning" />
        <span className="hidden sm:inline">Preview · Illustrative</span>
        <span className="sm:hidden">Preview</span>
      </button>

      <span className="sr-only">{PREVIEW_DISCLOSURE}</span>

      <div
        id={PREVIEW_PANEL_ID}
        role="status"
        hidden={!open}
        className={
          open
            ? "absolute left-0 top-[calc(100%+6px)] z-50 w-[min(100vw-1.5rem,320px)] rounded-[10px] border border-app-warning/30 bg-app-elevated p-2.5 text-[10px] font-semibold leading-snug text-app-warning shadow-lg sm:text-[11px]"
            : undefined
        }
      >
        {open ? PREVIEW_DISCLOSURE : null}
      </div>
    </div>
  );
}
