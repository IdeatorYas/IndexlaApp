import type { Metadata } from "next";
import { Bricolage_Grotesque, Source_Sans_3 } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "600", "700"],
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

/** Cache-bust favicons so browsers pick up the transparent INDEXLA mark. */
const ICON_V = "20260911b";

export const metadata: Metadata = {
  title: "INDEXLA App",
  description:
    "INDEXLA decentralized portfolio management application — non-custodial, multi-chain, user-authorized automation.",
  icons: {
    icon: [
      { url: `/favicon.ico?v=${ICON_V}`, sizes: "any" },
      { url: `/favicon-16.png?v=${ICON_V}`, sizes: "16x16", type: "image/png" },
      { url: `/favicon-32.png?v=${ICON_V}`, sizes: "32x32", type: "image/png" },
      { url: `/favicon-48.png?v=${ICON_V}`, sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: `/apple-icon.png?v=${ICON_V}`, sizes: "180x180", type: "image/png" }],
    shortcut: `/favicon.ico?v=${ICON_V}`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body
        className={`${display.variable} ${body.variable} min-h-screen antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
