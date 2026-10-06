"use client";

import { apiRequest } from "@/common/http/api-client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DeleteEntryButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const ok = await apiRequest(`/api/v1/mmr-entries/${id}`, { method: "DELETE" }).then(
      () => true,
      () => false,
    );
    setBusy(false);
    if (ok) {
      toast.success("Entry deleted");
      router.refresh();
    } else {
      toast.error("Couldn't delete. Please try again.");
    }
    setConfirming(false);
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <Button size="sm" variant="destructive" onClick={remove} disabled={busy}>
          {busy ? "Deleting…" : "Delete"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Keep
        </Button>
      </span>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-loss"
      aria-label={`Delete entry ${label}`}
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
