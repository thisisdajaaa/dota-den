"use client";

import { useEffect } from "react";

/** Send an error an error page caught to the admin error list (once per error). */
export function useReportError(error: Error & { digest?: string }) {
  useEffect(() => {
    const body = JSON.stringify({
      message: error.message || "Unknown error",
      digest: error.digest ?? null,
      path: window.location.pathname,
      stack: error.stack?.slice(0, 4_000) ?? null,
    });
    // keepalive lets the report finish even if the user navigates away.
    fetch("/api/v1/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [error]);
}
