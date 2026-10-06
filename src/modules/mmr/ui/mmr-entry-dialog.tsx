"use client";

import { apiRequest, errorMessage, fieldErrors } from "@/common/http/api-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/common/i18n/client";
import type { MmrEntryDto } from "../dtos/responses/mmr-entry.dto";
import { MmrEntryInputSchema } from "../schemas/mmr-entry.schema";

type FormInput = z.input<typeof MmrEntryInputSchema>;
type FormOutput = z.output<typeof MmrEntryInputSchema>;

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for datetime-local inputs. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Log a new MMR observation, or edit an existing one. Validates with the server's schema. */
export function MmrEntryDialog({
  entry,
  canReadScreenshots = false,
}: {
  entry?: MmrEntryDto;
  /** Offer "Read from screenshot" (needs the AI provider). */
  canReadScreenshots?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const editing = entry !== undefined;
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<{ ok: boolean; text: string } | null>(null);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(MmrEntryInputSchema),
    defaultValues: {
      mmr: entry ? String(entry.mmr) : "",
      observedAt: toLocalInput(entry ? new Date(entry.observedAt) : new Date()),
      note: entry?.note ?? "",
    },
  });

  // "Defaults to now" means when you open the dialog, not when the page loaded: a tab left
  // open through a session would otherwise log the new MMR at the old time.
  function onOpenChange(next: boolean) {
    if (next && !editing && !form.getFieldState("observedAt").isDirty) {
      form.setValue("observedAt", toLocalInput(new Date()));
    }
    setOpen(next);
  }

  /** Suggest the MMR from a screenshot; the player checks it before saving. */
  async function readScreenshot(file: File) {
    setReading(true);
    setReadNote(null);
    try {
      const body = new FormData();
      body.append("image", file);
      const data = await apiRequest<{ mmr: number | null; seen: string | null }>(
        "/api/v1/mmr-entries/read-screenshot",
        { method: "POST", body },
      );
      if (typeof data?.mmr === "number") {
        form.setValue("mmr", String(data.mmr), { shouldDirty: true, shouldValidate: true });
        setReadNote({
          ok: true,
          text: t("mmr.entry.readOk", {
            mmr: data.mmr.toLocaleString("en-US"),
            seen: data.seen ? ` (${data.seen})` : "",
          }),
        });
      } else {
        setReadNote({
          ok: false,
          text: t("mmr.entry.readNotFound"),
        });
      }
    } catch (e) {
      setReadNote({
        ok: false,
        text: errorMessage(e, t("mmr.entry.readFailed")),
      });
    } finally {
      setReading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    if (editing || !canReadScreenshots) return;
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (image) {
      e.preventDefault();
      void readScreenshot(image);
    }
  }

  async function onSubmit(values: FormOutput) {
    try {
      await apiRequest(editing ? `/api/v1/mmr-entries/${entry.id}` : "/api/v1/mmr-entries", {
        method: editing ? "PATCH" : "POST",
        body: { ...values, observedAt: values.observedAt.toISOString() },
      });
    } catch (e) {
      // Surface server-side field errors on the matching inputs.
      const fields = fieldErrors(e);
      let mapped = false;
      for (const key of ["mmr", "observedAt", "note"] as const) {
        const msg = fields[key]?.[0];
        if (msg) {
          form.setError(key, { message: msg });
          mapped = true;
        }
      }
      if (!mapped) toast.error(errorMessage(e, t("mmr.entry.saveFailed")));
      return;
    }
    toast.success(
      editing
        ? t("mmr.entry.updated")
        : t("mmr.entry.logged", { mmr: values.mmr.toLocaleString("en-US") }),
    );
    setOpen(false);
    if (!editing) form.reset({ mmr: "", observedAt: toLocalInput(new Date()), note: "" });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon" className="size-8" aria-label={t("mmr.entry.edit")}>
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="size-4" />
            {t("mmr.entry.log")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onPaste={onPaste}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>
              {editing ? t("mmr.entry.editTitle") : t("mmr.entry.logTitle")}
            </DialogTitle>
            <DialogDescription>{t("mmr.entry.description")}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-5">
            <Controller
              name="mmr"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="mmr">{t("mmr.entry.mmr")}</FieldLabel>
                  <Input
                    {...field}
                    value={String(field.value ?? "")}
                    id="mmr"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={t("mmr.entry.mmrPlaceholder")}
                    aria-invalid={fieldState.invalid}
                    autoFocus
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  {!editing && canReadScreenshots && (
                    <div className="space-y-1.5">
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        tabIndex={-1}
                        aria-label={t("mmr.entry.screenshot")}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void readScreenshot(f);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={reading}
                        onClick={() => fileInput.current?.click()}
                      >
                        <ImageUp aria-hidden className="size-4" />
                        {reading ? t("mmr.entry.reading") : t("mmr.entry.readScreenshot")}
                      </Button>
                      <FieldDescription>{t("mmr.entry.pasteHint")}</FieldDescription>
                      {readNote && (
                        <p
                          role="status"
                          className={readNote.ok ? "text-xs text-win" : "text-xs text-loss"}
                        >
                          {readNote.text}
                        </p>
                      )}
                    </div>
                  )}
                </Field>
              )}
            />
            <Controller
              name="observedAt"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="observedAt">{t("mmr.entry.when")}</FieldLabel>
                  <Input
                    {...field}
                    value={String(field.value ?? "")}
                    id="observedAt"
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>{t("mmr.entry.whenHint")}</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="note">{t("mmr.entry.note")}</FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    id="note"
                    rows={2}
                    placeholder={t("mmr.entry.notePlaceholder")}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("mmr.entry.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? t("mmr.entry.saving")
                : editing
                  ? t("mmr.entry.saveChanges")
                  : t("mmr.entry.log")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
