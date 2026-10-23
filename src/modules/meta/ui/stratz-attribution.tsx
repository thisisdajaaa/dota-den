import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { PositionStats } from "../domain/position-stats";

export const STRATZ_URL = "https://stratz.com";

/** "Oct 4 – 10": the UTC days a STRATZ window covers. */
export function formatDayRange(window: PositionStats["window"]): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const from = new Date(`${window.from}T00:00:00Z`);
  const to = new Date(`${window.to}T00:00:00Z`);
  return window.from === window.to ? fmt.format(from) : fmt.formatRange(from, to);
}

/** "Data: STRATZ", linking to stratz.com, next to anything built on STRATZ data. */
export function StratzAttribution({ t }: { t: Translator<Messages> }) {
  return (
    <span className="whitespace-nowrap">
      {t("meta.attribution.label")}{" "}
      <a
        href={STRATZ_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-gold hover:underline"
      >
        {t("meta.attribution.stratz")}
      </a>
    </span>
  );
}
