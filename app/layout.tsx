import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { ToastProvider, TooltipProvider } from "@/components/primitives";
import { LocaleProvider, getDirection } from "@/i18n";
import { getMessages, getServerLocale } from "@/i18n/server";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--tt-font",
  weight: ["400", "500", "600", "700"],
});

// IBM Plex Sans Arabic is loaded as a static CSS import so we get the
// actual font files (with proper Arabic shaping, ligatures, and weight
// variants) without any FOUT. The CSS variables and the `lang="ar"`
// selector below pick it up when Arabic is the active locale.
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";

export const metadata: Metadata = {
  title: { default: "Tonight TV", template: "%s · Tonight TV" },
  description: "A private synchronized watch room.",
  applicationName: "Tonight TV",
};

export const viewport: Viewport = {
  themeColor: "#080C12",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getServerLocale();
  const direction = getDirection(locale);
  const messages = getMessages(locale);

  return (
    <html
      lang={locale}
      dir={direction}
      className={`${inter.variable} tt-locale-${locale}`}
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <body>
        <LocaleProvider initialLocale={locale} initialMessages={messages}>
          <ToastProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
