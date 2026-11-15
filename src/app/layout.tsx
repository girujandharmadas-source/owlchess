import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OWLChess · Hybrid AI Chess Trainer",
  description: "Play Stockfish 19 at your level with live tactical motif detection and sub-5s AI coaching.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col selection:bg-[#df3ca9]/40 selection:text-white">{children}</body>
    </html>
  );
}
