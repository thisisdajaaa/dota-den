"use client";

import { useState } from "react";
import Image from "next/image";
import { Copy, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useLocale, useT } from "@/common/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/common/i18n/locales";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CARD_FORMATS, CARD_SIZES, facebookShareUrl, type CardFormat } from "../domain/share-card";

type Target =
  | { kind: "session"; ref: string }
  | { kind: "week" }
  | { kind: "streak" }
  | { kind: "match"; ref: string }
  | { kind: "year"; year: number }
  | { kind: "journey"; range: "3m" | "6m" | "1y" | "all" };

interface Link {
  slug: string;
  url: string;
  updatedAt: string;
}

/**
 * Makes (or refreshes) a share link, then shows its card: pick the card's language (the site's
 * by default) and size, then copy the link, download the image or post it to Facebook.
 */
export function ShareButton({ target }: { target: Target }) {
  const t = useT();
  const siteLocale = useLocale();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<Link | null>(null);
  const [lang, setLang] = useState<Locale>(siteLocale);
  const [format, setFormat] = useState<CardFormat>("wide");

  async function share() {
    setBusy(true);
    try {
      setLink(await apiRequest<Link>("/api/v1/me/shares", { method: "POST", body: target }));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : t("shares.button.failed"));
    } finally {
      setBusy(false);
    }
  }

  const pageUrl = link ? `${link.url}?lang=${lang}` : "";
  const imageUrl = link
    ? `/og/share/${link.slug}?v=${new Date(link.updatedAt).getTime()}&lang=${lang}&format=${format}`
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      toast.success(t("shares.button.copied"), { description: pageUrl });
    } catch {
      toast.success(t("shares.button.ready"), { description: pageUrl });
    }
  }

  async function more() {
    try {
      await navigator.share({ url: pageUrl });
    } catch (e) {
      // Closing the share sheet isn't an error; anything else falls back to copying.
      if (!(e instanceof DOMException && e.name === "AbortError")) await copy();
    }
  }

  const choice = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors touch:tap-area",
      active
        ? "border-gold/60 bg-gold/15 text-foreground"
        : "border-white/10 text-muted-foreground hover:text-foreground",
    );
  const size = CARD_SIZES[format];

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" disabled={busy} onClick={share}>
        <Share2 aria-hidden className="size-4" /> {t("shares.button.label")}
      </Button>
      <Dialog open={link !== null} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("shares.dialog.title")}</DialogTitle>
            <DialogDescription>{t("shares.dialog.description")}</DialogDescription>
          </DialogHeader>
          {link && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p id="share-lang" className="text-xs text-muted-foreground">
                  {t("shares.dialog.language")}
                </p>
                <div role="group" aria-labelledby="share-lang" className="flex flex-wrap gap-2">
                  {LOCALES.map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={lang === l}
                      className={choice(lang === l)}
                      onClick={() => setLang(l)}
                    >
                      {LOCALE_NAMES[l]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p id="share-format" className="text-xs text-muted-foreground">
                  {t("shares.dialog.format")}
                </p>
                <div role="group" aria-labelledby="share-format" className="flex flex-wrap gap-2">
                  {CARD_FORMATS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={format === f}
                      className={choice(format === f)}
                      onClick={() => setFormat(f)}
                    >
                      {t(`shares.dialog.${f}`)}
                    </button>
                  ))}
                </div>
              </div>
              <Image
                key={imageUrl}
                src={imageUrl}
                alt={t("shares.dialog.preview")}
                width={size.width}
                height={size.height}
                unoptimized
                className={cn(
                  "mx-auto rounded-lg border border-white/10 bg-muted",
                  format === "square" ? "w-2/3" : "w-full",
                )}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-2" onClick={copy}>
                  <Copy aria-hidden className="size-4" /> {t("shares.dialog.copy")}
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <a href={`${imageUrl}&download=1`} download>
                    <Download aria-hidden className="size-4" /> {t("shares.dialog.download")}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <a href={facebookShareUrl(pageUrl)} target="_blank" rel="noopener noreferrer">
                    <FacebookMark /> {t("shares.dialog.facebook")}
                  </a>
                </Button>
                {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                  <Button size="sm" variant="ghost" className="gap-2" onClick={more}>
                    <Share2 aria-hidden className="size-4" /> {t("shares.dialog.more")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Facebook's "f" (a plain glyph; no Facebook script is loaded). */
function FacebookMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4a20 20 0 0 0-2.2-.1c-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9z" />
    </svg>
  );
}
