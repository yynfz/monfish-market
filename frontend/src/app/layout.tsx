import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Monfish Market — On-Chain Digital Asset Exchange",
  description:
    "Buy and sell digital assets secured by on-chain escrow on Monad testnet. Instant finality, MetaMask-native, trustless delivery.",
  keywords: ["Monad", "blockchain", "escrow", "NFT", "digital marketplace"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <div id="desktop-notice" role="alert">
          <h1>Desktop View Required</h1>
          <p>The Monfish Market demo requires a viewport width of at least 1024px. Please resize your window or switch to a desktop device.</p>
        </div>
        {children}
      </body>
    </html>
  );
}
