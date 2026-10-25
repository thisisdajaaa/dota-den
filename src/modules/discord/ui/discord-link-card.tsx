"use client";

import { useState } from "react";
import { useT } from "@/common/i18n/client";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { Button } from "@/components/ui/button";
import type { DiscordLinkStatus } from "../dtos/responses/discord-link.dto";

type Outcome = "linked" | "denied" | "bad_state" | "off";

/** "Connect Discord" on the account page: link once, so the Dota Den bot knows who you are. */
export function DiscordLinkCard({
  initial,
  outcome,
}: {
  initial: DiscordLinkStatus;
  outcome: Outcome | null;
}) {
  const t = useT();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Nothing to offer until the Discord app is set up (unless an old link should be removable).
  if (!status.enabled && !status.linked) return null;

  async function unlink() {
    setBusy(true);
    setProblem(null);
    try {
      setStatus(
        await apiRequest<DiscordLinkStatus>("/api/v1/me/discord/link", { method: "DELETE" }),
      );
    } catch (e) {
      setProblem(e instanceof ApiClientError ? e.message : t("discord.link.failed"));
    } finally {
      setBusy(false);
    }
  }

  const name = status.linked?.globalName ?? status.linked?.username;
  return (
    <section
      id="discord-link"
      aria-labelledby="discord-link-title"
      className="panel scroll-mt-20 space-y-3 p-5"
    >
      <div>
        <h2 id="discord-link-title" className="text-lg font-semibold">
          {t("discord.link.title")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("discord.link.description")}
        </p>
      </div>
      {outcome && (
        <p
          role="status"
          className={outcome === "linked" ? "text-sm text-win" : "text-sm text-loss"}
        >
          {t(`discord.link.outcomes.${outcome}`)}
        </p>
      )}
      {status.linked ? (
        <div className="flex flex-wrap items-center gap-3">
          {status.linked.avatarUrl && (
            // A Discord CDN avatar; small and already sized.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={status.linked.avatarUrl}
              alt=""
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <span className="text-sm">{t("discord.link.linkedAs", { name: name ?? "" })}</span>
          <Button variant="outline" size="sm" onClick={unlink} disabled={busy}>
            {busy ? t("discord.link.unlinking") : t("discord.link.unlink")}
          </Button>
        </div>
      ) : status.enabled ? (
        <Button asChild>
          <a href="/api/v1/discord/link">{t("discord.link.connect")}</a>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t("discord.link.off")}</p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-loss">
          {problem}
        </p>
      )}
    </section>
  );
}
