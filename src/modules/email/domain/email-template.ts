/**
 * A small HTML email (pure): one column, inline styles, no images or scripts, plus a plain
 * text alternative. Every piece of text is escaped here, so callers pass plain strings.
 */

export interface EmailLink {
  label: string;
  url: string;
}

export interface EmailContent {
  /** BCP 47 language tag for `<html lang>`. */
  lang: string;
  subject: string;
  /** Shown by inboxes after the subject. */
  preheader: string;
  heading: string;
  /** Small line above the heading (e.g. the week's dates). */
  kicker?: string;
  /** Label and value pairs (record, MMR, heroes). */
  rows?: ReadonlyArray<{ label: string; value: string }>;
  paragraphs?: readonly string[];
  /** The one button. */
  action?: EmailLink;
  /** Small print at the bottom. */
  footer?: readonly string[];
  footerLinks?: readonly EmailLink[];
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Only absolute http(s) links go into an email. */
function safeUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error("Email links must be http(s)");
  return parsed.toString();
}

const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MUTED = "#6b6f76";
const TEXT = "#1c1d21";
const ACCENT = "#a8761c";

export function renderEmail(content: EmailContent): { html: string; text: string } {
  const e = escapeHtml;
  const rows = (content.rows ?? [])
    .map(
      (r) =>
        `<tr><td style="padding:6px 0;color:${MUTED};font-size:14px;vertical-align:top">${e(r.label)}</td>` +
        `<td style="padding:6px 0 6px 16px;color:${TEXT};font-size:14px;font-weight:600;text-align:right;vertical-align:top">${e(r.value)}</td></tr>`,
    )
    .join("");
  const paragraphs = (content.paragraphs ?? [])
    .map(
      (p) => `<p style="margin:0 0 14px;color:${TEXT};font-size:15px;line-height:1.5">${e(p)}</p>`,
    )
    .join("");
  const action = content.action
    ? `<p style="margin:20px 0"><a href="${e(safeUrl(content.action.url))}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:10px 18px;border-radius:6px">${e(content.action.label)}</a></p>`
    : "";
  const footer = [
    ...(content.footer ?? []).map((f) => e(f)),
    ...(content.footerLinks ?? []).map(
      (l) =>
        `<a href="${e(safeUrl(l.url))}" style="color:${MUTED};text-decoration:underline">${e(l.label)}</a>`,
    ),
  ]
    .map((f) => `<p style="margin:0 0 8px;color:${MUTED};font-size:12px;line-height:1.5">${f}</p>`)
    .join("");

  const html = [
    "<!doctype html>",
    `<html lang="${e(content.lang)}"><head><meta charset="utf-8">`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${e(content.subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#f4f4f5;${FONT}">`,
    `<div style="display:none;max-height:0;overflow:hidden">${e(content.preheader)}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px"><tr><td style="padding:28px 28px 20px;${FONT}">`,
    `<p style="margin:0 0 4px;color:${ACCENT};font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">Dota Den</p>`,
    content.kicker
      ? `<p style="margin:0 0 4px;color:${MUTED};font-size:13px">${e(content.kicker)}</p>`
      : "",
    `<h1 style="margin:0 0 18px;color:${TEXT};font-size:22px;line-height:1.3">${e(content.heading)}</h1>`,
    rows
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7">${rows}</table>`
      : "",
    paragraphs,
    action,
    "</td></tr>",
    footer
      ? `<tr><td style="padding:16px 28px 24px;border-top:1px solid #e4e4e7;${FONT}">${footer}</td></tr>`
      : "",
    "</table></td></tr></table></body></html>",
  ].join("");

  const text = [
    content.kicker,
    content.heading,
    "",
    ...(content.rows ?? []).map((r) => `${r.label}: ${r.value}`),
    ...(content.rows?.length ? [""] : []),
    ...(content.paragraphs ?? []).flatMap((p) => [p, ""]),
    ...(content.action ? [`${content.action.label}: ${safeUrl(content.action.url)}`, ""] : []),
    ...(content.footer?.length || content.footerLinks?.length ? ["--"] : []),
    ...(content.footer ?? []),
    ...(content.footerLinks ?? []).map((l) => `${l.label}: ${safeUrl(l.url)}`),
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();

  return { html, text };
}
