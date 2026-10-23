# ADR 0013: Dota Den Plus subscriptions

- Status: Accepted (Phase 0: built, off until configured)
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
- Display prices **$3.99/month** and **$29.99/year** (US dollars). The provider charges, may show
  local currency and adds tax; the page says so.

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
