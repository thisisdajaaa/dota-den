"use client";

import { useState } from "react";
import { MailCheck, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EmailStatusDto } from "../dtos/responses/email-status.dto";

/** The account page's weekly email section: double opt-in, change address, stop. */
export function EmailDigestCard({ initial }: { initial: EmailStatusDto }) {
  const t = useT();
  const [state, setState] = useState(initial);
  const [editing, setEditing] = useState(initial.status === "none");
  const [address, setAddress] = useState(initial.status === "none" ? "" : (initial.email ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(email: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await apiRequest<EmailStatusDto>("/api/v1/me/email", {
        method: "PUT",
        body: { email },
      });
      setState(next);
      setEditing(false);
      if (next.status === "pending")
        toast.success(t("email.card.sent", { email: next.email ?? email }));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("email.card.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      const next = await apiRequest<EmailStatusDto>("/api/v1/me/email", { method: "DELETE" });
      setState(next);
      setAddress("");
      setEditing(true);
      toast.success(t("email.card.stopped"));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("email.card.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/v1/me/email/test", { method: "POST" });
      toast.success(t("email.card.testSent"));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("email.card.failed"));
    } finally {
      setBusy(false);
    }
  }

  const email = state.email ?? "";
  const statusText =
    state.status === "confirmed"
      ? t("email.card.confirmed", { email })
      : state.status === "pending"
        ? t("email.card.pending", { email })
        : state.status === "unsubscribed"
          ? t("email.card.unsubscribed", { email })
          : null;

  return (
    <section id="email" className="panel space-y-4 p-5" aria-labelledby="email-title">
      <div className="space-y-1">
        <h2 id="email-title" className="text-lg font-semibold">
          {t("email.card.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("email.card.description")}</p>
      </div>

      {!state.enabled ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("email.card.unavailable")}
        </p>
      ) : (
        <>
          {statusText && (
            <p className="flex items-start gap-2 text-sm" role="status">
              {state.status === "confirmed" && (
                <MailCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-win" />
              )}
              {statusText}
            </p>
          )}

          {editing ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(address);
              }}
            >
              <label htmlFor="digest-email" className="block text-sm font-medium">
                {t("email.card.label")}
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="digest-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={address}
                  placeholder={t("email.card.placeholder")}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-9 max-w-xs"
                  aria-describedby="digest-email-consent"
                />
                <Button type="submit" size="sm" className="h-9 gap-2" disabled={busy}>
                  <Send aria-hidden className="size-4" /> {t("email.card.subscribe")}
                </Button>
                {state.status !== "none" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    disabled={busy}
                    onClick={() => setEditing(false)}
                  >
                    {t("email.card.cancel")}
                  </Button>
                )}
              </div>
              <p id="digest-email-consent" className="text-xs text-muted-foreground">
                {t("email.card.consent")}
              </p>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {state.status === "confirmed" && (
                <Button size="sm" className="gap-2" disabled={busy} onClick={sendTest}>
                  <Send aria-hidden className="size-4" /> {t("email.card.test")}
                </Button>
              )}
              {state.status !== "confirmed" && (
                <Button size="sm" className="gap-2" disabled={busy} onClick={() => send(email)}>
                  <Send aria-hidden className="size-4" />{" "}
                  {state.status === "pending" ? t("email.card.resend") : t("email.card.subscribe")}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setAddress(email);
                  setEditing(true);
                }}
              >
                {t("email.card.change")}
              </Button>
              <Button variant="ghost" size="sm" className="gap-2" disabled={busy} onClick={stop}>
                <Trash2 aria-hidden className="size-4" /> {t("email.card.stop")}
              </Button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
