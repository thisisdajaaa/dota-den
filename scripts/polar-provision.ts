/**
 * Sets up Polar for Dota Den Plus (ADR 0013, Polar addendum), idempotently: the monthly and
 * yearly products (recurring, PHP, PLAN_PRICES) and the webhook endpoint for the Plus webhook.
 * Products that already exist (matched by `metadata.plan`, else by name) are reused as they
 * are; an existing endpoint for the URL is reused and only gets missing events added.
 *
 * Dry run by default: prints what it would do and changes nothing. Pass --apply to make the
 * changes.
 *
 *   POLAR_ACCESS_TOKEN=… POLAR_SERVER=sandbox npm run plus:polar-provision
 *   POLAR_ACCESS_TOKEN=… POLAR_SERVER=production npm run plus:polar-provision -- --apply
 *
 * Env:
 *   POLAR_ACCESS_TOKEN         organization access token (products and webhooks write scopes)
 *   POLAR_SERVER               production | sandbox (required, so the target is explicit)
 *   POLAR_WEBHOOK_URL          default https://www.dota-den.com/api/v1/plus/webhook
 *   POLAR_WEBHOOK_SECRET_FILE  optional: where a NEW endpoint's secret is written (mode 600,
 *                              never overwritten). Without it, read the secret in the dashboard.
 *
 * Prints only the product ids and the webhook endpoint id, never the token or the secret.
 */
import { chmod, writeFile } from "node:fs/promises";
import { PolarApiClient, type PolarServer } from "@/modules/plus/infrastructure/polar-api-client";
import { provisionPolar } from "@/modules/plus/infrastructure/polar-provisioning";

const DEFAULT_WEBHOOK_URL = "https://www.dota-den.com/api/v1/plus/webhook";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const token = process.env.POLAR_ACCESS_TOKEN?.trim();
  const server = process.env.POLAR_SERVER?.trim();
  if (!token) throw new Error("Set POLAR_ACCESS_TOKEN (an organization access token).");
  if (server !== "production" && server !== "sandbox")
    throw new Error("Set POLAR_SERVER to production or sandbox.");
  const webhookUrl = process.env.POLAR_WEBHOOK_URL?.trim() || DEFAULT_WEBHOOK_URL;
  if (!/^https:\/\//.test(webhookUrl)) throw new Error("POLAR_WEBHOOK_URL must be an https URL.");
  const secretFile = process.env.POLAR_WEBHOOK_SECRET_FILE?.trim() || null;

  console.log(`Polar ${server}${apply ? "" : " (dry run: nothing is changed; pass --apply)"}`);
  const api = new PolarApiClient({
    accessToken: token,
    server: server as PolarServer,
    timeoutMs: 20_000,
  });
  const result = await provisionPolar({
    api,
    apply,
    webhookUrl,
    log: (line) => console.log(line),
    saveSecret: secretFile
      ? async (secret) => {
          try {
            // "wx": never overwrite an existing file (it may hold the live secret).
            await writeFile(secretFile, `${secret}\n`, { mode: 0o600, flag: "wx" });
            await chmod(secretFile, 0o600);
            console.log(
              `  Secret written to ${secretFile} (mode 600). Set it as POLAR_WEBHOOK_SECRET.`,
            );
          } catch {
            console.log(
              `  Couldn't write ${secretFile} (it may exist already). Read the secret in the dashboard (Settings → Webhooks).`,
            );
          }
        }
      : undefined,
  });

  console.log("");
  console.log(`POLAR_PRODUCT_ID_MONTHLY=${result.productIds.monthly ?? "(not created yet)"}`);
  console.log(`POLAR_PRODUCT_ID_YEARLY=${result.productIds.yearly ?? "(not created yet)"}`);
  console.log(`Webhook endpoint id: ${result.webhookEndpointId ?? "(not created yet)"}`);
}

main().catch((e: unknown) => {
  // PolarApiError messages carry only the status, never the request or the token.
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
