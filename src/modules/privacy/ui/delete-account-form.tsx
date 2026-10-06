"use client";

import { apiRequest } from "@/common/http/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Type DELETE, then delete the account; signs out and goes home. */
export function DeleteAccountForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = text.trim() === "DELETE";
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        setBusy(true);
        setError(null);
        try {
          await apiRequest("/api/v1/me/delete", { method: "POST", body: { confirm: "DELETE" } });
          // Signed out now: refresh so the app shell drops the account.
          router.replace("/?deleted=1");
          router.refresh();
        } catch {
          setError("Couldn't delete your account right now. Nothing was removed; try again.");
          setBusy(false);
        }
      }}
    >
      <label className="block text-sm" htmlFor="confirm-delete">
        Type <strong>DELETE</strong> to confirm
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="confirm-delete"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          className="h-9 w-40 rounded-lg border border-white/10 bg-background px-3 text-sm"
        />
        <Button type="submit" variant="destructive" disabled={!ready || busy} className="gap-2">
          <Trash2 aria-hidden className="size-4" />
          {busy ? "Deleting…" : "Delete my account"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      )}
    </form>
  );
}
