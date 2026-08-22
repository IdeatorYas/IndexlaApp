import Link from "next/link";
import { getDataLabel } from "@/lib/data";
import type { AppScreenMeta } from "@/lib/domain/types";
import { APP_SCREENS } from "@/lib/routes";
import { LoadingSkeleton } from "@/components/states/AppStates";

export function ScreenStub({
  screen,
  children,
}: {
  screen: AppScreenMeta;
  children?: React.ReactNode;
}) {
  const dataLabel = getDataLabel();
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-app-brand">
          Screen {String(screen.number).padStart(2, "0")}
        </p>
        <h1 className="app-display text-2xl font-bold text-app-ink md:text-3xl">
          {screen.title}
        </h1>
        <p className="max-w-3xl text-sm text-app-muted">{screen.purpose}</p>
        <p className="text-xs text-app-dim">
          Route: <code className="rounded bg-app-panel px-1">{screen.route}</code>
          {" · "}
          Phase 1 route stub · {dataLabel} data layer
        </p>
      </header>

      {children ?? (
        <LoadingSkeleton title={`Loading ${screen.title}`} lines={4} />
      )}

      <section className="app-panel p-4">
        <h2 className="mb-3 text-sm font-semibold text-app-ink">
          Related routes
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {APP_SCREENS.filter((s) => s.number !== screen.number).map((s) => (
            <li key={s.number}>
              <Link
                href={s.route.replace("{handle}", "indexla")}
                className="block rounded-lg border border-app-line px-3 py-2 text-sm text-app-muted hover:border-app-brand/40 hover:text-app-brand"
              >
                {String(s.number).padStart(2, "0")} · {s.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
