import Link from "next/link";
import { SearchX } from "lucide-react";

export default function PatchNotFound() {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Patch not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        There&apos;s no official patch with that version number.
      </p>
      <Link href="/patches" className="text-sm text-gold hover:underline">
        See all patches
      </Link>
    </section>
  );
}
