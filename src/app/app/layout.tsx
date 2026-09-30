import { cookies } from "next/headers";
import { AppKitProvider } from "@/components/wallet/AppKitProvider";
import { AppWalletProvider } from "@/components/wallet/DemoWalletProvider";
import { SolanaWalletProvider } from "@/components/degen-club/SolanaWalletProvider";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  return (
    <AppKitProvider cookies={cookieHeader}>
      <AppWalletProvider>
        <SolanaWalletProvider>
          <AppShell>{children}</AppShell>
        </SolanaWalletProvider>
      </AppWalletProvider>
    </AppKitProvider>
  );
}
