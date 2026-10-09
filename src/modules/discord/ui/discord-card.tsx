"use client";

import { useState, type FormEvent } from "react";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useLocale, useT } from "@/common/i18n/client";
import { LOCALE_TAGS } from "@/common/i18n/locales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DiscordStatusDto } from "../dtos/responses/discord-status.dto";

/** The status a failed request carries in `details` (e.g. the webhook turned out deleted). */
function statusFrom(e: unknown): DiscordStatusDto | null {
  if (!(e instanceof ApiClientError)) return null;
  const details = e.details as { status?: DiscordStatusDto } | undefined;
  return details?.status ?? null;
}

/** The Account page's Discord section: paste a webhook, turn posting on/off, test, remove. */
export function DiscordCard({ initial }: { initial: DiscordStatusDto }) {
  const t = useT();
  const locale = useLocale();
  const [status, setStatus] = useState(initial);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await apiRequest<DiscordStatusDto>("/api/v1/me/discord/webhook", {
        method: "PUT",
        body: { url },
      });
      setStatus(next);
      setUrl("");
      setReplacing(false);
      toast.success(t("discord.card.saved"));
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.status === 400
          ? t("discord.card.invalid")
          : t("discord.card.saveFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function setEnabled(enabled: boolean) {
    const before = status;
    setStatus({ ...status, enabled });
    try {
      setStatus(
        await apiRequest<DiscordStatusDto>("/api/v1/me/discord/feed", {
          method: "PUT",
          body: { enabled },
        }),
      );
      toast.success(t(enabled ? "discord.card.turnedOn" : "discord.card.turnedOff"));
    } catch (err) {
      setStatus(statusFrom(err) ?? before);
      toast.error(t("discord.card.saveToggleFailed"));
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      setStatus(await apiRequest<DiscordStatusDto>("/api/v1/me/discord/test", { method: "POST" }));
      toast.success(t("discord.card.testSent"));
    } catch (err) {
      const next = statusFrom(err);
      if (next) setStatus(next);
      toast.error(next?.gone ? t("discord.card.gone") : t("discord.card.testFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      setStatus(
        await apiRequest<DiscordStatusDto>("/api/v1/me/discord/webhook", { method: "DELETE" }),
      );
      setReplacing(false);
      toast.success(t("discord.card.removed"));
    } catch {
      toast.error(t("discord.card.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  const showForm = !status.connected || status.gone || replacing;
  const lastPosted = status.lastPostedAt
    ? new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(status.lastPostedAt))
    : null;

  return (
    <section id="discord" className="panel space-y-4 p-5" aria-labelledby="discord-title">
      <div className="space-y-1">
        <h2 id="discord-title" className="text-lg font-semibold">
          {t("discord.card.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("discord.card.description")}</p>
      </div>

      {status.connected && (
        <div className="space-y-3">
          {status.gone ? (
            <p className="text-sm text-loss" role="status">
              {t("discord.card.gone")}
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t("discord.card.postingTo", { name: status.name ?? t("discord.card.unnamed") })}
              </p>
              <p className="font-mono text-xs break-all text-muted-foreground">
                {status.maskedUrl}
              </p>
              {lastPosted && (
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {t("discord.card.lastPosted", { date: lastPosted })}
                </p>
              )}
            </div>
          )}

          {!status.gone && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={status.enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-1 accent-[var(--gold)]"
              />
              <span>
                {t("discord.card.toggle")}
                <span className="block text-xs text-muted-foreground">
                  {t("discord.card.toggleHelp")}
                </span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {!status.gone && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={busy}
                onClick={sendTest}
              >
                <Send aria-hidden className="size-4" /> {t("discord.card.test")}
              </Button>
            )}
            {!status.gone && !replacing && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setReplacing(true)}>
                {t("discord.card.replace")}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-2" disabled={busy} onClick={remove}>
              <Trash2 aria-hidden className="size-4" /> {t("discord.card.remove")}
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={save} className="space-y-2">
          <label htmlFor="discord-webhook-url" className="text-sm font-medium">
            {t("discord.card.urlLabel")}
          </label>
          <p className="text-xs text-muted-foreground">{t("discord.card.howTo")}</p>
          <div className="flex flex-wrap gap-2">
            <Input
              id="discord-webhook-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              required
              maxLength={300}
              placeholder={t("discord.card.urlPlaceholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "discord-webhook-error" : "discord-webhook-note"}
              className="min-w-0 flex-1 basis-64"
            />
            <Button type="submit" size="sm" disabled={busy || url.trim() === ""}>
              {busy ? t("discord.card.saving") : t("discord.card.save")}
            </Button>
            {replacing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setReplacing(false);
                  setError(null);
                }}
              >
                {t("discord.card.cancel")}
              </Button>
            )}
          </div>
          {error ? (
            <p id="discord-webhook-error" className="text-sm text-loss" role="alert">
              {error}
            </p>
          ) : (
            <p id="discord-webhook-note" className="text-xs text-muted-foreground">
              {t("discord.card.secretNote")}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
