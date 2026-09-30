import Link from "next/link";

/** Shown to anyone who isn't an admin: the page doesn't exist as far as they're concerned. */
export default function AdminNotFound() {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link href="/dashboard" className="text-sm text-gold hover:underline">
        Back to your overview
      </Link>
    </section>
  );
}
