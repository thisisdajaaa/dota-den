# ADR 0010: Opt-in Web Push notifications

- Status: Accepted
- Date: 2026-10-09

## Context

Of the first 12 players, 10 visited once and never came back. The app already has what a
returning player would want (session recaps, a weekly recap, patch digests), but nothing
brings anyone back to see it. Email (#10) and Discord (#13) need third-party accounts.
The app is already an installable PWA with a service worker.

## Decision

Opt-in Web Push, in a new `notifications` feature (ADR 0009 layout).

- **Keys.** VAPID keys in `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (`npx web-push
  generate-vapid-keys`), optional `VAPID_SUBJECT`. Unset: the feature is off, the account
  page says so and nothing is sent. No third-party account is needed.
- **Opt-in per device.** Account page → Notifications → "Turn on for this device" asks the
  browser for permission and stores the subscription (`push_subscriptions`, keyed by
  endpoint). The overview shows a dismissible invitation once a player has a session and no
  device yet. iPhone and iPad need the app on the Home Screen first (Safari's rule).
- **What is sent.** Three kinds, each can be turned off (`notification_settings`, per player):
  - Session recap: the player's latest session once it has ended (break longer than their
    session gap) and ended within the last 36 hours.
  - Weekly recap: on Mondays in the player's time zone (Manila when unset), if they played
    ranked last week.
  - Patch changes your heroes: a patch from the last 7 days that changed heroes in their pool.
- **When.** After the daily match sync cron (`/api/cron/matches`, 06:30 UTC), with the time
  left in that run. Vercel Hobby crons run once a day, so notifications are daily, not live.
- **At most once.** `notification_log` holds one document per player, kind and key (session
  id, week, patch version); inserting it is the claim, so retries and overlapping runs never
  send twice. If no device received it, the claim is released for the next run. Log entries
  expire after 90 days.
- **Text** is built on the server in the player's saved language (en, fil, ceb).
- **Safety.** The server POSTs to a subscription's endpoint, so only the browsers' push
  services are accepted (FCM, Mozilla, Apple, Windows); anything else is a 400. Devices the
  push service reports as gone (404/410) are deleted.
- **Privacy.** Devices (without their keys), settings and the sent log are in "Download your
  data" and removed with the account.

## Consequences

- Notifications arrive once a day, around 14:30 Manila time. A durable queue (#15) or a
  more frequent cron would allow "right after the session".
- The account page is now "Account" (it was "Your data"): notification settings live there.
- If the private key leaks, anyone could send notifications to subscribed devices. Rotating
  it means generating new keys and every player turning notifications on again.
