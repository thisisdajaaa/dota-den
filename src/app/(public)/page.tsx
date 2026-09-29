import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const AUTH_ERRORS: Record<string, string> = {
  state_mismatch: "Your sign-in session expired or was started in another tab. Please try again.",
  provider_unavailable: "Steam didn't respond. Please try again in a moment.",
};

const FEATURES = [
  {
    title: "Solo vs party, honestly",
    description:
      "Every match is labelled solo, party or unknown, with its source. Missing data is never counted as solo.",
  },
  {
    title: "Patch hub",
    description:
      "Official patch notes, linked to their source, with the changes that affect your hero pool.",
  },
  {
    title: "Draft practice",
    description:
      "Captain's Mode-style pick and ban practice, locally or with friends, with transparent feedback.",
  },
];

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const { auth_error } = await searchParams;
  const authError = typeof auth_error === "string" ? auth_error : null;
  const signInRequired = authError === "signed_out";

  return (
    <div className="space-y-10">
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

      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Review patches, practice drafts, climb with friends.
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          A companion for ranked players who queue solo and with a party. See what changed for your
          heroes, practice a draft, then review your games together.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href="/api/v1/auth/steam/login">Sign in through Steam</a>
          </Button>
        </div>
      </section>

      <section aria-labelledby="features" className="grid gap-4 sm:grid-cols-3">
        <h2 id="features" className="sr-only">
          Features
        </h2>
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <CardHeader>
              <CardTitle>{f.title}</CardTitle>
              <CardDescription>{f.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </div>
  );
}
