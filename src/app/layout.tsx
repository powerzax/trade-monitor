import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AmbientBackground } from "@/components/layout/AmbientBackground";
import { SpotlightTracker } from "@/components/layout/SpotlightTracker";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trade Monitor",
  description: "Stock & Crypto analysis for swing trading",
  appleWebApp: { capable: true, title: "Trade Monitor", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0915",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AmbientBackground />
        <SpotlightTracker />
        {children}
      </body>
    </html>
  );
}
