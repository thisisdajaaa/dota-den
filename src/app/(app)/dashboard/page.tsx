import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/modules/identity/composition";
import { getMatchQueries } from "@/modules/matches/composition";
import { ImportStatusCard } from "@/modules/matches/ui/import-status-card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const status = await (await getMatchQueries()).importStatus(user.accountId32);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <ImportStatusCard status={status} />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">SteamID64</dt>
            <dd className="font-mono" data-testid="steam-id">
              {user.steamId64}
            </dd>
            <dt className="text-muted-foreground">Account ID</dt>
            <dd className="font-mono">{user.accountId32}</dd>
            <dt className="text-muted-foreground">Profile visibility</dt>
            <dd>{user.settings.profileVisibility}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
