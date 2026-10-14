"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiRequest, errorMessage } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";

/** Owner only: remove one member, after a second click. */
export function RemoveMemberButton({
  groupId,
  accountId32,
  name,
}: {
  groupId: string;
  accountId32: number;
  name: string;
}) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/groups/${groupId}/members/${accountId32}`, { method: "DELETE" });
      toast.success(t("groups.group.removed"));
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, t("groups.group.removeFailed")));
      setBusy(false);
      setConfirming(false);
    }
  }

  return confirming ? (
    <Button type="button" size="xs" variant="destructive" onClick={remove} disabled={busy}>
      {t("groups.group.removeConfirm", { name })}
    </Button>
  ) : (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      aria-label={t("groups.group.removeLabel", { name })}
      onClick={() => setConfirming(true)}
    >
      {t("groups.group.remove")}
    </Button>
  );
}
