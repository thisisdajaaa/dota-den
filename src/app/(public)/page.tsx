import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  BookOpenText,
  ChartNoAxesColumn,
  FlaskConical,
  Swords,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { SteamIcon } from "@/components/icons/steam-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getHeroMap } from "@/modules/matches/composition";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { ensurePatchesFresh, getPatchQueries } from "@/modules/patches/composition";
import { getCurrentUser } from "@/modules/identity/composition";

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

/** The newest official patch, straight from the patch hub (real data, never a mock). */
async function LatestPatchCard() {
  await ensurePatchesFresh();
  const [latest, heroes] = await Promise.all([
    (await getPatchQueries()).latest().catch(() => null),
    getHeroMap(),
  ]);
  if (!latest) return null;
  const patch = await (await getPatchQueries()).getByVersion(latest.version).catch(() => null);
  const changed = (patch?.sections.heroes ?? []).slice(0, 10);

  return (
    <Link
      href={`/patches/${latest.version}`}
      className="panel group relative block w-full max-w-md p-6 transition-[transform,border-color] hover:-translate-y-1 hover:border-gold/30"
      aria-label={`Latest patch ${latest.version}: read the notes`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-gold/10 blur-3xl"
      />
      <p className="kicker">Latest patch</p>
      <p className="mt-1 font-display text-5xl font-bold tracking-wide">{latest.version}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
          latest.publishedAt,
        )}{" "}
        · {latest.summary.heroesChanged} heroes and{" "}
        {latest.summary.itemsChanged + latest.summary.neutralItemsChanged} items changed
      </p>
      {changed.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Some of the heroes changed">
          {changed.map((h) => (
            <li key={h.heroId} title={heroName(heroes.get(h.heroId), h.heroId)}>
              <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
            </li>
          ))}
        </ul>
      )}
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-gold">
        Read the patch notes{" "}
        <ArrowRight
          aria-hidden
          className="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  if (await getCurrentUser({ tolerateErrors: true })) redirect("/dashboard");
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

      <section className="relative grid grid-cols-1 items-center gap-12 pt-6 lg:grid-cols-[1.2fr_1fr]">
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
          <Suspense fallback={<Skeleton className="h-64 w-full max-w-md rounded-2xl" />}>
            <LatestPatchCard />
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="loop" className="space-y-6">
        <div>
          <p className="kicker">The loop</p>
          <h2 id="loop" className="text-2xl font-semibold">
            From patch day to your next session
          </h2>
        </div>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <section aria-labelledby="features" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
