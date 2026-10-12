"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";

export interface SharedLinkRow {
  slug: string;
  url: string;
  label: string;
}

/** The player's share links, each removable (the link then stops working). */
export function SharedLinks({ links: initial }: { links: SharedLinkRow[] }) {
  const t = useT();
  const [links, setLinks] = useState(initial);

  async function remove(slug: string) {
    try {
      await apiRequest(`/api/v1/me/shares/${slug}`, { method: "DELETE" });
      setLinks((l) => l.filter((x) => x.slug !== slug));
      toast.success(t("shares.account.removed"));
    } catch {
      toast.error(t("shares.account.removeFailed"));
    }
  }

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="shares-title">
      <div>
        <h2 id="shares-title" className="text-lg font-semibold">
          {t("shares.account.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("shares.account.description")}</p>
      </div>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("shares.account.none")}</p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.slug} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <a href={l.url} className="text-gold hover:underline">
                {l.label}
              </a>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("shares.account.removeLabel", { link: l.label })}
                onClick={() => remove(l.slug)}
              >
                {t("shares.account.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
