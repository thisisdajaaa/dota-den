"use client";

import { useLocale, useT } from "@/common/i18n/client";
import { useReportError } from "@/components/report-error";

/** Last resort when the root layout itself fails: its own document, so styles are inline. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  useReportError(error);
  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0f0b08",
          color: "#f3ece2",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <title>{t("system.error.pageTitle")}</title>
        <div>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>{t("system.error.title")}</h1>
          <p style={{ color: "#a89f93", margin: "0 0 16px" }}>{t("system.error.globalBody")}</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              background: "#e2b04a",
              color: "#1a1208",
              border: 0,
              borderRadius: 6,
              padding: "8px 16px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("system.error.retry")}
          </button>
        </div>
      </body>
    </html>
  );
}
