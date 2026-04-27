import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LOOGA LEGENDS — League 375288",
  description: "Weekly fines, gloats and missed reports. Pay up.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${anton.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <header className="border-b-4 border-ink bg-paper">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-baseline justify-between gap-4 flex-wrap">
            <Link href="/" className="font-display text-3xl md:text-4xl tracking-tight uppercase leading-none">
              LOOGA <span className="text-tabloid">LEGENDS</span>
            </Link>
            <nav className="flex gap-4 text-sm uppercase font-bold">
              <Link href="/propose" className="hover:text-tabloid">Propose</Link>
              <Link href="/second" className="hover:text-tabloid">Second</Link>
              <Link href="/admin" className="hover:text-tabloid">Admin</Link>
              <Link href="/login" className="hover:text-tabloid">Login</Link>
            </nav>
          </div>
          <div className="bg-tabloid text-paper text-xs uppercase font-bold tracking-widest py-1">
            <div className="max-w-5xl mx-auto px-4 flex justify-between gap-4">
              <span>★ EXCLUSIVE ★ THIS WEEK&apos;S BIGGEST FLOPS — NAMED &amp; SHAMED ★</span>
              <span className="hidden sm:inline">LEAGUE 375288</span>
            </div>
          </div>
        </header>
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">{children}</main>
        <footer className="border-t-4 border-ink mt-8 py-4 text-xs uppercase tracking-widest text-center">
          The People&apos;s Pot · No Refunds · Pay Up
        </footer>
      </body>
    </html>
  );
}
