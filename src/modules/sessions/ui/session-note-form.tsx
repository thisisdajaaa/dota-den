"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import type { SessionNoteDto } from "../dtos/responses/session-note.dto";
import { SessionNoteInputSchema } from "../schemas/sessions.schema";
import { GOAL_MAX, NOTE_MAX } from "../domain/session-note";

type FormInput = z.input<typeof SessionNoteInputSchema>;
type FormOutput = z.output<typeof SessionNoteInputSchema>;

const GOAL_MET_OPTIONS = [
  { value: "", label: "Not decided" },
  { value: "yes", label: "Yes" },
  { value: "partly", label: "Partly" },
  { value: "no", label: "No" },
] as const;

/** Edit the private notes and goal for one session. Validates with the server's schema. */
export function SessionNoteForm({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: SessionNoteDto | null;
}) {
  const router = useRouter();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(SessionNoteInputSchema),
    defaultValues: {
      goal: initial?.goal ?? "",
      goalMet: initial?.goalMet ?? "",
      note: initial?.note ?? "",
    },
  });
  const [goal, note] = useWatch({ control: form.control, name: ["goal", "note"] });

  async function onSubmit(values: FormOutput) {
    try {
      const saved = await apiRequest<SessionNoteDto>(
        `/api/v1/sessions/${encodeURIComponent(sessionId)}/notes`,
        { method: "PUT", body: values },
      );
      toast.success("Session notes saved");
      form.reset({ goal: saved.goal, goalMet: saved.goalMet ?? "", note: saved.note });
      router.refresh();
      return;
    } catch (e) {
      const apiError = e instanceof ApiClientError ? e : null;
      const fields =
        (apiError?.details as { fieldErrors?: Record<string, string[] | undefined> } | undefined)
          ?.fieldErrors ?? {};
      let mapped = false;
      for (const key of ["goal", "goalMet", "note"] as const) {
        const msg = fields[key]?.[0];
        if (msg) {
          form.setError(key, { message: msg });
          mapped = true;
        }
      }
      if (!mapped) toast.error(apiError?.message ?? "Couldn't save. Please try again.");
    }
  }

  const { isSubmitting, isDirty } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="Notes and goal">
      <FieldGroup>
        <Controller
          name="goal"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="session-goal">Goal</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id="session-goal"
                autoComplete="off"
                placeholder="e.g. Die less than 5 times a game"
                aria-invalid={fieldState.invalid}
                aria-describedby="session-goal-count"
              />
              <FieldDescription id="session-goal-count" className="text-right tabular-nums">
                {(goal ?? "").length}/{GOAL_MAX}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="goalMet"
          control={form.control}
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid}>
              <FieldLegend variant="label">Did you meet it?</FieldLegend>
              <div className="flex flex-wrap gap-2">
                {GOAL_MET_OPTIONS.map((o) => {
                  const checked = (field.value ?? "") === o.value;
                  return (
                    <label
                      key={o.value}
                      className={cn(
                        "cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        checked
                          ? o.value === "yes"
                            ? "border-win/40 bg-win/15 text-win"
                            : o.value === "no"
                              ? "border-loss/40 bg-loss/15 text-loss"
                              : "border-gold/40 bg-gold/15 text-gold"
                          : "border-white/[0.08] text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <input
                        type="radio"
                        name={field.name}
                        value={o.value}
                        checked={checked}
                        onChange={() => field.onChange(o.value)}
                        onBlur={field.onBlur}
                        className="sr-only"
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </FieldSet>
          )}
        />

        <Controller
          name="note"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="session-note">Notes</FieldLabel>
              <Textarea
                {...field}
                value={field.value ?? ""}
                id="session-note"
                rows={5}
                placeholder="What went well, what to work on next time…"
                aria-invalid={fieldState.invalid}
                aria-describedby="session-note-count"
              />
              <FieldDescription id="session-note-count" className="text-right tabular-nums">
                {(note ?? "").length}/{NOTE_MAX.toLocaleString("en-US")}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {isDirty ? "Unsaved changes" : initial ? "Saved" : ""}
          </span>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save notes"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
