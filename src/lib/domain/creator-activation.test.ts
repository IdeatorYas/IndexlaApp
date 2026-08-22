import { describe, expect, it } from "vitest";
import {
  CREATOR_ACTIVATION_REQUIREMENT_COPY,
  canSubmitVerification,
  createEmptyActivationDraft,
  deriveActivationStatus,
  hasConnectedSocial,
  previewSocialHandle,
} from "@/lib/domain/creator-activation";

describe("creator activation domain", () => {
  it("starts locked with no connected socials", () => {
    const draft = createEmptyActivationDraft();
    expect(draft.status).toBe("locked");
    expect(hasConnectedSocial(draft)).toBe(false);
    expect(deriveActivationStatus(draft)).toBe("locked");
  });

  it("moves to in-progress when a public portfolio is selected", () => {
    const draft = createEmptyActivationDraft();
    draft.selectedPortfolioId = "ai-infra-index";
    draft.selectedPortfolioName = "AI Infrastructure Index";
    expect(deriveActivationStatus(draft)).toBe("in-progress");
  });

  it("requires portfolio, social, profile fields and disclosures to submit", () => {
    const draft = createEmptyActivationDraft();
    expect(canSubmitVerification(draft)).toBe(false);
    draft.selectedPortfolioId = "ai-infra-index";
    draft.selectedPortfolioName = "AI Infrastructure Index";
    draft.socials[0] = {
      platform: "X",
      connected: true,
      handle: "@preview",
      profileUrl: "https://x.com/preview",
    };
    draft.displayName = "Preview Creator";
    draft.handle = "preview";
    draft.bio = "Illustrative bio";
    draft.specialty = "AI";
    draft.disclosuresAccepted = true;
    expect(canSubmitVerification(draft)).toBe(true);
  });

  it("exports required activation copy and preview social handles", () => {
    expect(CREATOR_ACTIVATION_REQUIREMENT_COPY).toContain(
      "published public portfolio",
    );
    expect(previewSocialHandle("LinkedIn", "demo").handle).toBe("demo");
    expect(previewSocialHandle("YouTube", "demo").profileUrl).toContain(
      "youtube.com",
    );
  });
});
