import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://daykeeper-tau.vercel.app"),
  title: "Daykeeper — a public treasury with a new keeper every day",
  description:
    "One shared treasury. One key. A new keeper every day, chosen by continuous auction. The key can speak and give. It can never take.",
  openGraph: {
    title: "Daykeeper",
    description:
      "Buy the right to give a shared treasury away for one day. The chain stops you from keeping any of it.",
    type: "website",
    siteName: "Daykeeper",
  },
  twitter: {
    card: "summary_large_image",
    title: "Daykeeper",
    description:
      "One shared treasury, a new keeper every day, and a key that can give and speak but never take.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexMono.variable} ${instrument.variable}`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
