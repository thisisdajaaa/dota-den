import Link from "next/link";
import { SearchX } from "lucide-react";

export default function PlayerNotFound() {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Player not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        OpenDota has no public profile for this account. Check the ID, or search for the player by
        name.
      </p>
      <Link href="/players" className="text-sm text-gold hover:underline">
        Search players
      </Link>
    </section>
  );
}
