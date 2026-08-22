import { DemoWalletProvider } from "@/components/wallet/DemoWalletProvider";
import { AppShell } from "@/components/shell/AppShell";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DemoWalletProvider>
      <AppShell>{children}</AppShell>
    </DemoWalletProvider>
  );
}
