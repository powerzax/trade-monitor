import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trade Monitor",
  description: "Stock & Crypto analysis for swing trading",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0a0e1a] text-slate-200">{children}</body>
    </html>
  );
}
