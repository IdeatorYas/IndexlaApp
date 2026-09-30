import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

const closeMock = vi.fn(async () => undefined);
const disconnectAsyncMock = vi.fn(async () => undefined);

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/degen-club/product/solana-memecoin-index",
}));

vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: vi.fn(), close: closeMock }),
}));

vi.mock("wagmi", () => ({
  useDisconnect: () => ({ disconnectAsync: disconnectAsyncMock }),
}));

vi.mock("@/lib/wallet/wagmi-config", () => ({
  hasWalletConnectProjectId: () => true,
}));

import { SolanaEvmIsolation } from "@/components/wallet/SolanaEvmIsolation";

describe("SolanaEvmIsolation", () => {
  beforeEach(() => {
    closeMock.mockClear();
    disconnectAsyncMock.mockClear();
  });

  afterEach(() => cleanup());

  it("closes AppKit modal and disconnects EVM on Solana routes", async () => {
    render(<SolanaEvmIsolation />);
    await waitFor(() => expect(closeMock).toHaveBeenCalled());
    await waitFor(() => expect(disconnectAsyncMock).toHaveBeenCalled());
  });
});
