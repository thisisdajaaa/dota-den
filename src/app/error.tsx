"use client";

import { ErrorPanel } from "@/components/error-panel";

/**
 * A page or a group layout failed (e.g. the database is down while a signed-in page checks
 * the session). Rendered inside the root layout, so the site's header and footer stay; only
 * a failure of the root layout itself reaches global-error.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto my-10 w-full max-w-xl">
      <ErrorPanel error={error} retry={retry} homeLink />
    </div>
  );
}
