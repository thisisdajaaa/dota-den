import "server-only";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Keys whose values must never reach logs (email addresses are personal data: log a masked
// copy under another key, e.g. `to`).
const REDACT = /token|secret|password|key|cookie|authorization|uri|email/i;

function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k)) out[k] = "[redacted]";
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else out[k] = v;
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

export function createLogger(base: Fields = {}, minLevel?: Level): Logger {
  const threshold = order[minLevel ?? ((process.env.LOG_LEVEL as Level) || "info")] ?? 20;
  const write = (level: Level, msg: string, fields?: Fields): void => {
    if (order[level] < threshold) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      msg,
      ...redact({ ...base, ...fields }),
    });
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  };
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (f) => createLogger({ ...base, ...f }, minLevel),
  };
}

export const logger = createLogger({ app: "dota-den" });
