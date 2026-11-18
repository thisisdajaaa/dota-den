"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isStopLossActive,
  isStopLossLimit,
  STOP_LOSS_PRESETS,
  STOP_LOSS_RANGES,
  STOP_LOSS_RULES,
  type StopLossRule,
  type StopLossSettings,
} from "../domain/stop-loss";

type Choice = { kind: "off" } | { kind: "preset"; value: number } | { kind: "custom" };

function initialChoice(rule: StopLossRule, value: number | null): Choice {
  if (value === null) return { kind: "off" };
  return STOP_LOSS_PRESETS[rule].includes(value) ? { kind: "preset", value } : { kind: "custom" };
}

/**
 * Account page: the limits a player sets for their own sessions. Free for everyone. Reached
 * limits show on the overview's latest session card, and as a notification when they're on.
 */
export function StopLossCard({ initial }: { initial: StopLossSettings }) {
  const t = useT();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [choices, setChoices] = useState(
    () =>
      Object.fromEntries(
        STOP_LOSS_RULES.map((r) => [r, initialChoice(r, initial.limits[r])]),
      ) as Record<StopLossRule, Choice>,
  );
  const [custom, setCustom] = useState(
    () =>
      Object.fromEntries(
        STOP_LOSS_RULES.map((r) => [r, initial.limits[r]?.toString() ?? ""]),
      ) as Record<StopLossRule, string>,
  );
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The settings the form describes, or the first problem with them. */
  function read(): { settings: StopLossSettings } | { error: string } {
    const limits = { ...saved.limits };
    for (const rule of STOP_LOSS_RULES) {
      const c = choices[rule];
      if (c.kind === "off") limits[rule] = null;
      else if (c.kind === "preset") limits[rule] = c.value;
      else {
        const n = Number(custom[rule]);
        if (!isStopLossLimit(rule, n)) {
          return {
            error: t("sessions.stopLoss.rangeError", {
              rule: t(`sessions.stopLoss.rules.${rule}.label`),
              ...STOP_LOSS_RANGES[rule],
            }),
          };
        }
        limits[rule] = n;
      }
    }
    const settings = { enabled, limits };
    if (enabled && !isStopLossActive(settings)) return { error: t("sessions.stopLoss.noRule") };
    return { settings };
  }

  async function save() {
    const form = read();
    if ("error" in form) {
      setError(form.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await apiRequest<StopLossSettings>("/api/v1/me/settings/stop-loss", {
        method: "PUT",
        body: form.settings,
      });
      setSaved(next);
      toast.success(t(next.enabled ? "sessions.stopLoss.savedOn" : "sessions.stopLoss.savedOff"));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("sessions.stopLoss.failed"));
    } finally {
      setBusy(false);
    }
  }

  const option = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
      active
        ? "bg-gold/15 text-gold shadow-[inset_0_0_0_1px_oklch(0.8_0.13_80/0.3)]"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <section id="stop-loss" className="panel space-y-4 p-5" aria-labelledby="stop-loss-title">
      <div className="space-y-1">
        <h2 id="stop-loss-title" className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck aria-hidden className="size-5 text-gold" />
          {t("sessions.stopLoss.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("sessions.stopLoss.description")}</p>
      </div>

      <form
        className="space-y-4"
        aria-label={t("sessions.stopLoss.title")}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const on = e.target.checked;
              setEnabled(on);
              // Turning it on with nothing chosen yet starts from the most common pick.
              if (on && STOP_LOSS_RULES.every((r) => choices[r].kind === "off"))
                setChoices((prev) => ({ ...prev, losses: { kind: "preset", value: 2 } }));
            }}
            className="mt-1 accent-[var(--gold)]"
          />
          {t("sessions.stopLoss.enable")}
        </label>

        {STOP_LOSS_RULES.map((rule) => {
          const c = choices[rule];
          const { min, max } = STOP_LOSS_RANGES[rule];
          const set = (next: Choice) => setChoices((prev) => ({ ...prev, [rule]: next }));
          const labelId = `stop-loss-${rule}-label`;
          return (
            <div key={rule} className="space-y-2">
              <div>
                <p id={labelId} className="text-sm font-medium">
                  {t(`sessions.stopLoss.rules.${rule}.label`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`sessions.stopLoss.rules.${rule}.help`)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="radiogroup"
                  aria-labelledby={labelId}
                  className="inline-flex flex-wrap rounded-lg border border-white/[0.07] bg-card/60 p-0.5"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={c.kind === "off"}
                    disabled={!enabled}
                    onClick={() => set({ kind: "off" })}
                    className={option(c.kind === "off")}
                  >
                    {t("sessions.stopLoss.off")}
                  </button>
                  {STOP_LOSS_PRESETS[rule].map((v) => {
                    const active = c.kind === "preset" && c.value === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={!enabled}
                        onClick={() => set({ kind: "preset", value: v })}
                        className={cn(option(active), "tabular-nums")}
                      >
                        {v}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={c.kind === "custom"}
                    disabled={!enabled}
                    onClick={() => set({ kind: "custom" })}
                    className={option(c.kind === "custom")}
                  >
                    {t("sessions.stopLoss.custom")}
                  </button>
                </div>
                {c.kind === "custom" && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    step={1}
                    disabled={!enabled}
                    value={custom[rule]}
                    onChange={(e) => setCustom((prev) => ({ ...prev, [rule]: e.target.value }))}
                    aria-label={t("sessions.stopLoss.customLabel", {
                      rule: t(`sessions.stopLoss.rules.${rule}.label`),
                      min,
                      max,
                    })}
                    className="h-9 w-20 tabular-nums"
                  />
                )}
              </div>
            </div>
          );
        })}

        {error && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}

        <Button type="submit" size="sm" disabled={busy}>
          {t("sessions.stopLoss.save")}
        </Button>
      </form>
    </section>
  );
}
