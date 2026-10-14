"use client";

import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import { MAX_GROUP_MEMBERS } from "../domain/group";

/** The invite link with a copy button; the owner can also reset it. */
export function InviteLink({
  groupId,
  invitePath,
  appUrl,
  canReset,
}: {
  groupId: string;
  invitePath: string;
  appUrl: string;
  canReset: boolean;
}) {
  const t = useT();
  const [path, setPath] = useState(invitePath);
  const [busy, setBusy] = useState(false);
  const url = new URL(path, appUrl).toString();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("groups.invite.copied"));
    } catch {
      toast.error(t("groups.invite.copyFailed"));
    }
  }

  async function reset() {
    setBusy(true);
    try {
      const next = await apiRequest<{ invitePath: string }>(`/api/v1/groups/${groupId}/invite`, {
        method: "POST",
      });
      setPath(next.invitePath);
      toast.success(t("groups.invite.resetDone"));
    } catch {
      toast.error(t("groups.invite.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="invite-title">
      <div className="space-y-1">
        <h2 id="invite-title" className="text-lg font-semibold">
          {t("groups.invite.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("groups.invite.description", { max: MAX_GROUP_MEMBERS })}
        </p>
      </div>
      <p
        className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-xs break-all"
        data-testid="invite-url"
      >
        {url}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Copy aria-hidden />
          {t("groups.invite.copy")}
        </Button>
        {canReset && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={busy}
            title={t("groups.invite.resetHint")}
          >
            <RefreshCw aria-hidden />
            {t("groups.invite.reset")}
          </Button>
        )}
      </div>
    </section>
  );
}
