import { I18nProvider } from "@/common/i18n/client";
import { LOCALE_TAGS } from "@/common/i18n/locales";
import { englishMessages, MESSAGES } from "@/common/i18n/messages";
import { getLocale } from "@/common/i18n/server";
import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/app-shell";
import { ServiceWorker } from "@/components/pwa";
import "./globals.css";

// Fonts are bundled (no Google Fonts download at build time, which made CI builds flaky).
// Geist: the `geist` package's self-hosted files; variables --font-geist-sans/--font-geist-mono.
const geistSans = GeistSans;
const geistMono = GeistMono;
// Display face for the wordmark and page titles only; numbers stay in the sans.
// Cinzel variable font (OFL), vendored from Fontsource.
const cinzel = localFont({
  src: "./fonts/cinzel-latin-wght.woff2",
  variable: "--font-cinzel",
  weight: "400 900",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute URLs for link-preview images (Discord and others need them).
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Dota Den", template: "%s · Dota Den" },
  description:
    "An unofficial Dota 2 companion for solo and party progression, patch notes and draft practice.",
  applicationName: "Dota Den",
  // Installed on iOS: full screen with the dark status bar, and our icon.
  appleWebApp: { capable: true, title: "Dota Den", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0605",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={LOCALE_TAGS[locale]}
      className={`dark ${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={locale} messages={MESSAGES[locale]} fallback={englishMessages}>
          <TooltipProvider>
            <AppShell>{children}</AppShell>
            <Toaster />
            <ServiceWorker />
          </TooltipProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
