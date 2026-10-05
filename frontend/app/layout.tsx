import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CourtProvider } from "../lib/court";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chargeback",
  description:
    "A standing veto on agent spend. A stranger can fund a second look; a GenLayer validator panel reads the evidence and decides.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07090d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <CourtProvider>{children}</CourtProvider>
      </body>
    </html>
  );
}
