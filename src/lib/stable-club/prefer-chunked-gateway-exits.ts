/**
 * MetaMask Mobile (and WC-class mobile signers) privately re-sim nested
 * multi-LP gateway exits and Close-only-reject them (~2M+ gas) even when
 * HTTP eth_call succeeds. Force one-LP chunk exits for those wallets.
 * Desktop extension MetaMask keeps oneshot-first.
 */

export function isMobileWalletUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|MetaMaskMobile/i.test(ua);
}

export function isWalletConnectLikeConnector(
  connectorId: string,
  connectorName: string,
): boolean {
  return /walletconnect|appkit|reown|coinbase|phantom|wallet.?connect/i.test(
    `${connectorId} ${connectorName}`,
  );
}

export function shouldPreferChunkedGatewayExits(params: {
  connectorId?: string | null;
  connectorName?: string | null;
  userAgent?: string | null;
  provider?: { isMetaMask?: boolean } | null;
}): boolean {
  const ua = params.userAgent ?? "";
  const id = params.connectorId ?? "";
  const name = params.connectorName ?? "";
  if (isMobileWalletUserAgent(ua)) return true;
  if (isWalletConnectLikeConnector(id, name)) return true;
  const mm =
    Boolean(params.provider?.isMetaMask) ||
    /metamask|io\.metamask/i.test(`${id} ${name} ${ua}`);
  // Desktop MetaMask extension alone must stay oneshot-first.
  return mm && isMobileWalletUserAgent(ua);
}
