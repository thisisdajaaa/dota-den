import Link from "next/link";
import { SearchX } from "lucide-react";

export default function SessionNotFound() {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Session not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        We couldn&apos;t find this session in your match history. Changing the break length regroups
        your games, and very old games may not be imported, so this link may no longer point to a
        session.
      </p>
      <Link href="/sessions" className="text-sm text-gold hover:underline">
        Back to your sessions
      </Link>
    </section>
  );
}
