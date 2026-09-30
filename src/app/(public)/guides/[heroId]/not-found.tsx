import Link from "next/link";
import { SearchX } from "lucide-react";

export default function HeroGuideNotFound() {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Hero not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        There&apos;s no hero with this ID. Pick one from the list.
      </p>
      <Link href="/guides" className="text-sm text-gold hover:underline">
        All heroes
      </Link>
    </section>
  );
}
