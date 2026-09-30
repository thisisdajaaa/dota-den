"use client";

import { ErrorPanel } from "@/components/error-panel";

export default function PlayersError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorPanel error={error} retry={retry} title="Something went wrong loading players" />;
}
