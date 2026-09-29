"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { MmrEntryInputSchema, type MmrEntryDto } from "../application/contracts";

type FormInput = z.input<typeof MmrEntryInputSchema>;
type FormOutput = z.output<typeof MmrEntryInputSchema>;

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for datetime-local inputs. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Log a new MMR observation, or edit an existing one. Validates with the server's schema. */
export function MmrEntryDialog({ entry }: { entry?: MmrEntryDto }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const editing = entry !== undefined;

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(MmrEntryInputSchema),
    defaultValues: {
      mmr: entry ? String(entry.mmr) : "",
      observedAt: toLocalInput(entry ? new Date(entry.observedAt) : new Date()),
      note: entry?.note ?? "",
    },
  });

  async function onSubmit(values: FormOutput) {
    const res = await fetch(editing ? `/api/v1/mmr-entries/${entry.id}` : "/api/v1/mmr-entries", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, observedAt: values.observedAt.toISOString() }),
    });
    if (res.ok) {
      toast.success(editing ? "Entry updated" : `Logged ${values.mmr.toLocaleString("en-US")} MMR`);
      setOpen(false);
      if (!editing) form.reset({ mmr: "", observedAt: toLocalInput(new Date()), note: "" });
      router.refresh();
      return;
    }
    // Surface server-side field errors on the matching inputs.
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string; details?: Record<string, string[] | undefined> };
    } | null;
    const details = body?.error?.details ?? {};
    let mapped = false;
    for (const key of ["mmr", "observedAt", "note"] as const) {
      const msg = details[key]?.[0];
      if (msg) {
        form.setError(key, { message: msg });
        mapped = true;
      }
    }
    if (!mapped) toast.error(body?.error?.message ?? "Couldn't save. Please try again.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
      <DialogContent className="sm:max-w-md">
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
