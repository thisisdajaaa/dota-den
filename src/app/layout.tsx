import type { Metadata } from "next";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Display face for the wordmark and page titles only; numbers stay in the sans.
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "Dota Den", template: "%s · Dota Den" },
  description:
    "An unofficial Dota 2 companion for solo and party progression, patch notes and draft practice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
