"use client";

import { ErrorPanel } from "@/components/error-panel";

export default function HeroesError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel error={error} retry={retry} title="Something went wrong loading your heroes" />
  );
}
