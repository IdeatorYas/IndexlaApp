import "@/components/degen-club/degen-club.css";
import { SolanaWalletProvider } from "@/components/degen-club/SolanaWalletProvider";

export default function DegenClubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SolanaWalletProvider>
      <div className="degen-hub">
        <div className="degen-hub-inner">{children}</div>
      </div>
    </SolanaWalletProvider>
  );
}
