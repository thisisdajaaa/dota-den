"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
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
  const [tags, setTags] = useState(initialTags);
  const [note, setNote] = useState(initialNote);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState({ tags: initialTags, note: initialNote });
  const dirty = tags.join("|") !== saved.tags.join("|") || note !== saved.note;

  const add = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) return;
    setTags([...tags, t]);
    setDraft("");
  };

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/me/matches/${matchId}/annotation`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags, note }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { tags: string[]; note: string };
      setTags(body.tags);
      setNote(body.note);
      setSaved(body);
      toast.success("Saved");
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3 p-5" aria-labelledby="match-notes-title">
      <div>
        <p className="kicker">Private</p>
        <h2 id="match-notes-title" className="text-lg font-semibold">
          Your notes
        </h2>
        <p className="text-sm text-muted-foreground">
          Tag this game and remember why it went the way it did. Only you see these; filter your
          matches by tag later.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Tags on this match">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-gold/15 py-0.5 pr-1 pl-2.5 text-xs text-gold"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => setTags(tags.filter((x) => x !== t))}
              className="grid size-4 place-items-center rounded-full hover:bg-gold/20"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet.</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => add(t)}
            disabled={tags.length >= MAX_TAGS}
            className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-gold/40 hover:text-gold disabled:opacity-40"
          >
            + {t}
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
          Add a tag
        </label>
        <input
          id="new-tag"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={20}
          placeholder="Add your own tag"
          className="h-8 w-48 rounded-md border border-white/10 bg-background px-2.5 text-sm"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={!draft.trim() || tags.length >= MAX_TAGS}
        >
          Add
        </Button>
      </form>
      <div>
        <label htmlFor="match-note" className="mb-1 block text-sm">
          Note
        </label>
        <textarea
          id="match-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
          rows={3}
          placeholder="e.g. Lost mid to Ember; try Mek earlier"
          className="w-full rounded-md border border-white/10 bg-background p-2.5 text-sm"
        />
        <p className={cn("text-right text-xs text-muted-foreground tabular-nums")}>
          {note.length}/{MAX_NOTE_LENGTH}
        </p>
      </div>
      <Button type="button" onClick={() => void save()} disabled={!dirty || busy}>
        {busy ? "Saving…" : dirty ? "Save" : "Saved"}
      </Button>
    </section>
  );
}
