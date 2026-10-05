import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/modules/identity/composition";
import { DeleteAccountForm } from "@/modules/privacy/ui/delete-account-form";

export const metadata: Metadata = { title: "Your data" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const downloads = [
    {
      format: "json",
      label: "Everything (JSON)",
      hint: "Account, MMR log, medals, notes, drafts, tracked players and matches",
    },
    { format: "matches-csv", label: "Matches (CSV)", hint: "One row per imported match" },
    { format: "mmr-csv", label: "MMR log (CSV)", hint: "Every MMR entry you logged" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Account"
        title="Your data"
        description="Download what Dota Den keeps about you, or delete your account and all of it."
      />

      <section className="panel space-y-4 p-5" aria-labelledby="download-title">
        <h2 id="download-title" className="text-lg font-semibold">
          Download your data
        </h2>
        <ul className="space-y-3">
          {downloads.map((d) => (
            <li key={d.format} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{d.label}</p>
                <p className="text-xs text-muted-foreground">{d.hint}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={`/api/v1/me/export?format=${d.format}`} download>
                  <Download aria-hidden className="size-4" /> Download
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel space-y-4 border-loss/30 p-5" aria-labelledby="delete-title">
        <div>
          <h2 id="delete-title" className="text-lg font-semibold text-loss">
            Delete your account
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Removes your account, sign-ins, MMR log, medal history, session notes and goals,
              tracked players, draft results and challenge streak, and your imported matches.
            </li>
            <li>
              Drafts you played with a friend stay in their history, with your name and picture
              removed.
            </li>
            <li>Encrypted backups are kept for 30 days, then your data is gone from them too.</li>
            <li>
              Your public Dota matches stay on OpenDota; if you sign in again, they&apos;d be
              imported again as a new account.
            </li>
          </ul>
        </div>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
