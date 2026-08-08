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
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
