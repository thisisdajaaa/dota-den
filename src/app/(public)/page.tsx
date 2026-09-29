import { BookOpenText, ChartNoAxesColumn, FlaskConical, Swords, Users } from "lucide-react";
import { SteamIcon } from "@/components/icons/steam-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const AUTH_ERRORS: Record<string, string> = {
  state_mismatch: "Your sign-in session expired or was started in another tab. Please try again.",
  provider_unavailable: "Steam didn't respond. Please try again in a moment.",
};

const LOOP = [
  { icon: BookOpenText, title: "Read the patch", body: "See which changes touch your hero pool." },
  {
    icon: Swords,
    title: "Draft with friends",
    body: "Practice Captain's Mode-style picks and bans.",
  },
  {
    icon: ChartNoAxesColumn,
    title: "Review together",
    body: "Solo and party results, with sample sizes.",
  },
  {
    icon: FlaskConical,
    title: "Set the next experiment",
    body: "Pick one thing to test next session.",
  },
];

const FEATURES = [
  {
    icon: Users,
    title: "Solo vs party, honestly",
    body: "Every match is labelled solo, party or unknown, with its source. Missing data is never counted as solo.",
  },
  {
    icon: BookOpenText,
    title: "Patch hub",
    body: "Official patch notes linked to their source, filtered to the heroes you actually play.",
  },
  {
    icon: Swords,
    title: "Draft practice",
    body: "Pick/ban drills locally or with friends, with transparent reasons instead of fake win odds.",
  },
];

/** Static illustration of the dashboard. Clearly labelled as example data. */
function PreviewCard() {
  const rows = [
    { label: "Solo", rate: 0.54, n: 212 },
    { label: "Party", rate: 0.61, n: 148 },
    { label: "Unknown", rate: 0.5, n: 9, low: true },
  ];
  return (
    <div className="panel relative w-full max-w-md p-5" aria-label="Example dashboard preview">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="kicker">Solo vs party</p>
          <p className="font-semibold">Win rate by queue</p>
        </div>
        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[0.6rem] tracking-wider text-muted-foreground uppercase">
          Example data
        </span>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-3 text-sm"
          >
            <span className="font-medium">{r.label}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className={
                  r.low
                    ? "absolute inset-y-0 left-0 rounded-full bg-unknown/60"
                    : "absolute inset-y-0 left-0 rounded-full bg-win"
                }
                style={{ width: `${r.rate * 100}%` }}
              />
              <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/40" />
            </span>
            <span className="text-right tabular-nums">
              {(r.rate * 100).toFixed(0)}%{" "}
              <span className="text-xs text-muted-foreground">n={r.n}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-1.5">
        {"WWLWLWWWLW".split("").map((c, i) => (
          <span
            key={i}
            className={
              c === "W"
                ? "grid size-7 place-items-center rounded bg-win/15 text-xs font-bold text-win ring-1 ring-win/40"
                : "grid size-7 place-items-center rounded bg-loss/15 text-xs font-bold text-loss ring-1 ring-loss/40"
            }
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const { auth_error } = await searchParams;
  const authError = typeof auth_error === "string" ? auth_error : null;
  const signInRequired = authError === "signed_out";

  return (
    <div className="space-y-20">
      {signInRequired && (
        <Alert>
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>Sign in through Steam to view that page.</AlertDescription>
        </Alert>
      )}
      {authError && !signInRequired && (
        <Alert variant="destructive">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>
            {AUTH_ERRORS[authError] ?? "We couldn't verify your Steam sign-in. Please try again."}
          </AlertDescription>
        </Alert>
      )}

      <section className="relative grid items-center gap-12 pt-6 lg:grid-cols-[1.2fr_1fr]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/4 -z-10 size-[36rem] rounded-full bg-gold/10 blur-[120px]"
        />
        <div className="space-y-6">
          <p className="kicker">Unofficial Dota 2 companion</p>
          <h1 className="font-display text-4xl leading-[1.1] font-bold tracking-wide sm:text-5xl lg:text-6xl">
            Climb with{" "}
            <span className="bg-gradient-to-r from-gold to-[oklch(0.75_0.17_50)] bg-clip-text text-transparent">
              clarity
            </span>
            , not guesswork.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            See how you really play solo versus with your stack, what each patch changed for your
            heroes, and practice drafts before the game that counts.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              asChild
              size="lg"
              className="gap-2 shadow-[0_0_30px_-6px_oklch(0.8_0.13_80/0.6)]"
            >
              <a href="/api/v1/auth/steam/login">
                <SteamIcon className="size-4" />
                Sign in through Steam
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">
              We never see your password. Your data stays private by default.
            </span>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <PreviewCard />
        </div>
      </section>

      <section aria-labelledby="loop" className="space-y-6">
        <div>
          <p className="kicker">The loop</p>
          <h2 id="loop" className="text-2xl font-semibold">
            From patch day to your next session
          </h2>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((step, i) => (
            <li key={step.title} className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-lg bg-gold/10 text-gold ring-1 ring-gold/25">
                  <step.icon aria-hidden className="size-5" />
                </span>
                <span className="font-display text-2xl font-bold text-white/10">{i + 1}</span>
              </div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features" className="grid gap-3 sm:grid-cols-3">
        <h2 id="features" className="sr-only">
          Features
        </h2>
        {FEATURES.map((f) => (
          <article key={f.title} className="panel p-6">
            <f.icon aria-hidden className="mb-4 size-6 text-gold" />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
