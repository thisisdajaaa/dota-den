"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiClientError, apiRequest, errorMessage } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_GROUP_NAME, MAX_GROUPS_PER_USER } from "../domain/group";
import type { GroupSummaryDto } from "../dtos/responses/groups.dto";

/** Name a new group; opens it once created. */
export function CreateGroupForm({ atCap }: { atCap: boolean }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const group = await apiRequest<GroupSummaryDto>("/api/v1/groups", {
        method: "POST",
        body: { name },
      });
      toast.success(t("groups.create.created"));
      router.push(`/groups/${group.id}`);
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 400
          ? t("groups.create.invalid")
          : errorMessage(err, t("groups.create.failed")),
      );
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="create-group">
      <h2 id="create-group" className="text-lg font-semibold">
        {t("groups.create.title")}
      </h2>
      {atCap ? (
        <p className="text-sm text-muted-foreground">
          {t("groups.create.atCap", { max: MAX_GROUPS_PER_USER })}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor="group-name" className="text-sm font-medium">
            {t("groups.create.nameLabel")}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("groups.create.namePlaceholder")}
              maxLength={MAX_GROUP_NAME}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "group-name-error" : undefined}
            />
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              {busy ? t("groups.create.creating") : t("groups.create.submit")}
            </Button>
          </div>
          {error && (
            <p id="group-name-error" role="alert" className="text-sm text-loss">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
