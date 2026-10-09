"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";

type Target = { kind: "session"; ref: string } | { kind: "week" };

/** Makes (or refreshes) a share link, then opens the share sheet or copies the link. */
export function ShareButton({ target }: { target: Target }) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const link = await apiRequest<{ url: string }>("/api/v1/me/shares", {
        method: "POST",
        body: target,
      });
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ url: link.url });
          return;
        } catch (e) {
          // Closing the share sheet isn't an error; anything else falls back to copying.
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(link.url);
        toast.success(t("shares.button.copied"), { description: link.url });
      } catch {
        toast.success(t("shares.button.ready"), { description: link.url });
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : t("shares.button.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="gap-2" disabled={busy} onClick={share}>
      <Share2 aria-hidden className="size-4" /> {t("shares.button.label")}
    </Button>
  );
}
