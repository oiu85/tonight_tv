import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { ToastProvider, TooltipProvider } from "@/components/ui/primitives";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--tt-font",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Tonight TV", template: "%s · Tonight TV" },
  description: "A private synchronized watch room.",
  applicationName: "Tonight TV",
};

export const viewport: Viewport = {
  themeColor: "#080C12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} style={{ colorScheme: "dark" }}>
      <body><ToastProvider><TooltipProvider>{children}</TooltipProvider></ToastProvider></body>
    </html>
  );
}
