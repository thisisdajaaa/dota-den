"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Circle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import { MAX_CUSTOM_LENGTH, MAX_GOALS, type Goal } from "../domain/goals";

export interface GoalRow {
  goal: Goal;
  label: string;
  current: string;
  met: boolean | null;
  fraction: number | null;
}

type Preset = Goal["type"];

const PRESETS: readonly Preset[] = [
  "winRate",
  "maxPerSession",
  "logAfterSessions",
  "heroGames",
  "custom",
];

function blank(type: Preset, firstHero: number): Goal {
  switch (type) {
    case "winRate":
      return { type, target: 52 };
    case "maxPerSession":
      return { type, target: 4 };
    case "logAfterSessions":
      return { type };
    case "heroGames":
      return { type, heroId: firstHero, target: 5 };
    case "custom":
      return { type, text: "", done: false };
  }
}

const field = "h-8 rounded-md border border-white/10 bg-background px-2 text-sm";

function GoalEditor({
  goal,
  index,
  heroes,
  onChange,
  onRemove,
}: {
  goal: Goal;
  index: number;
  heroes: { id: number; name: string }[];
  onChange: (g: Goal) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const id = `goal-${index}`;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 p-2.5">
      <label htmlFor={`${id}-type`} className="sr-only">
        {t("goals.editor.type", { n: index + 1 })}
      </label>
      <select
        id={`${id}-type`}
        value={goal.type}
        onChange={(e) => onChange(blank(e.target.value as Preset, heroes[0]?.id ?? 1))}
        className={field}
      >
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {t(`goals.presets.${p}`)}
          </option>
        ))}
      </select>
      {goal.type === "winRate" && (
        <label className="flex items-center gap-1.5 text-sm">
          {t("goals.editor.atLeast")}
          <input
            type="number"
            min={40}
            max={80}
            value={goal.target}
            onChange={(e) => onChange({ ...goal, target: Number(e.target.value) })}
            className={cn(field, "w-16")}
          />
          %
        </label>
      )}
      {goal.type === "maxPerSession" && (
        <label className="flex items-center gap-1.5 text-sm">
          {t("goals.editor.atMost")}
          <input
            type="number"
            min={1}
            max={10}
            value={goal.target}
            onChange={(e) => onChange({ ...goal, target: Number(e.target.value) })}
            className={cn(field, "w-16")}
          />
          {t("goals.editor.gamesEach")}
        </label>
      )}
      {goal.type === "heroGames" && (
        <>
          <label htmlFor={`${id}-hero`} className="sr-only">
            {t("goals.editor.hero")}
          </label>
          <select
            id={`${id}-hero`}
            value={goal.heroId}
            onChange={(e) => onChange({ ...goal, heroId: Number(e.target.value) })}
            className={cn(field, "max-w-40")}
          >
            {heroes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="number"
              min={1}
              max={30}
              value={goal.target}
              onChange={(e) => onChange({ ...goal, target: Number(e.target.value) })}
              className={cn(field, "w-16")}
            />
            {t("goals.editor.times")}
          </label>
        </>
      )}
      {goal.type === "custom" && (
        <>
          <label htmlFor={`${id}-text`} className="sr-only">
            {t("goals.editor.yourGoal")}
          </label>
          <input
            id={`${id}-text`}
            value={goal.text}
            maxLength={MAX_CUSTOM_LENGTH}
            onChange={(e) => onChange({ ...goal, text: e.target.value })}
            placeholder={t("goals.editor.customPlaceholder")}
            className={cn(field, "min-w-0 flex-1")}
          />
        </>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("goals.editor.remove", { n: index + 1 })}
        className="ml-auto grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
    </div>
  );
}

function Status({ met }: { met: boolean | null }) {
  const t = useT();
  if (met === true)
    return <Check aria-label={t("goals.status.onTrack")} className="size-4 text-emerald-400" />;
  if (met === false)
    return <X aria-label={t("goals.status.offTrack")} className="size-4 text-rose-400" />;
  return (
    <Circle aria-label={t("goals.status.inProgress")} className="size-4 text-muted-foreground" />
  );
}

/** This week's goals (up to two) with progress, and how last week's went. */
export function GoalsCard({
  rows,
  lastWeek,
  heroes,
  daysLeft,
}: {
  rows: GoalRow[];
  lastWeek: { label: string; met: boolean }[];
  heroes: { id: number; name: string }[];
  daysLeft: number;
}) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Goal[]>(rows.map((r) => r.goal));
  const [busy, setBusy] = useState(false);

  async function save(goals: Goal[]) {
    setBusy(true);
    try {
      await apiRequest("/api/v1/me/goals", { method: "PUT", body: { goals } });
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : t("goals.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const valid = draft.every((g) => g.type !== "custom" || g.text.trim().length > 0);

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="goals-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="kicker">
            {daysLeft === 0 ? t("goals.lastDay") : t("goals.daysLeft", { n: daysLeft })}
          </p>
          <h2 id="goals-title" className="text-lg font-semibold">
            {t("goals.title")}
          </h2>
        </div>
        {!editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(rows.map((r) => r.goal));
              setEditing(true);
            }}
          >
            {rows.length ? (
              <>
                <Pencil aria-hidden /> {t("goals.edit")}
              </>
            ) : (
              <>
                <Plus aria-hidden /> {t("goals.setGoals")}
              </>
            )}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          {draft.map((g, i) => (
            <GoalEditor
              key={i}
              goal={g}
              index={i}
              heroes={heroes}
              onChange={(next) => setDraft(draft.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setDraft(draft.filter((_, j) => j !== i))}
            />
          ))}
          {draft.length < MAX_GOALS && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft([...draft, blank("winRate", heroes[0]?.id ?? 1)])}
            >
              <Plus aria-hidden /> {t("goals.addGoal")}
            </Button>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void save(draft)} disabled={busy || !valid}>
              {busy ? t("goals.saving") : t("goals.save")}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              {t("goals.cancel")}
            </Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("goals.empty", { max: MAX_GOALS })}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5">
                  <Status met={r.met} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.current}</p>
                </div>
                {r.goal.type === "custom" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void save(
                        rows.map((x, j) =>
                          j === i && x.goal.type === "custom"
                            ? { ...x.goal, done: !x.goal.done }
                            : x.goal,
                        ),
                      )
                    }
                  >
                    {r.goal.done ? t("goals.notDone") : t("goals.markDone")}
                  </Button>
                )}
              </div>
              {r.fraction !== null && (
                <div
                  className="ml-6 h-1.5 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-label={r.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(r.fraction * 100)}
                >
                  <div
                    className={cn("h-full", r.met ? "bg-emerald-400" : "bg-gold")}
                    style={{ width: `${Math.round(r.fraction * 100)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {lastWeek.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <p className="mb-1.5 text-xs text-muted-foreground">{t("goals.lastWeek")}</p>
          <ul className="space-y-1">
            {lastWeek.map((g, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Status met={g.met} />
                <span className={cn(!g.met && "text-muted-foreground")}>{g.label}</span>
                <span className="sr-only">{g.met ? t("goals.met") : t("goals.missed")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
