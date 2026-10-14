# ADR 0011: Opt-in weekly email digest

- Status: Accepted
- Date: 2026-10-09

## Context

Push notifications (ADR 0010) only reach players who allowed them on a device. Email reaches
everyone else, but Steam gives us no address, and sending email needs a provider account and a
verified sending domain. Sending to an address nobody confirmed would hurt strangers' inboxes
and the domain's reputation.

## Decision

A new `email` feature (ADR 0009 layout) sends one opt-in email a week.

- **Provider.** Resend's REST API (`POST /emails`, Bearer key) through `fetch`, behind the
  `EmailSender` port; no SDK. `RESEND_API_KEY` and `EMAIL_FROM` (both or neither),
  `RESEND_API_BASE_URL` for tests. Unset: the feature is off, the Account page says so and
  nothing is sent.
- **Double opt-in.** The player types an address on the Account page. We email a link with a
  signed, single-use token that expires in 24 hours; only its SHA-256 hash is stored. The link
  opens a page with a Confirm button (mail scanners open links, so opening alone does nothing).
  Only confirmed addresses get the digest. A new address goes back to pending. Confirmation
  emails are limited to one a minute and five a day per player, plus a per-route rate limit.
- **Unsubscribe.** Every digest has an unsubscribe link (works signed-out) and `List-Unsubscribe`
  plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058); the one-click
  endpoint skips the same-origin check because mail providers POST from their own servers. The
  token is `user + nonce`, HMAC-signed; the nonce is new for each confirmation, so an old link
  can't end a newer subscription. "Stop and delete my address" on the Account page forgets the
  address entirely.
- **Signing key.** `EMAIL_TOKEN_SECRET`, else a key derived from `RESEND_API_KEY` (so the two
  provider variables are enough to start). Setting the secret keeps old links valid when the
  Resend key is rotated.
- **Content.** In the player's saved language: last week's ranked record, the MMR change only
  when it's exact (never the estimate), most played and best hero, and at most one note the data
  supports (an achievement tier first reached that week, else the tilt check's observation when
  the week had a losing streak and their history shows a clear drop after streaks). Skipped when
  they played no ranked games. Plain HTML with inline styles and a text alternative from a small
  template function that escapes all text.
- **When.** Like notifications: after the daily match sync, with the time left, on Mondays in the
  player's time zone (Manila when unset). The week is the MMR journal's last full week, the
  same "last week" the dashboard recap and the weekly push use.
- **At most once.** `email_log` holds one document per player, kind and week; inserting it is the
  claim. A failed send releases it for the next run. Consent is checked again just before
  sending. Log entries expire after 90 days.
- **Privacy.** The address is personal data: it's in "Download your data" (without the token
  hash and nonce), deleted with the account, and never logged in full (logs get a masked copy;
  the logger also redacts any field named like `email`).

## Consequences

- Emails go out around 14:30 Manila time on Mondays, a day late for players west of UTC.
- "Send a test email" on the Account page shows the email (and its unsubscribe link) without
  waiting for a Monday.
- Bounces and complaints are handled since #24, see below.

## Addendum: bounces and spam complaints (2026-10-14, #24)

- **Webhook.** `POST /api/v1/email/webhook` takes Resend's delivery events. Resend signs them
  with Svix (`svix-id`, `svix-timestamp`, `svix-signature`: HMAC-SHA256 over
  `id.timestamp.rawBody` with the base64 key after `whsec_`). We verify that ourselves with
  `node:crypto` (constant-time compare, any matching `v1` signature, timestamps more than five
  minutes off refused), no SDK. The raw body is read before parsing. No session and no
  same-origin check (Resend's servers call it); rate-limited per IP. `RESEND_WEBHOOK_SECRET`
  unset: the endpoint answers 404 and nothing changes.
- **Once.** The `svix-id` is claimed in `email_webhook_events` (kept 7 days, no addresses
  stored), so Resend's retries aren't handled twice. A failed handling releases it and answers
  500, so Resend retries.
- **What stops.** `email.bounced` with a permanent bounce (`bounce.type` "Permanent", or no
  type) and `email.complained` set every pending, confirmed or unsubscribed subscription to
  that (normalised) address to `bounced` or `complained`, clearing the confirmation token and
  the unsubscribe nonce. Temporary bounces and other events are acknowledged and ignored. The
  digest, test emails and confirmation already require `confirmed` / `pending`, so nothing
  more is sent.
- **Starting again.** The Account page explains what happened and offers "Enter an address
  again"; typing an address (even the same one) restarts the double opt-in.
- **Privacy.** Logs get the masked address and the reason only.
