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
          text: `Read ${data.mmr.toLocaleString("en-US")}${data.seen ? ` (${data.seen})` : ""}. Check it before saving.`,
        });
      } else {
        setReadNote({
          ok: false,
          text: "Couldn't find your MMR in that screenshot. Type it instead.",
        });
      }
    } catch (e) {
      setReadNote({
        ok: false,
        text: errorMessage(e, "Couldn't read that screenshot. Check your connection."),
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
      if (!mapped) toast.error(errorMessage(e, "Couldn't save. Please try again."));
      return;
    }
    toast.success(editing ? "Entry updated" : `Logged ${values.mmr.toLocaleString("en-US")} MMR`);
    setOpen(false);
    if (!editing) form.reset({ mmr: "", observedAt: toLocalInput(new Date()), note: "" });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon" className="size-8" aria-label="Edit entry">
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="size-4" />
            Log MMR
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onPaste={onPaste}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit MMR entry" : "Log your MMR"}</DialogTitle>
            <DialogDescription>
              Enter the MMR shown in your Dota client. Log it after a session and we&apos;ll work
              out how much you gained or lost each day.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-5">
            <Controller
              name="mmr"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="mmr">MMR</FieldLabel>
                  <Input
                    {...field}
                    value={String(field.value ?? "")}
                    id="mmr"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="e.g. 5230"
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
                        aria-label="Screenshot of your MMR"
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
                        {reading ? "Reading…" : "Read from screenshot"}
                      </Button>
                      <FieldDescription>
                        Or paste one. The image is only used to read the number, never stored.
                      </FieldDescription>
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
                  <FieldLabel htmlFor="observedAt">When you saw it</FieldLabel>
                  <Input
                    {...field}
                    value={String(field.value ?? "")}
                    id="observedAt"
                    type="datetime-local"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>Your local time. Defaults to now.</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="note">Note (optional)</FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    id="note"
                    rows={2}
                    placeholder="e.g. Tried offlane Mars all session"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : editing ? "Save changes" : "Log MMR"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
