import { describe, expect, it } from "vitest";
import {
  STABLE_CLUB_DEV_PANEL_CHAIN_ID,
  canExposeStableClubDevPanel,
  isLocalhostHost,
} from "@/lib/stable-club/dev-panel-access";

describe("canExposeStableClubDevPanel", () => {
  it("allows localhost + dev flag + Hardhat chain", () => {
    expect(
      canExposeStableClubDevPanel({
        nodeEnv: "development",
        host: "localhost:3456",
        devFlagEnabled: true,
        walletChainId: STABLE_CLUB_DEV_PANEL_CHAIN_ID,
      }),
    ).toBe(true);
  });

  it("denies production even with dev flag and localhost", () => {
    expect(
      canExposeStableClubDevPanel({
        nodeEnv: "production",
        host: "localhost:3000",
        devFlagEnabled: true,
        walletChainId: STABLE_CLUB_DEV_PANEL_CHAIN_ID,
      }),
    ).toBe(false);
  });

  it("denies production Base host even if dev flag is accidentally enabled", () => {
    expect(
      canExposeStableClubDevPanel({
        nodeEnv: "production",
        host: "app.indexla.tech",
        devFlagEnabled: true,
      }),
    ).toBe(false);
  });

  it("denies non-localhost hosts even in development", () => {
    expect(
      canExposeStableClubDevPanel({
        nodeEnv: "development",
        host: "app.indexla.tech",
        devFlagEnabled: true,
      }),
    ).toBe(false);
  });

  it("denies Base mainnet wallet chain 8453 on localhost", () => {
    expect(
      canExposeStableClubDevPanel({
        nodeEnv: "development",
        host: "127.0.0.1:3456",
        devFlagEnabled: true,
        walletChainId: 8453,
      }),
    ).toBe(false);
  });

  it("allows localhost when wallet chain is not connected yet", () => {
    expect(
      canExposeStableClubDevPanel({
        nodeEnv: "development",
        host: "127.0.0.1:3456",
        devFlagEnabled: true,
        walletChainId: null,
      }),
    ).toBe(true);
  });
});

describe("isLocalhostHost", () => {
  it("recognizes localhost and loopback", () => {
    expect(isLocalhostHost("localhost:3456")).toBe(true);
    expect(isLocalhostHost("127.0.0.1")).toBe(true);
    expect(isLocalhostHost("app.indexla.tech")).toBe(false);
  });
});
