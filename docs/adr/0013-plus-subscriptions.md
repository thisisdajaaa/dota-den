# ADR 0013: Dota Den Plus subscriptions

- Status: Accepted (Phase 0: built, off until configured; Polar adapter added 2026-11-18)
- Date: 2026-10-23

## Context

Servers, OpenDota calls and AI reviews cost money every month. We want an optional way for
players to support Dota Den without taking anything away from free players, without handling
card data, and without becoming responsible for sales tax in every country our players live in.

## Decision

A new `plus` feature (ADR 0009 layout) sells **Dota Den Plus** through a **merchant of record**
behind a provider-agnostic `BillingProvider` port. The first adapter is Lemon Squeezy.

### What Plus is

- **Everything free stays free.** Plus only adds:
  - **Go-live alerts**: a Web Push within minutes when a channel you follow on /live starts
    streaming (Twitch or Kick), once per stream session, with its own on/off setting.
  - **Supporter badge** next to your name in the app shell (sidebar and phone header), on
    leaderboards and on your player profile. Badges are only shown to signed-in players.
  - **Higher limits where limits already exist**, doubled: tracked players (100 → 200),
    followed streamers (100 → 200), groups you can be in (5 → 10). Members per group stay at 10:
    that cap belongs to the group, not the player. No new caps for free players.
  - **AI review**: there is no per-player quota today (only the per-minute rate limit against
    abuse), so free keeps exactly that. `aiReviewAllowance()` returns `"unlimited"` for Plus, so a
    future free quota can never apply to supporters.
  - **AI match coach** and **priority sync** (added later, ADR 0014): unlimited coach reviews
    (free: one new review per rolling 7 days; the coach is new, nothing free became paid), a
    faster history import and automatic parse requests for new games, inside the same global
    budgets.
- Display prices **₱149/month** and **₱1,490/year** (lowered on 2026-11-19 from ₱299/₱2,990, below Valve's ₱251 Dota Plus; existing subscribers keep their price) (Philippine pesos; the yearly plan is ten
  months' price, "2 months free"). The provider charges, may show local currency and adds tax;
  the page says so. (First drafted as $3.99 / $29.99; switched to pesos on 2026-10-23.)

### Verified provider facts (Lemon Squeezy docs, read 2026-10-23)

- Webhook signing ([signing requests](https://docs.lemonsqueezy.com/help/webhooks/signing-requests)):
  the `X-Signature` header holds the **HMAC-SHA256 hex digest of the raw request body**, keyed with
  the webhook's signing secret. The documented Node example uses `crypto.timingSafeEqual`.
- Webhook requests ([webhook requests](https://docs.lemonsqueezy.com/help/webhooks/webhook-requests)):
  `POST`, `Content-Type: application/json`, `X-Event-Name`, `X-Signature`; the body is a JSON:API
  resource with `meta.event_name`; a `200` acknowledges; failures are **retried up to three more
  times with exponential backoff** (the docs' example: 5, 25 and 125 seconds). **There is no event
  or delivery id** in the documented payloads or headers.
- Event names ([event types](https://docs.lemonsqueezy.com/help/webhooks/event-types)):
  `subscription_created`, `subscription_updated`, `subscription_cancelled`,
  `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused`,
  `subscription_payment_success`, `subscription_payment_failed`, `subscription_payment_recovered`,
  `subscription_payment_refunded`, plus `order_created`, `order_refunded`, `customer_updated`,
  `license_key_*` and `affiliate_activated`. `subscription_updated` is the documented catch-all
  for the latest subscription data.
- Custom data ([passing custom data](https://docs.lemonsqueezy.com/help/checkout/passing-custom-data)):
  `https://[STORE].lemonsqueezy.com/checkout/buy/[VARIANT_ID]?checkout[custom][user_id]=123`;
  the values come back **as strings** in `meta.custom_data` on order, subscription and license
  key events.
- Subscription object ([the subscription object](https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object)):
  `status` is one of `on_trial`, `active`, `paused`, `past_due`, `unpaid`, `cancelled`,
  `expired`. `past_due`: a renewal failed and is retried over about two weeks (back to `active`
  on success, `unpaid` after 4 failed attempts). `cancelled`: valid until `ends_at`. `renews_at`,
  `ends_at`, `trial_ends_at`, `updated_at`, `test_mode` are present; `urls.customer_portal` is a
  **pre-signed link valid 24 hours** from the time of the request.
- Customer portal ([customer portal](https://docs.lemonsqueezy.com/help/online-store/customer-portal)):
  the generic portal is `https://[STORE].lemonsqueezy.com/billing` (magic-link sign-in);
  customers can cancel/resume, pause, change plans and manage payment methods there.

### Storage (ADR 0002)

- `plus_subscriptions`, one document per provider subscription (`_id` `lemonsqueezy:<id>`,
  `schemaVersion` 1): user id, Dota account (for badges), status, plan, variant and customer ids,
  `renews_at`, `ends_at`, `trial_ends_at`, the provider's `updated_at`, `pastDueSince`, test mode,
  and the latest signed portal link with when it arrived. **No names, emails or card details.**
  Indexes: `by_user`, `by_account_status`, `by_status`.
- `billing_webhook_events`: one document per received event (`_id` `lemonsqueezy:<sha256(body)>`):
  event name, subscription id, user id, outcome, received time. No payload. TTL 90 days.

### Webhooks: `POST /api/v1/plus/webhook`

In a fixed order: no provider configured → **404**; the signature is checked on the **raw body**
before anything is parsed (constant-time compare of the decoded HMAC; a missing secret or header
fails) → **401**; parse → 400 for something we don't understand; **claim the event id** (a
duplicate answers 200 `duplicate` and changes nothing); apply. A failure releases the claim and
answers 500, so the provider's retry is handled.

- **Idempotency.** Lemon Squeezy has no event id, and a retry resends the same body, so the
  SHA-256 of the raw body is the event id. A replayed or retried delivery is a no-op.
- **Out of order.** A subscription is only written when the incoming `updated_at` is not older than
  the stored one, checked inside the same Mongo update (`providerUpdatedAt: {$lte: incoming}`),
  so two concurrent deliveries can't move it backwards. Older events are recorded as `stale`.
- **State comes from subscription objects only.** `subscription_payment_*` events carry an invoice,
  not the subscription; they're recorded and acknowledged (`ignored`), and the
  `subscription_updated` that accompanies a status change carries the new state.
- **Linking a purchase to a user.** Only our own user id in the checkout's custom data, added on the
  server by `GET /api/v1/plus/checkout` (a signed-in route that 303s to the provider), and checked
  against our users. Later events without custom data keep the stored link.
- **Unknown user (decision: store and acknowledge).** A subscription whose custom data is missing,
  malformed or names no user is stored as **unlinked** (`userId: null`), logged
  (`billing_subscription_unlinked`), acknowledged with 200 so the provider stops retrying, and
  counted on the admin page. It grants nothing. Our user ids are only issued at sign-in, so an
  unknown id can't "appear later"; the owner resolves these in the provider's dashboard (refund or
  cancel), and the customer can still manage it in the provider's portal.
- **Test mode.** `LEMONSQUEEZY_TEST_MODE=true` deployments take only test-mode events, others only
  live ones (`mode_mismatch` is recorded and acknowledged).

### Entitlements (pure, `domain/entitlement.ts`)

Computed on the server from stored state only; nothing the browser sends can grant Plus.

| Status                         | Plus?                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `active`, `on_trial`           | yes                                                                                    |
| `past_due`                     | yes for **7 days** from the first past-due update (`pastDueSince`), then no until paid |
| `cancelled`                    | yes until `ends_at` (else `renews_at`), then no                                        |
| `paused`, `unpaid`, `expired`  | no                                                                                     |
| any, with `PLUS_ENABLED` unset | no (kill switch; data kept, webhooks still recorded, billing portal still reachable)   |

Several subscriptions: the best one wins. Limits fall back to the free cap when the lookup fails.

### Nothing is live until configured

All variables are optional (see `docs/configuration.md`). No provider: `/plus` says "coming soon"
and isn't in the navigation, no checkout renders, checkout/portal/webhook answer 404, everyone is
free. Provider set but `PLUS_ENABLED` not `true`: `/plus` says new subscriptions are paused,
everyone is treated as free, webhooks keep the stored state current.

### Go-live alerts

- A `streamer-alerts` job (ADR 0008 jobs module). **Frequency: a QStash schedule every 5 minutes**
  (`npm run jobs:schedules` creates or updates it idempotently, id `dota-den-streamer-alerts`;
  288 messages a day). We chose a schedule over a self-rescheduling delayed job: a chain breaks
  for good when one delivery exhausts its retries or a deploy drops it, and needs bootstrapping;
  a schedule just runs again next tick (`retries: 0`, a missed tick is replaced 5 minutes later).
  Fallback for other schedulers: `GET /api/cron/streamer-alerts` (CRON_SECRET bearer). Vercel
  Hobby crons only run daily, so a daily fallback would never be "go-live" news.
- **Cheap when idle.** No push keys, no Plus players or no streaming-site keys: no upstream call
  (one indexed query on `plus_subscriptions`). Then only Plus players with a device who left the
  alert on, and their follows.
- **Rate limits.** Each site is asked once per run for every distinct followed channel through the
  existing `StreamDirectory.liveByChannels` (Twitch Helix: 100 logins per request; Kick: 50 slugs,
  its API's maximum), so the cost grows with distinct channels, not players: a few requests per run.
- **Once per stream.** The notification log key is `platform:channelId:startedAt` (ADR 0010's
  claim-by-insert), so later runs that see the same stream send nothing and the next stream is
  announced again; without a start time, at most once per UTC day. Streams that started more than
  45 minutes ago aren't announced (a new follow or a schedule outage doesn't produce stale news).
- Respects the `streamer_live` setting (default on, shown only to Plus players) and the device
  opt-in; text in the player's language.

### Privacy and legal

- "Download your data" includes `plusSubscriptions` (without the signed portal link) and
  `plusBillingEvents`. Deleting the account deletes both. Payment records, invoices and billing
  addresses live with the provider; the account page warns before deletion when a subscription is
  still billing (deleting doesn't cancel it) and links to the billing portal.
- `/terms` and `/refunds` are **drafts** (marked in code) for the owner to review; they say Dota
  Den is unofficial and not affiliated with Valve, and that the merchant of record handles
  payments, taxes and refunds under its own policy. They aren't legal advice. There is no privacy
  page yet; one should exist before Plus goes on sale.

## Consequences

- One more optional provider to configure (store, products/variants, webhook) and a QStash
  schedule for alerts. Switching providers means a new adapter behind `BillingProvider`; the
  stored state and entitlements stay.
- Every signed-in page does one more indexed query (the badge in the app shell); it fails closed
  (no badge) and is skipped entirely while Plus is off.
- Out-of-order protection trusts the provider's `updated_at`; two events with the same timestamp
  are applied in arrival order.

## Addendum (2026-10-26): staff Plus

Admins (`ADMIN_STEAM_IDS`, the role set at sign-in) have Plus without a subscription, with the
reason `staff`, also while Plus is off or not configured, so the owner can use and test every
Plus feature in production without buying it. Staff aren't supporters (no badge) and aren't
counted as paying players on the admin page. Removing someone from `ADMIN_STEAM_IDS` removes it
at their next sign-in. Entitlement still never comes from the browser.

## Addendum (2026-11-18): Polar as the payment provider

Lemon Squeezy declined the store (2026-10-27), so the legal pages stopped naming it. The owner
then signed up to **Polar** (polar.sh) as an individual in the Philippines (organization slug
`dota-den`, default currency PHP). Polar is also a merchant of record, so the decision above
stands: a second adapter, `PolarProvider`, behind the same `BillingProvider` port.
`BILLING_PROVIDER=polar` selects it; the Lemon Squeezy adapter stays and still works. Polar's
account review was pending when this was built, so `PLUS_ENABLED` stays off until it passes.

### Verified provider facts (Polar docs and OpenAPI schema, API version 2026-10, read 2026-11-18)

- **API**: `https://api.polar.sh/v1` (sandbox: `https://sandbox-api.polar.sh/v1`, isolated, with its
  own tokens, products and secrets), `Authorization: Bearer <organization access token>`.
  Date-based versions: requests are pinned with `Polar-Version: 2026-10` and the webhook endpoint
  with `api_version: "2026-10"`. A version is supported about nine months (Next, Current,
  Deprecated); a removed one answers 404. **2026-10 becomes Deprecated in January 2027 and is
  removed in April 2027**, so `POLAR_API_VERSION` (and the endpoint's `api_version`) must be
  moved to the next version before then; check the changes to `Subscription`, `Checkout` and
  `CustomerSession`.
- **Webhooks** ([delivery](https://polar.sh/docs/integrate/webhooks/delivery)): Standard
  Webhooks. Headers `webhook-id`, `webhook-timestamp` (Unix seconds) and `webhook-signature`
  (space-separated `v1,<base64>`); the HMAC-SHA256 is over `${id}.${timestamp}.${body}`.
  **Key encoding depends on the secret's age**: secrets generated on or after 2026-09-08 00:00 UTC
  are Standard Webhooks (the base64 after `whsec_` is the key); older ones are "Polar HMAC" (the
  key is the UTF-8 bytes of the whole `whsec_…` string). Polar's SDKs try both, and so do we; the
  endpoint's `uses_standard_webhook_signature` says which applies. Failed deliveries are retried
  up to 10 times with exponential backoff, a delivery times out after 10 s, and an endpoint is
  disabled after 10 consecutive failures. Redirects count as failures (the URL must be the final
  one: `https://www.dota-den.com/...`, not the apex that redirects).
- **Payload**: `{type, timestamp, api_version, data}`. `Subscription.status` is one of
  `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`,
  `paused`; it also has `current_period_end`, `cancel_at_period_end`, `ends_at`, `ended_at`,
  `trial_end`, `modified_at`, `customer_id`, `product_id`, `metadata`, `customer.external_id` and
  `product.metadata`. **No test-mode flag**: sandbox is a separate server with separate secrets.
- **Event sequences** ([events](https://polar.sh/docs/integrate/webhooks/events)): an end-of-period
  cancellation sends `subscription.updated` + `subscription.canceled` with status still `active`
  and `cancel_at_period_end: true`; at the period end `subscription.updated` +
  `subscription.revoked` with status `canceled`. Renewals send `subscription.cycled`,
  `subscription.updated`, then `order.created`/`order.paid`. A failed renewal moves to `past_due`
  and is retried after 2, 7, 14 and 21 days, then revoked (`unpaid`).
- **Checkout** ([checkout API](https://polar.sh/docs/features/checkout/session)):
  `POST /v1/checkouts/` with `products`, `metadata` (copied to the resulting subscription and
  orders), `external_customer_id` (the Polar customer gets it as `external_id`), `success_url`,
  `return_url` and `customer_ip_address` (a session made on a server otherwise gets the server's
  country for currency and tax). The answer's `url` is the hosted checkout.
- **Customer portal** ([navigate customers](https://polar.sh/docs/features/customer-portal/navigate-customers)):
  `https://polar.sh/<org>/portal` (sign-in by an emailed code), or a pre-authenticated link from
  `POST /v1/customer-sessions/` (`customer_id`, `return_url`) → `customer_portal_url`, short-lived,
  to be made at click time and never stored.
- **Refunds** ([refunds](https://polar.sh/docs/features/refunds)): issued by the merchant (us)
  from the dashboard; refunding a subscription order doesn't end the subscription. Polar may
  refund on its own within 60 days of purchase to prevent a chargeback (cancelling the
  subscription). Payment fees aren't returned.

### How the adapter maps it

- **Linking a purchase to a user.** Checkout now goes through the API, so the port's
  `checkoutUrl(plan, userId, {ip})` is **async** (Lemon Squeezy's still just builds the link). The
  endpoint became `POST /api/v1/plus/checkout {plan}` → `{url}`: signed in and **same-origin**
  (it creates state at the provider, so another site mustn't be able to start one); the page
  navigates to the URL. Our user id goes in **both** `metadata.user_id` (what we link by) and
  `external_customer_id` (fallback, and reconciliation in Polar's dashboard). The buyer's IP from
  `x-forwarded-for` is passed as `customer_ip_address`. An API failure or timeout (8 s) becomes a
  503 with a message saying nothing was charged; the button shows it in the player's language.
- **Status mapping** (Polar → ours): `active` → `active`; `trialing` → `on_trial`; either with
  `cancel_at_period_end` (or an `ends_at`) → `cancelled` until `ends_at` (else the period end);
  `canceled` (revoked) → `expired` (or `cancelled` until `ends_at` if it names a future end without
  `ended_at`); `past_due` → `past_due` (our 7-day grace); `unpaid` → `unpaid`; `paused` → `paused`;
  `incomplete_expired` → `expired`; `incomplete` (never paid) and unknown statuses aren't stored
  (recorded as `other`). `renewsAt` is `current_period_end` while it renews.
- **Ordering and idempotency.** `providerUpdatedAt` is `modified_at` (else `created_at`); the
  event id is `polar:<webhook-id>` (stable across Polar's retries; the body hash as a fallback),
  so `parse` now receives the headers too.
- **Signature.** Timestamps more than 5 minutes from now, either way, are refused; any one valid
  `v1` signature among several is accepted; constant-time compares on decoded bytes.
- **Plans.** By `product_id` against `POLAR_PRODUCT_ID_*`, else `product.metadata.plan`.
- **Test mode.** `POLAR_SERVER=sandbox` deployments are test mode; a verified event comes from the
  server whose secret signed it, so it takes that server's mode.
- **Portal.** `GET /api/v1/me/plus/portal` makes a customer session for the latest subscription's
  `customer_id` (new optional port method `customerPortalUrl`); on failure it falls back to
  `https://polar.sh/dota-den/portal`.
- **Refunds.** `order.refunded` raises the owner alert, as before; refunds don't end Plus by
  themselves (the owner cancels in the dashboard if needed).
- **Events subscribed** (`POLAR_WEBHOOK_EVENTS`): `subscription.created`, `.updated`, `.active`,
  `.canceled`, `.uncanceled`, `.revoked`, `.past_due`, `.paused`, `.resumed` and `order.refunded`.
- **Provisioning.** `npm run plus:polar-provision` (dry run unless `-- --apply`) finds the products
  by `metadata.plan` or name and the endpoint by URL, creates what's missing (₱149/month and
  ₱1,490/year as fixed PHP prices, `metadata.plan`), adds missing events to an existing endpoint,
  and prints only ids. A new endpoint's secret goes to `POLAR_WEBHOOK_SECRET_FILE` (mode 600) or
  is read in the dashboard.
- **Privacy and legal.** We send Polar our user id and the buyer's IP (the privacy policy says so
  when Polar is configured). With `BILLING_PROVIDER=polar`, `/plus`, `/terms`, `/refunds` and
  `/privacy` name Polar as the merchant of record, and the refund policy says Polar pays refunds
  out, we decide on requests, and Polar may refund on its own within 60 days. Otherwise they keep
  saying "our payment provider".

### To confirm with the live account

The behaviour above is from the docs and the schema; these need a sandbox (or the first live)
purchase: that `metadata` and `customer.external_id` arrive on `subscription.*` events as
documented; that the account's webhook secret is the Standard Webhooks kind; that a buyer whose
email already belongs to a Polar customer can still check out with a new `external_customer_id`;
the checkout URL's host; and where replies to Polar's receipt emails go (the contact fallback on
the legal pages tells buyers to reply to their receipt).
