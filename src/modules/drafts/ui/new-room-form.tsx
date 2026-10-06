"use client";

import { apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Side } from "../domain/draft-state";
import { listRulesets } from "../domain/rulesets";
import { rulesetName, sideName } from "./i18n";

/** Room settings; creating the room seats you and opens the lobby. */
export function NewRoomForm() {
  const t = useT();
  const router = useRouter();
  const [rulesetId, setRulesetId] = useState(listRulesets()[0].id);
  const [hostSide, setHostSide] = useState<Side>("radiant");
  const [firstSide, setFirstSide] = useState<Side>("radiant");
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = await apiRequest<{ roomId: string }>("/api/v1/drafts/rooms", {
        method: "POST",
        body: { rulesetId, hostSide, firstSide, timerEnabled },
      });
      router.push(`/draft/rooms/${body.roomId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("drafts.newRoom.createFailed"));
      setBusy(false);
    }
  }

  const field = "grid gap-1.5 text-sm";
  return (
    <form onSubmit={create} className="panel grid max-w-xl gap-5 p-5">
      <label className={field}>
        <span className="font-medium">{t("drafts.newRoom.mode")}</span>
        <Select value={rulesetId} onValueChange={setRulesetId}>
          <SelectTrigger aria-label={t("drafts.newRoom.mode")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {listRulesets().map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {rulesetName(t, r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className={field}>
          <span className="font-medium">{t("drafts.newRoom.yourSide")}</span>
          <Select value={hostSide} onValueChange={(v) => setHostSide(v as Side)}>
            <SelectTrigger aria-label={t("drafts.newRoom.yourSide")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="radiant">{sideName(t, "radiant")}</SelectItem>
              <SelectItem value="dire">{sideName(t, "dire")}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className={field}>
          <span className="font-medium">{t("drafts.newRoom.firstPick")}</span>
          <Select value={firstSide} onValueChange={(v) => setFirstSide(v as Side)}>
            <SelectTrigger aria-label={t("drafts.newRoom.firstPick")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="radiant">{sideName(t, "radiant")}</SelectItem>
              <SelectItem value="dire">{sideName(t, "dire")}</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={timerEnabled}
          onChange={(e) => setTimerEnabled(e.target.checked)}
          className="accent-[var(--gold)]"
        />
        {t("drafts.newRoom.timer")}
      </label>
      <Button type="submit" disabled={busy} className="gap-2 justify-self-start">
        <Users aria-hidden className="size-4" />
        {busy ? t("drafts.newRoom.creating") : t("drafts.newRoom.create")}
      </Button>
    </form>
  );
}
