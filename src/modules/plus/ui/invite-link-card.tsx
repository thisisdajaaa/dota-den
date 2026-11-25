"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";

/** The player's invite link, with copy and (where the browser has it) share. */
export function InviteLinkCard({ url }: { url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("plus.referral.error.down"));
    }
  }

  async function share() {
    try {
      await navigator.share({ text: t("plus.invite.shareText"), url });
    } catch {
      // Closed the share sheet: nothing to do.
    }
  }

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="invite-link-title">
      <h2 id="invite-link-title" className="text-lg font-semibold">
        {t("plus.invite.linkLabel")}
      </h2>
      <p
        className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-sm break-all"
        data-testid="referral-url"
      >
        {url}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={copy} className="gap-2">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t("plus.invite.copied") : t("plus.invite.copy")}
        </Button>
        {canShare && (
          <Button type="button" variant="outline" size="sm" onClick={share} className="gap-2">
            <Share2 aria-hidden /> {t("plus.invite.share")}
          </Button>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {copied ? t("plus.invite.copied") : ""}
      </p>
    </section>
  );
}
