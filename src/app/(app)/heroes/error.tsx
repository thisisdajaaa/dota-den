"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HeroesError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center" role="alert">
      <AlertTriangle aria-hidden className="size-8 text-loss" />
      <h1 className="text-lg font-semibold">Something went wrong loading your heroes</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This is on our side, not yours. Try again in a moment.
      </p>
      <Button type="button" onClick={() => retry()}>
        Try again
      </Button>
    </section>
  );
}
