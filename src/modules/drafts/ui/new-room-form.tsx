"use client";

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

/** Room settings; creating the room seats you and opens the lobby. */
export function NewRoomForm() {
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
      const res = await fetch("/api/v1/drafts/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rulesetId, hostSide, firstSide, timerEnabled }),
      });
      const body = (await res.json().catch(() => null)) as {
        roomId?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok || !body?.roomId)
        throw new Error(body?.error?.message ?? "Couldn't create the room.");
      router.push(`/draft/rooms/${body.roomId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the room.");
      setBusy(false);
    }
  }

  const field = "grid gap-1.5 text-sm";
  return (
    <form onSubmit={create} className="panel grid max-w-xl gap-5 p-5">
      <label className={field}>
        <span className="font-medium">Draft mode</span>
        <Select value={rulesetId} onValueChange={setRulesetId}>
          <SelectTrigger aria-label="Draft mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {listRulesets().map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={field}>
          <span className="font-medium">Your side</span>
          <Select value={hostSide} onValueChange={(v) => setHostSide(v as Side)}>
            <SelectTrigger aria-label="Your side">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="radiant">Radiant</SelectItem>
              <SelectItem value="dire">Dire</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className={field}>
          <span className="font-medium">First pick</span>
          <Select value={firstSide} onValueChange={(v) => setFirstSide(v as Side)}>
            <SelectTrigger aria-label="First pick">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="radiant">Radiant</SelectItem>
              <SelectItem value="dire">Dire</SelectItem>
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
        Use the Captain&apos;s Mode timer (turn time plus reserve time)
      </label>
      <Button type="submit" disabled={busy} className="gap-2 justify-self-start">
        <Users aria-hidden className="size-4" />
        {busy ? "Creating…" : "Create room"}
      </Button>
    </form>
  );
}
