"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/common/i18n/client";

/** Opt in to the Everyone boards. Profiles are private by default. */
export function VisibilityToggle({ listed }: { listed: boolean }) {
  const t = useT();
  const router = useRouter();
  const [on, setOn] = useState(listed);
  const [busy, setBusy] = useState(false);

  async function change(next: boolean) {
    setBusy(true);
    setOn(next);
    try {
      const res = await fetch("/api/v1/me/settings/visibility", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileVisibility: next ? "public" : "private" }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        next ? t("leaderboards.visibility.listed") : t("leaderboards.visibility.unlisted"),
      );
      router.refresh();
    } catch {
      setOn(!next);
      toast.error(t("leaderboards.visibility.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={(e) => change(e.target.checked)}
        className="mt-1 accent-[var(--gold)]"
      />
      <span>
        {t("leaderboards.visibility.label")}
        <span className="block text-xs text-muted-foreground">
          {t("leaderboards.visibility.help")}
        </span>
      </span>
    </label>
  );
}
