"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import type { AnnotationDto } from "../dtos/responses/annotation.dto";
import { MAX_NOTE_LENGTH, MAX_TAGS, normalizeTag, SUGGESTED_TAGS } from "../domain/annotation";

/** Tag your match and leave yourself a note. Private to you. */
export function MatchNotesCard({
  matchId,
  initialTags,
  initialNote,
}: {
  matchId: string;
  initialTags: string[];
  initialNote: string;
}) {
  const t = useT();
  const [tags, setTags] = useState(initialTags);
  const [note, setNote] = useState(initialNote);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState({ tags: initialTags, note: initialNote });
  const dirty = tags.join("|") !== saved.tags.join("|") || note !== saved.note;

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
    setTags([...tags, tag]);
    setDraft("");
  };

  async function save() {
    setBusy(true);
    try {
      const body = await apiRequest<AnnotationDto>(`/api/v1/me/matches/${matchId}/annotation`, {
        method: "PUT",
        body: { tags, note },
      });
      setTags(body.tags);
      setNote(body.note);
      setSaved(body);
      toast.success(t("annotations.notes.savedToast"));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : t("annotations.notes.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="match-notes-title">
      <div>
        <p className="kicker">{t("annotations.notes.kicker")}</p>
        <h2 id="match-notes-title" className="text-lg font-semibold">
          {t("annotations.notes.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("annotations.notes.description")}</p>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label={t("annotations.notes.tagsLabel")}>
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-gold/15 py-0.5 pr-1 pl-2.5 text-xs text-gold"
          >
            {tag}
            <button
              type="button"
              aria-label={t("annotations.notes.removeTag", { tag })}
              onClick={() => setTags(tags.filter((x) => x !== tag))}
              className="grid size-4 place-items-center rounded-full hover:bg-gold/20"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-muted-foreground">{t("annotations.notes.noTags")}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_TAGS.filter((tag) => !tags.includes(tag)).map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => add(tag)}
            disabled={tags.length >= MAX_TAGS}
            className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-gold/40 hover:text-gold disabled:opacity-40"
          >
            + {tag}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <label htmlFor="new-tag" className="sr-only">
          {t("annotations.notes.addLabel")}
        </label>
        <input
          id="new-tag"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={20}
          placeholder={t("annotations.notes.addPlaceholder")}
          className="h-8 w-48 rounded-md border border-white/10 bg-background px-2.5 text-sm"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={!draft.trim() || tags.length >= MAX_TAGS}
        >
          {t("annotations.notes.add")}
        </Button>
      </form>
      <div>
        <label htmlFor="match-note" className="mb-1 block text-sm">
          {t("annotations.notes.note")}
        </label>
        <textarea
          id="match-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
          rows={3}
          placeholder={t("annotations.notes.notePlaceholder")}
          className="w-full rounded-md border border-white/10 bg-background p-2.5 text-sm"
        />
        <p className={cn("text-right text-xs text-muted-foreground tabular-nums")}>
          {note.length}/{MAX_NOTE_LENGTH}
        </p>
      </div>
      <Button type="button" onClick={() => void save()} disabled={!dirty || busy}>
        {busy
          ? t("annotations.notes.saving")
          : dirty
            ? t("annotations.notes.save")
            : t("annotations.notes.saved")}
      </Button>
    </section>
  );
}
