"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { apiRequest, errorMessage } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_GROUP_NAME } from "../domain/group";

/** Rename and delete (owner), leave (anyone). Destructive actions ask once more inline. */
export function GroupActions({
  groupId,
  name,
  isOwner,
}: {
  groupId: string;
  name: string;
  isOwner: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);
  const [busy, setBusy] = useState(false);

  async function rename(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest(`/api/v1/groups/${groupId}`, { method: "PATCH", body: { name: draft } });
      toast.success(t("groups.manage.renamed"));
      setRenaming(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, t("groups.manage.renameFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/groups/${groupId}`, { method: "DELETE" });
      toast.success(t("groups.manage.deleted"));
      router.push("/groups");
    } catch (err) {
      toast.error(errorMessage(err, t("groups.manage.deleteFailed")));
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await apiRequest(`/api/v1/groups/${groupId}/leave`, { method: "POST" });
      toast.success(t("groups.manage.left"));
      router.push("/groups");
    } catch (err) {
      toast.error(errorMessage(err, t("groups.manage.leaveFailed")));
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="manage-title">
      <h2 id="manage-title" className="text-lg font-semibold">
        {t("groups.manage.title")}
      </h2>
      {isOwner &&
        (renaming ? (
          <form onSubmit={rename} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="rename-group" className="sr-only">
              {t("groups.manage.renameLabel")}
            </label>
            <Input
              id="rename-group"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_GROUP_NAME}
              required
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy || draft.trim().length < 2}>
                {t("groups.manage.save")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                {t("groups.manage.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(true)}>
            {t("groups.manage.rename")}
          </Button>
        ))}

      {isOwner && (
        <p className="text-xs text-muted-foreground">{t("groups.manage.leaveOwnerHint")}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {confirm === "leave" ? (
          <>
            <Button type="button" size="sm" variant="destructive" onClick={leave} disabled={busy}>
              {t("groups.manage.leaveConfirm")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              {t("groups.manage.cancel")}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConfirm("leave")}
            disabled={confirm !== null}
          >
            {t("groups.manage.leave")}
          </Button>
        )}
        {isOwner &&
          (confirm === "delete" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={destroy}
                disabled={busy}
              >
                {t("groups.manage.deleteConfirm")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                {t("groups.manage.cancel")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setConfirm("delete")}
              disabled={confirm !== null}
            >
              {t("groups.manage.delete")}
            </Button>
          ))}
      </div>
    </section>
  );
}
