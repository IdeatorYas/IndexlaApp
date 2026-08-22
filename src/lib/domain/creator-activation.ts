import type { CreatorSpecialty } from "@/lib/domain/creators";

/** SCREEN 11 activation lifecycle states */
export type CreatorActivationStatus =
  | "locked"
  | "in-progress"
  | "awaiting-verification"
  | "approved"
  | "needs-changes";

export type ActivationSocialPlatform = "X" | "LinkedIn" | "YouTube";

export type ActivationWizardStep =
  | "portfolio"
  | "social"
  | "verification"
  | "approved";

export interface ActivationSocialConnection {
  platform: ActivationSocialPlatform;
  connected: boolean;
  handle: string;
  profileUrl: string;
}

export interface CreatorActivationDraft {
  version: 1;
  status: CreatorActivationStatus;
  step: ActivationWizardStep;
  selectedPortfolioId: string | null;
  selectedPortfolioName: string | null;
  socials: ActivationSocialConnection[];
  displayName: string;
  handle: string;
  bio: string;
  specialty: CreatorSpecialty | "";
  disclosuresAccepted: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  needsChangesNote: string | null;
  updatedAt: string;
}

export const CREATOR_ACTIVATION_STORAGE_KEY =
  "indexla.creator.activation.v1";

export const CREATOR_ACTIVATION_REQUIREMENT_COPY =
  "Creator access requires a published public portfolio, connected social profile and verification.";

export const ACTIVATION_SOCIAL_PLATFORMS: ActivationSocialPlatform[] = [
  "X",
  "LinkedIn",
  "YouTube",
];

export const ACTIVATION_SPECIALTIES: CreatorSpecialty[] = [
  "AI",
  "DeFi",
  "Crypto",
  "RWAs",
  "Degen",
  "Hybrid",
  "Tokenized Stocks",
  "Commodities",
];

export function createEmptyActivationDraft(): CreatorActivationDraft {
  const now = new Date().toISOString();
  return {
    version: 1,
    status: "locked",
    step: "portfolio",
    selectedPortfolioId: null,
    selectedPortfolioName: null,
    socials: ACTIVATION_SOCIAL_PLATFORMS.map((platform) => ({
      platform,
      connected: false,
      handle: "",
      profileUrl: "",
    })),
    displayName: "",
    handle: "",
    bio: "",
    specialty: "",
    disclosuresAccepted: false,
    submittedAt: null,
    approvedAt: null,
    needsChangesNote: null,
    updatedAt: now,
  };
}

export function hasConnectedSocial(
  draft: CreatorActivationDraft,
): boolean {
  return draft.socials.some((s) => s.connected && s.handle.trim().length > 0);
}

export function hasSelectedPublicPortfolio(
  draft: CreatorActivationDraft,
): boolean {
  return Boolean(draft.selectedPortfolioId && draft.selectedPortfolioName);
}

export function canSubmitVerification(
  draft: CreatorActivationDraft,
): boolean {
  return (
    hasSelectedPublicPortfolio(draft) &&
    hasConnectedSocial(draft) &&
    draft.displayName.trim().length > 0 &&
    draft.handle.trim().length > 0 &&
    draft.bio.trim().length > 0 &&
    draft.specialty !== "" &&
    draft.disclosuresAccepted
  );
}

/** Derive lifecycle status from progress (unless awaiting/approved/needs-changes). */
export function deriveActivationStatus(
  draft: CreatorActivationDraft,
): CreatorActivationStatus {
  if (
    draft.status === "awaiting-verification" ||
    draft.status === "approved" ||
    draft.status === "needs-changes"
  ) {
    return draft.status;
  }
  const started =
    hasSelectedPublicPortfolio(draft) ||
    hasConnectedSocial(draft) ||
    draft.displayName.trim().length > 0 ||
    draft.handle.trim().length > 0 ||
    draft.bio.trim().length > 0 ||
    draft.specialty !== "" ||
    draft.disclosuresAccepted;
  return started ? "in-progress" : "locked";
}

export function stepForStatus(
  status: CreatorActivationStatus,
): ActivationWizardStep {
  switch (status) {
    case "approved":
      return "approved";
    case "awaiting-verification":
    case "needs-changes":
      return "verification";
    case "in-progress":
    case "locked":
    default:
      return "portfolio";
  }
}

export function previewSocialHandle(
  platform: ActivationSocialPlatform,
  preferredHandle: string,
): { handle: string; profileUrl: string } {
  const base =
    preferredHandle.replace(/^@/, "").trim().toLowerCase() || "previewcreator";
  switch (platform) {
    case "X":
      return {
        handle: `@${base}`,
        profileUrl: `https://x.com/${base}`,
      };
    case "LinkedIn":
      return {
        handle: base,
        profileUrl: `https://www.linkedin.com/in/${base}`,
      };
    case "YouTube":
      return {
        handle: `@${base}`,
        profileUrl: `https://youtube.com/@${base}`,
      };
  }
}

export function statusLabel(status: CreatorActivationStatus): string {
  switch (status) {
    case "locked":
      return "Locked";
    case "in-progress":
      return "In Progress";
    case "awaiting-verification":
      return "Awaiting Verification";
    case "approved":
      return "Approved";
    case "needs-changes":
      return "Needs Changes";
  }
}
