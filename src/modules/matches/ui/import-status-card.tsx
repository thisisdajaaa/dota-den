import { LocalTime } from "@/components/local-time";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ImportStatus } from "../application/ports";
import { SyncMatchesButton } from "./sync-matches-button";

function share(n: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((n / total) * 100)}%`;
}

export function ImportStatusCard({ status }: { status: ImportStatus }) {
  const { sync, totals } = status;
  const rows = [
    { label: "Solo", n: totals.solo },
    { label: "Party", n: totals.party },
    { label: "Unknown", n: totals.unknown },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Match import</CardTitle>
        <CardDescription>
          Source: OpenDota.{" "}
          {sync?.lastSyncAt ? (
            <>
              Last synced <LocalTime iso={sync.lastSyncAt.toISOString()} />.
            </>
          ) : (
            "Not synced yet."
          )}
        </CardDescription>
        <CardAction>
          <SyncMatchesButton />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {totals.all === 0 ? (
          <p className="text-muted-foreground">
            No matches imported yet. If a sync finds nothing, your Steam profile may not expose
            match data publicly, or OpenDota hasn&apos;t seen your recent games.
          </p>
        ) : (
          <>
            <table className="w-full max-w-sm">
              <caption className="sr-only">Imported matches by queue type</caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="font-normal">
                    Queue
                  </th>
                  <th scope="col" className="text-right font-normal">
                    Matches
                  </th>
                  <th scope="col" className="text-right font-normal">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="font-normal">
                      {r.label}
                    </th>
                    <td className="text-right">{r.n}</td>
                    <td className="text-right">{share(r.n, totals.all)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-medium">
                  <th scope="row" className="text-left">
                    Total
                  </th>
                  <td className="text-right">{totals.all}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">
              &ldquo;Unknown&rdquo; means OpenDota didn&apos;t report a usable party size (or the
              game wasn&apos;t matchmaking). We never assume these were solo.
              {sync && !sync.backfillComplete && " Older history is still being imported."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
