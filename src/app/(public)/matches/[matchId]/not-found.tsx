import Link from "next/link";
import { SearchX } from "lucide-react";

export default function MatchNotFound() {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Match not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        OpenDota has no record of this match. Check the ID, or the match may be too recent.
      </p>
      <Link href="/" className="text-sm text-gold hover:underline">
        Go home
      </Link>
    </section>
  );
}
