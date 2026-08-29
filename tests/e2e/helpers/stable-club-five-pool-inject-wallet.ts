/**
 * Injected EIP-1193 provider for Phase 2b five-pool deposit verification.
 * Uses Hardhat account #1 (testUser) — receives USDC from deploy-phase2a-local.
 */
export const STABLE_CLUB_FIVE_POOL_E2E_INJECT_WALLET_SCRIPT = `
(() => {
  const ACCOUNTS = ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"];
  async function rpc(method, params) {
    const res = await fetch("/api/stable-club/e2e/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params: params ?? [] }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "RPC failed");
    return json.result;
  }
  window.ethereum = {
    isMetaMask: true,
    request: async ({ method, params }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return ACCOUNTS;
      }
      if (method === "eth_chainId") {
        return "0x2105";
      }
      if (method === "wallet_switchEthereumChain") {
        return null;
      }
      if (method === "eth_sendTransaction") {
        const res = await fetch("/api/stable-club/e2e/send-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params[0]),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "send failed");
        return json.hash;
      }
      return rpc(method, params);
    },
    on: () => {},
    removeListener: () => {},
  };
})();
`;

/** Rejects every eth_sendTransaction (wallet rejection simulation). */
export const STABLE_CLUB_E2E_REJECT_WALLET_SCRIPT = `
(() => {
  const ACCOUNTS = ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"];
  window.ethereum = {
    isMetaMask: true,
    request: async ({ method }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return ACCOUNTS;
      }
      if (method === "eth_chainId") {
        return "0x2105";
      }
      if (method === "eth_sendTransaction") {
        throw new Error("User rejected the request");
      }
      throw new Error("Unsupported: " + method);
    },
    on: () => {},
    removeListener: () => {},
  };
})();
`;

/** Wrong network (Ethereum mainnet). */
export const STABLE_CLUB_E2E_WRONG_NETWORK_SCRIPT = `
(() => {
  const ACCOUNTS = ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"];
  window.ethereum = {
    isMetaMask: true,
    request: async ({ method }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return ACCOUNTS;
      }
      if (method === "eth_chainId") {
        return "0x1";
      }
      throw new Error("Unsupported: " + method);
    },
    on: () => {},
    removeListener: () => {},
  };
})();
`;
