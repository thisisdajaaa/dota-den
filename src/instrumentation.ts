import type { Instrumentation } from "next";

/**
 * Once per server instance: shared plumbing (provider gateways, AI budgets) reports budget and
 * Redis trouble through the owner alerts feature, loaded only when there's something to say.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerOpsSink } = await import("@/common/ops/ops-signals");
  registerOpsSink(async (signal) => {
    const { opsMonitor } = await import("@/modules/alerts");
    await opsMonitor.plumbing(signal);
  });
}

/** Server errors (renders, route handlers, actions) go to the admin page's error list. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { errorsService } = await import("@/modules/errors");
    const e = err as { message?: unknown; digest?: unknown; stack?: unknown } | null;
    await errorsService.record({
      source: "server",
      message: typeof e?.message === "string" ? e.message : String(err),
      digest: typeof e?.digest === "string" ? e.digest : null,
      path: request.path,
      route: context.routePath,
      kind: context.routeType,
      stack: typeof e?.stack === "string" ? e.stack : null,
    });
  } catch {
    // Never let error reporting fail the request further.
  }
};
