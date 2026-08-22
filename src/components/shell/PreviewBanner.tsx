"use client";

import { getClientFeatureFlags } from "@/lib/feature-flags";

export function PreviewBanner() {
  const { ILLUSTRATIVE_DEMO_DATA } = getClientFeatureFlags();
  if (!ILLUSTRATIVE_DEMO_DATA) {
    return null;
  }

  return (
    <div
      className="border-b border-app-warning/25 bg-gradient-to-r from-app-warning/10 via-app-brand/5 to-app-warning/10 px-4 py-2.5 text-center text-xs font-semibold text-app-warning sm:text-sm"
      role="status"
    >
      Preview · Illustrative Data — No real wallet signing, transactions or
      execution
    </div>
  );
}
