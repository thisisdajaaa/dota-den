"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/** Opt in to the Everyone boards. Profiles are private by default. */
export function VisibilityToggle({ listed }: { listed: boolean }) {
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
        next ? "You're listed on the Everyone boards." : "You're no longer listed publicly.",
      );
      router.refresh();
    } catch {
      setOn(!next);
      toast.error("Couldn't save that. Try again.");
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
        Show me on the Everyone boards
        <span className="block text-xs text-muted-foreground">
          Off by default. Your friends see you on the Friends boards either way.
        </span>
      </span>
    </label>
  );
}
