import { plus as copy } from "@/common/i18n/messages/en/plus";
import { PLAN_PRICES, PLANS, type Plan } from "../domain/plans";
import { POLAR_API_VERSION, type PolarApiClient } from "./polar-api-client";
import { POLAR_WEBHOOK_EVENTS } from "./polar-provider";

/**
 * Sets up Polar for Plus (scripts/polar-provision.ts), idempotently: one recurring product per
 * plan (PHP, the amounts in PLAN_PRICES) and the webhook endpoint the adapter needs. Existing
 * products are found by `metadata.plan` (else by name) and reused, never changed; an existing
 * endpoint for the URL is reused, and only its missing events (or API version) are added.
 * Without `apply`, nothing is created or changed: it says what it would do.
 *
 * Endpoints and fields: Polar API 2026-10 (GET/POST /v1/products/, GET/POST
 * /v1/webhooks/endpoints, PATCH /v1/webhooks/endpoints/{id}). Nothing secret is logged: a new
 * endpoint's secret only goes to `saveSecret`.
 */

type Api = Pick<PolarApiClient, "request">;
type Json = Record<string, unknown>;

export interface ProvisionResult {
  productIds: Partial<Record<Plan, string>>;
  webhookEndpointId: string | null;
  /** Whether a new endpoint's secret was handed to `saveSecret`. */
  secretSaved: boolean;
}

const INTERVAL: Record<Plan, "month" | "year"> = { monthly: "month", yearly: "year" };

export const polarProductName = (plan: Plan) => `Dota Den Plus (${plan})`;

/** "₱2,990" → 299000 (Polar amounts are in the currency's cents). */
export function priceInCents(amount: string): number {
  const digits = amount.replace(/[^\d.]/g, "");
  const value = Math.round(Number(digits) * 100);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Unreadable price: ${amount}`);
  return value;
}

/** The POST /v1/products/ body for one plan. */
export function polarProductRequest(plan: Plan): Json {
  const price = PLAN_PRICES[plan];
  const per = plan === "monthly" ? copy.page.perMonth : copy.page.perYear;
  return {
    name: polarProductName(plan),
    description: `${copy.page.lead} ${copy.page[plan]}: ${price.amount} ${per}.`,
    recurring_interval: INTERVAL[plan],
    prices: [
      {
        amount_type: "fixed",
        price_currency: price.currency.toLowerCase(),
        price_amount: priceInCents(price.amount),
      },
    ],
    metadata: { plan },
  };
}

/** Every item of a paginated list (`{items, pagination: {max_page}}`). */
async function listAll(api: Api, path: string): Promise<Json[]> {
  const items: Json[] = [];
  for (let page = 1; page <= 50; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await api.request("GET", `${path}${sep}limit=100&page=${page}`);
    items.push(...((res.items as Json[] | undefined) ?? []));
    const max = Number((res.pagination as Json | undefined)?.max_page ?? 1);
    if (page >= max) break;
  }
  return items;
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** What doesn't match the plan's price (shown, never changed: prices belong to the owner). */
function productMismatch(product: Json, plan: Plan): string | null {
  const want = polarProductRequest(plan);
  if (product.recurring_interval !== want.recurring_interval)
    return `recurs every ${String(product.recurring_interval)}, not ${String(want.recurring_interval)}`;
  const [price] = want.prices as Json[];
  const prices = ((product.prices as Json[] | undefined) ?? []).filter((p) => !p.is_archived);
  const ok = prices.some(
    (p) =>
      p.amount_type === "fixed" &&
      String(p.price_currency).toLowerCase() === price.price_currency &&
      p.price_amount === price.price_amount,
  );
  return ok
    ? null
    : `has no fixed ${String(price.price_currency)} ${String(price.price_amount)} price`;
}

export async function provisionPolar(opts: {
  api: Api;
  apply: boolean;
  webhookUrl: string;
  log: (line: string) => void;
  /** Stores a new endpoint's secret (never logged); without it, read it from the dashboard. */
  saveSecret?: (secret: string) => Promise<void>;
}): Promise<ProvisionResult> {
  const { api, apply, log } = opts;
  const result: ProvisionResult = { productIds: {}, webhookEndpointId: null, secretSaved: false };

  const products = (await listAll(api, "/v1/products/?is_archived=false")).filter(
    (p) => p.is_recurring !== false,
  );
  for (const plan of PLANS) {
    const found =
      products.find((p) => (p.metadata as Json | undefined)?.plan === plan) ??
      products.find((p) => p.name === polarProductName(plan));
    if (found) {
      result.productIds[plan] = String(found.id);
      const mismatch = productMismatch(found, plan);
      log(`Product ${plan}: exists (${String(found.name)})`);
      if (mismatch) log(`  Warning: it ${mismatch}. Not changed; check it in the dashboard.`);
      continue;
    }
    if (!apply) {
      log(`Product ${plan}: would create ${JSON.stringify(polarProductRequest(plan))}`);
      continue;
    }
    const created = await api.request("POST", "/v1/products/", polarProductRequest(plan));
    result.productIds[plan] = String(created.id);
    log(`Product ${plan}: created`);
  }

  const endpoints = await listAll(api, "/v1/webhooks/endpoints");
  const endpoint = endpoints.find(
    (e) => typeof e.url === "string" && sameUrl(e.url, opts.webhookUrl),
  );
  if (endpoint) {
    result.webhookEndpointId = String(endpoint.id);
    const have = new Set((endpoint.events as string[] | undefined) ?? []);
    const missing = POLAR_WEBHOOK_EVENTS.filter((e) => !have.has(e));
    const versionOff = endpoint.api_version !== POLAR_API_VERSION;
    log(`Webhook endpoint: exists for ${opts.webhookUrl}`);
    if (endpoint.format !== "raw")
      log(`  Warning: its format is ${String(endpoint.format)}; the app needs "raw".`);
    if (endpoint.enabled === false)
      log("  Warning: it is disabled; enable it in the dashboard (Settings → Webhooks).");
    if (missing.length > 0 || versionOff) {
      const update: Json = {};
      if (missing.length > 0) update.events = [...have, ...missing];
      if (versionOff) update.api_version = POLAR_API_VERSION;
      if (!apply) log(`  Would update: ${JSON.stringify(update)}`);
      else {
        await api.request("PATCH", `/v1/webhooks/endpoints/${String(endpoint.id)}`, update);
        log(`  Updated: ${Object.keys(update).join(", ")}`);
      }
    }
    log(
      "  Its secret is in the dashboard (Settings → Webhooks) if POLAR_WEBHOOK_SECRET isn't set yet.",
    );
    return result;
  }

  const body: Json = {
    url: opts.webhookUrl,
    name: "Dota Den Plus",
    format: "raw",
    events: [...POLAR_WEBHOOK_EVENTS],
    api_version: POLAR_API_VERSION,
  };
  if (!apply) {
    log(`Webhook endpoint: would create ${JSON.stringify(body)}`);
    return result;
  }
  const created = await api.request("POST", "/v1/webhooks/endpoints", body);
  result.webhookEndpointId = String(created.id);
  log(`Webhook endpoint: created for ${opts.webhookUrl}`);
  if (typeof created.secret === "string" && opts.saveSecret) {
    await opts.saveSecret(created.secret);
    result.secretSaved = true;
  } else {
    log("  Read its secret in the dashboard (Settings → Webhooks) and set POLAR_WEBHOOK_SECRET.");
  }
  return result;
}
