@AGENTS.md

# Project notes

- Spec: `docs/spec.pdf`. Decisions: `docs/adr/`. Read the ADRs before changing
  auth, persistence or module boundaries.
- Work in milestones (spec §13). Don't start M2 until the M1 acceptance
  criteria pass. At each milestone, run `npm run check`, `npm run build` and
  `npm run test:e2e`.
- Never fabricate MMR, party membership or win probabilities. Missing
  party_size means `unknown`, never solo.
- SteamID64 is always a string. Convert with BigInt
  (`src/modules/identity/domain/steam-id.ts`).
- Feature anatomy (controller, service, repository, model, DTOs, schemas) is in
  `docs/adr/0009-feature-module-anatomy.md` and enforced by
  `tests/unit/architecture.test.ts`. Wiring lives in
  `src/modules/<feature>/<feature>.container.ts`; the public API in `index.ts`.
- Next 16: `cookies()`, `headers()` and `params` are async, and
  `src/proxy.ts` replaces middleware.
- Integration and E2E tests need MongoDB at `MONGODB_TEST_URI` (default
  `mongodb://127.0.0.1:27017`).
