"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiRequest, errorMessage } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import type { GroupSummaryDto } from "../dtos/responses/groups.dto";

/** Join with the invite token from the link, then open the group. */
export function JoinButton({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    try {
      const group = await apiRequest<GroupSummaryDto>("/api/v1/groups/join", {
        method: "POST",
        body: { token },
      });
      toast.success(t("groups.join.joined", { name: group.name }));
      router.push(`/groups/${group.id}`);
    } catch (err) {
      toast.error(errorMessage(err, t("groups.join.failed")));
      setBusy(false);
    }
  }

  return (
    <Button type="button" onClick={join} disabled={busy}>
      {busy ? t("groups.join.joining") : t("groups.join.submit")}
    </Button>
  );
}
