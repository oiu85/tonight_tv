import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { ToastProvider, TooltipProvider } from "@/components/primitives";
import { LocaleProvider, getDirection } from "@/i18n";
import { getMessages, getServerLocale } from "@/i18n/server";
import { ThemeProvider } from "@/theme";
import { getServerTheme } from "@/theme/server";

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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const messages = getMessages(locale);
  return {
    title: { default: messages.common.appName, template: `%s · ${messages.common.appName}` },
    description: messages.entry.metaDescription,
    applicationName: messages.common.appName,
    referrer: "origin-when-cross-origin",
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
      apple: [{ url: "/apple-icon", sizes: "180x180" }],
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getServerTheme();
  return {
    themeColor: theme === "light" ? "#F4F6FA" : "#080C12",
    colorScheme: theme,
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getServerLocale();
  const direction = getDirection(locale);
  const messages = getMessages(locale);
  const theme = await getServerTheme();

  return (
    <html
      lang={locale}
      dir={direction}
      data-theme={theme}
      className={`${inter.variable} tt-locale-${locale}${direction === "rtl" ? " tt-rtl" : ""}`}
      style={{ colorScheme: theme }}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider initialTheme={theme}>
          <LocaleProvider initialLocale={locale} initialMessages={messages}>
            <ToastProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </ToastProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
