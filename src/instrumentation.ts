import type { Instrumentation } from "next";

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
