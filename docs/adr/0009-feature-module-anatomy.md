# ADR 0009: Feature module anatomy (controller, service, repository, model)

- Status: Accepted
- Date: 2026-10-06
- Supersedes: the folder layout and import rules in ADR 0004 (the modular-monolith idea stays)

## Context

ADR 0004 split each module into `domain/`, `application/`, `infrastructure/` and `ui/`, wired
in `composition.ts`. In practice only a few modules followed it fully:

- Routes held their own zod schemas and, in places, business logic.
- `composition.ts` files grew whole use cases.
- Helpers such as `mapLimit` were copied between modules.
- Routes looked up the current user in three different ways.
- Response bodies had no common shape.

We want the structure of a large Express codebase (router → controller → service →
repository → model, with DTOs and schemas), so every feature reads the same way.

## Decision

### Layout

```
src/common/                 cross-cutting, no feature knowledge
  config/env.ts             validated environment
  db/mongo.ts               getDb()
  cache/redis.ts
  errors/app-error.ts       AppError + NotFoundError, ConflictError, ValidationError, …
  http/                     controller kit (handler), ServiceResponse, api-client, rate limits
  logging/logger.ts
  providers/                ProviderGateway (cache, budget, circuit breaker)
  privacy/user-data.ts      DataOwner, forExport
  utils/                    small shared helpers (mapLimit, …)
  result.ts                 Result<T, E> for pure code

src/modules/<feature>/
  index.ts                  public API: what pages, routes and other modules may import
  <feature>.container.ts    wiring: builds repository → service → controller (server-only)
  <feature>.controller.ts   HTTP: guard, rate limit, validation, envelope; no business logic
  <feature>.service.ts      use cases; constructor-injected dependencies; no HTTP, no Mongo
  <feature>.repository.ts   persistence (MongoDB driver); no business rules
  <feature>.model.ts        entity types, collection name and document shape
  <feature>.ports.ts        interfaces the service depends on (repository, other features)
  schemas/*.schema.ts       zod schemas for request bodies, queries and params
  dtos/requests/*.dto.ts    request types (z.infer of a schema)
  dtos/responses/*.dto.ts   response types + mappers from models
  domain/                   pure rules and calculations (no I/O; unit-tested)
  infrastructure/           upstream adapters (OpenDota, Groq, …) implementing ports
  ui/                       React components for this feature

src/app/**/route.ts         one line per method: export const PUT = goalsController.update;
src/app/**/page.tsx         renders; reads data through the feature's index (services)
```

A feature with several use-case areas may use a `services/` folder (`services/<area>.service.ts`),
as long as each file keeps the naming. File names are kebab-case with a role suffix
(`goals.service.ts`, `update-goals.dto.ts`).

### Responses

Every API route returns the envelope from `ServiceResponse`:

```json
{ "success": true, "message": "Goals saved", "data": { … }, "statusCode": 200 }
{ "success": false, "message": "Invalid goals", "data": null, "statusCode": 400,
  "code": "bad_request", "details": { … } }
```

Browser code calls the API through `apiRequest()` (`src/common/http/api-client.ts`). It returns
`data` on success and throws `ApiClientError` (with the server's message) otherwise.

### Errors

Services return plain data. For failures the caller should see, they throw an `AppError`
subclass. The controller kit turns those into failure envelopes. Any other error is a bug: it
is rethrown, so Next returns a 500 and the error tracker (`instrumentation.ts`) records it.
Pure domain code may keep returning `Result` values.

### Controllers

Every endpoint is built with `handler()` from `src/common/http/controller.ts`, which runs the
same steps in a fixed order:

1. same-origin check for mutations;
2. guard (`requireUser` / `requireAdmin` from identity);
3. rate limit (named policy, keyed by user or IP);
4. zod validation of params, query and body;
5. the action;
6. wrapping the result in the envelope.

### Dependency injection

No container library. Each feature's `<feature>.container.ts` constructs its objects once per
server instance, with constructor injection (`new GoalsService({ repository, sessions })`).
Repositories take `getDb` (a function), so containers are synchronous.
When building an object reads the environment or opens a client (OpenDota, Groq, Twitch),
the container wraps it in `lazy()` (`src/common/utils/lazy.ts`). Importing a container then has
no side effects, but call sites still read naturally (`liveService.overview()`).
A service that needs data fetched per request to be built (the drafts AI captain holds the
current hero catalog) is exposed as an async factory (`getAiOpponent()`), so a failed lookup
never sticks for the life of the server. Other features are
reached through their `index.ts` and passed in as port implementations.

### Import rules (enforced by `tests/unit/architecture.test.ts`)

| File                                            | May import                                                                                                            | Must not import                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `domain/*`                                      | own `domain/`, `@/common/result`                                                                                      | next, react, mongodb, other `@/common/*`, anything else in the module             |
| `*.model.ts`, `*.ports.ts`, `dtos/`, `schemas/` | own model/domain/dtos/schemas, zod                                                                                    | next, mongodb (types-only in models), services, repositories                      |
| `*.service.ts`                                  | own domain, model, ports, dtos, `@/common/errors`, `@/common/utils`, `@/common/logging`                               | next, react, mongodb, `@/common/db`, repositories, controllers, ui                |
| `*.repository.ts`                               | own model, mongodb, `@/common/db` types, `@/common/privacy`                                                           | next, services, controllers, ui                                                   |
| `*.controller.ts`                               | own service (type), schemas, dtos, `@/common/http`, `@/common/errors`                                                 | mongodb, `@/common/db`, repositories                                              |
| `ui/*`                                          | own domain/dtos/model types, other features' `ui/` and `domain/`, `@/components`, `@/common/http/api-client`          | mongodb, `@/common/db`, `@/common/config/env`, containers, repositories, services |
| other features                                  | `@/modules/<other>` (index), `@/modules/<other>/domain/*`, `@/modules/<other>/ui/*`                                   | anything else inside another feature                                              |
| `src/app/**`                                    | `@/modules/<feature>` (index), `ui/`, `domain/`, `dtos/`, `schemas/` (to parse URLs), `@/components`, `@/common/http` | repositories, `@/common/db`, mongodb                                              |

### Migration

Modules move to this anatomy one at a time, each change released on its own. The architecture
test applies the new rules to any module that has a `<feature>.container.ts`. Modules not yet
migrated keep the ADR 0004 rules until they move. `goals` is the reference implementation.

## Consequences

- Every feature reads the same way, and new code has a single obvious place to go.
- Routes are one line each. Request handling (auth, CSRF, rate limits, validation, errors) is
  written once and tested once.
- One response shape lets the client share error handling and makes the API easy to document.
- There are more files per feature. A feature with no HTTP surface (e.g. `achievements`) has no
  controller, and a feature with no storage has no repository.
