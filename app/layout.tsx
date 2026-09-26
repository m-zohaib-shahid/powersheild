import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PowerShield - Predictive Electricity Tariff Safeguard",
    template: "%s | PowerShield",
  },
  description:
    "PowerShield tracks your meter readings in real time, projects month-end consumption and keeps you inside the safe slab before penalty rates hit.",
  applicationName: "PowerShield",
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-900 font-sans text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
