import { CloudOff } from "lucide-react";
import { openDotaTroubleSince } from "@/common/providers/opendota";
import { getT } from "@/common/i18n/server";

/**
 * A quiet line above the page while OpenDota has been failing in the last few minutes (its
 * shared circuit opened), so stale numbers and slow syncs aren't a mystery. Render it inside
 * Suspense: it reads Redis once.
 */
export async function UpstreamNotice() {
  const since = await openDotaTroubleSince();
  if (since === null) return null;
  const t = await getT();
  return (
    <p
      role="status"
      className="mb-6 flex items-start gap-2.5 rounded-lg border border-gold/25 bg-gold/[0.06] px-3.5 py-2.5 text-sm text-muted-foreground"
    >
      <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
      <span>{t("system.shell.upstreamTrouble")}</span>
    </p>
  );
}
