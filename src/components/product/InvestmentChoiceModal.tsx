"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_ROUTES } from "@/lib/routes";

export function InvestmentChoiceModal({
  productId,
  productName,
  onClose,
}: {
  productId: string;
  productName: string;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invest-choice-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[16px] border border-app-line bg-gradient-to-b from-app-elevated to-app-panel shadow-[0_24px_80px_-20px_rgba(0,0,0,0.55)]">
        <div className="border-b border-app-line/60 bg-app-panel/80 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">
            Invest in {productName}
          </p>
          <h2
            id="invest-choice-title"
            className="app-display mt-0.5 text-lg font-bold text-app-ink"
          >
            How would you like to invest?
          </h2>
        </div>
        <div className="space-y-2 p-3">
          <button
            type="button"
            className="app-btn-invest w-full rounded-[12px] p-3 text-left transition hover:brightness-105"
            onClick={() =>
              router.push(`${APP_ROUTES.create}?from=${productId}&mode=published`)
            }
          >
            <p className="text-sm font-bold">Invest as Published</p>
            <p className="mt-0.5 text-[11px] text-white/85">
              Use the creator&apos;s exact allocations and selected strategy.
              Review fees, routing and permissions before confirming.
            </p>
          </button>
          <button
            type="button"
            className="app-btn-customize w-full rounded-[12px] p-3 text-left transition hover:brightness-105"
            onClick={() =>
              router.push(`${APP_ROUTES.create}?from=${productId}&mode=customize`)
            }
          >
            <p className="text-sm font-bold">Customize First</p>
            <p className="mt-0.5 text-[11px] text-white/85">
              Set your amount, edit allocations to 100%, and keep or replace the
              strategy. Your version stays personal and does not change the
              published product.
            </p>
          </button>
        </div>
        <div className="flex justify-end border-t border-app-line/50 px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] px-3 py-1.5 text-[11px] font-bold text-app-muted hover:text-app-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function InvestChoiceLink({
  productId,
  className,
  children,
}: {
  productId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`${APP_ROUTES.product(productId)}?action=invest`}
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
