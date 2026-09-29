import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/modules/identity/composition";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Signed in</CardTitle>
          <CardDescription>
            Your Steam account is linked. Match import arrives in the next milestone.
          </CardDescription>
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
