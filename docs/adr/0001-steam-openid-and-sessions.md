# ADR 0001 — Steam OpenID 2.0 sign-in and session storage

- Status: Accepted
- Date: 2026-09-29

## Context

The spec (§5) requires Steam sign-in through Steam OpenID 2.0, with server-side
verification of `return_to`, realm, nonce/replay and a positive provider check.
The claimed SteamID64 must be validated. Sign-out must revoke the local session,
and E2E tests need a test identity adapter so CI never uses real credentials.

Options considered:

1. **Auth.js / NextAuth with a community Steam provider.** Steam is not OAuth or
   OIDC, so the community providers wrap OpenID 2.0 in custom code. We found none
   that is maintained and audited, which the spec requires. Their session models
   also add surface we don't need.
2. **Passport (`passport-steam`).** Built for Express middleware. It fits the App
   Router Route Handlers poorly and is effectively unmaintained.
3. **A narrow server-side adapter (chosen).** Steam supports only the stateless
   `check_authentication` flow, which is small and well specified.

## Decision

- Implement `SteamOpenIdProvider` in `src/modules/identity/infrastructure/`
  behind an `IdentityProvider` port. It:
  - builds the `checkid_setup` redirect with `identifier_select`, our `realm`,
    and a `return_to` that carries a random `state` value;
  - on callback, requires `openid.mode=id_res`, the Steam `op_endpoint`, an exact
    `return_to` match against our origin and path, the required fields in
    `openid.signed`, and a `claimed_id` that equals `identity` and matches
    `https://steamcommunity.com/openid/id/<17 digits>`;
  - rejects nonces older than 5 minutes and records each nonce in Mongo with a
    unique index and a TTL, so a replayed response fails;
  - POSTs the signed fields back with `openid.mode=check_authentication` and
    accepts the response only if it contains `is_valid:true`.
- Login CSRF: `state` is stored in a short-lived HttpOnly cookie and must match
  the value in `return_to`.
- **Sessions are opaque and database-backed.** The browser holds a 256-bit random
  token in the `dd_session` cookie (HttpOnly, SameSite=Lax, Secure in
  production). Mongo stores only its SHA-256 hash, along with `expiresAt` (TTL
  index) and `rotatedAt`. Sign-out deletes the record, so revocation is real;
  stateless JWT or iron-session cookies can't be revoked. A session is rotated
  when older than 24h, and it expires after 30 days.
- Mutations check the `Origin` header against `APP_URL` (CSRF), in addition to
  SameSite=Lax.
- A `FakeIdentityProvider` is available only when `AUTH_TEST_MODE=true` and
  `NODE_ENV !== "production"`. The env parser refuses to start in production
  with that flag set.

## Consequences

- We own a small amount of security-sensitive code, so it gets unit tests for
  every rejection branch and an integration test for nonce replay.
- Each authenticated request makes one Mongo read to resolve the session. That's
  acceptable at prototype scale, and a short in-memory cache can be added later.
