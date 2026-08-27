/** Injected EIP-1193 provider for Stable Club Playwright E2E (local Hardhat only). */
export const STABLE_CLUB_E2E_INJECT_WALLET_SCRIPT = `
(() => {
  const ACCOUNTS = ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
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
