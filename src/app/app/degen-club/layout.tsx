import "@/components/degen-club/degen-club.css";

export default function DegenClubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // SolanaWalletProvider is lifted to /app layout so the header and
  // SolanaMemeBasketPanel share the same Solana connection.
  return (
    <div className="degen-hub">
      <div className="degen-hub-inner">{children}</div>
    </div>
  );
}
