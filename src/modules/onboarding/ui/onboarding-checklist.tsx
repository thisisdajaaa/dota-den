"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Check, Circle, X } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import type { OnboardingStep } from "../domain/checklist";

const DISMISSED_KEY = "dd:onboarding-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}
const onStorage = (change: () => void) => {
  window.addEventListener("storage", change);
  return () => window.removeEventListener("storage", change);
};

/** "Get started": a new player's first steps, ticked from their real data. Dismissible. */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const t = useT();
  // Server render shows it; a dismissed browser hides it after hydration.
  const dismissed = useSyncExternalStore(onStorage, wasDismissed, () => false);
  const [hidden, setHidden] = useState(false);
  if (dismissed || hidden) return null;
  const done = steps.filter((s) => s.done).length;

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="onboarding-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker">{t("onboarding.progress", { done, total: steps.length })}</p>
          <h2 id="onboarding-title" className="text-lg font-semibold">
            {t("onboarding.title")}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("onboarding.dismiss")}
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(DISMISSED_KEY, "1");
            } catch {
              // Storage blocked: hidden until the next visit.
            }
          }}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3 text-sm">
            {step.done ? (
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-win" />
            ) : (
              <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className={cn(step.done && "text-muted-foreground line-through")}>
              <span className="sr-only">
                {step.done ? t("onboarding.doneLabel") : t("onboarding.todoLabel")}
              </span>
              {step.href && !step.done ? (
                <Link href={step.href} className="font-medium text-gold hover:underline">
                  {t(`onboarding.steps.${step.id}.title`)}
                </Link>
              ) : (
                <span className="font-medium">{t(`onboarding.steps.${step.id}.title`)}</span>
              )}
              {!step.done && (
                <p className="text-xs text-muted-foreground">
                  {t(`onboarding.steps.${step.id}.help`)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
