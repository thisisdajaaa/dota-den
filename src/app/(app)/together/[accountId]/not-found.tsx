import Link from "next/link";
import { SearchX } from "lucide-react";

export default function TogetherPairNotFound() {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Player not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        That isn&apos;t a valid Dota account ID. Pick a friend from your list instead.
      </p>
      <Link href="/together" className="text-sm text-gold hover:underline">
        Back to your friends
      </Link>
    </section>
  );
}
