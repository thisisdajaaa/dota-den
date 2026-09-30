import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";
import { logger } from "@/lib/logger";
import { getTeammatesOverview } from "@/modules/together/composition";
import { TeammatesCard } from "@/modules/together/ui/teammates-card";
import { TeammatesSummary } from "@/modules/together/ui/teammates-summary";

function Heading() {
  return (
    <div>
      <p className="kicker">Teammates</p>
      <h2 className="text-lg font-semibold">Who you play with</h2>
    </div>
  );
}

/**
 * The overview's Teammates section. Streams behind Suspense; any failure blanks only this
 * section ("unavailable right now"), never the rest of the dashboard.
 */
export async function TeammatesSection({ user }: { user: { id: string; accountId32: number } }) {
  let res: Awaited<ReturnType<typeof getTeammatesOverview>> | null = null;
  try {
    res = await getTeammatesOverview(user);
  } catch (e) {
    logger.error("teammates_section_failed", { error: e });
  }

  if (!res || !res.ok) {
    return (
      <section className="panel space-y-2 p-5" aria-label="Teammates">
        <Heading />
        <p role="alert" className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-loss" />
          Teammate stats are unavailable right now. The rest of your overview is unaffected; try
          again in a minute.
        </p>
      </section>
    );
  }

  const data = res.value;
  if (data.teammates.length === 0 && data.rivals.length === 0) {
    return (
      <section className="panel space-y-2 p-5" aria-label="Teammates">
        <Heading />
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Users aria-hidden className="mt-0.5 size-4 shrink-0" />
          No teammates yet. People you share public matches with show up here. You can also{" "}
          <Link href="/players" className="text-gold hover:underline">
            track a friend
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-3" aria-label="Teammates" role="region">
      <TeammatesSummary data={data} />
      <TeammatesCard
        rows={data.teammates.map((t) => ({
          ...t,
          lastPlayedAt: t.lastPlayedAt?.toISOString() ?? null,
        }))}
        now={new Date().toISOString()}
      />
    </div>
  );
}
