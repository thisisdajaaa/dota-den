# ADR 0004 — Modular monolith boundaries

- Status: Accepted
- Date: 2026-09-29

## Decision

```
src/app/                         routes and composition only
src/modules/<context>/domain/          entities, value objects, pure policies
src/modules/<context>/application/     use cases, ports (repository/provider interfaces), contracts
src/modules/<context>/infrastructure/  Mongo repositories, upstream adapters
src/modules/<context>/ui/              screens and domain components
src/modules/<context>/index.ts         (optional) public application API for other contexts
src/components/ui/               shadcn components
src/lib/                         env, logging, db, http helpers (infrastructure-level)
```

Import rules (enforced by `tests/unit/architecture.test.ts`):

| Layer          | May import                                                        | Must not import                                                    |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| domain         | own domain, `shared/domain`                                       | `next`, `react`, `mongodb`, `@/lib/*`, application, infrastructure |
| application    | own domain, own application, `shared`, other contexts' `index.ts` | `next`, `mongodb`, infrastructure                                  |
| infrastructure | anything server-side                                              | `ui`                                                               |
| ui             | own domain types, application contracts, `@/components`           | `mongodb`, infrastructure, `@/lib/db`, `@/lib/env`                 |

Composition (wiring repositories into use cases) happens in
`src/modules/<context>/composition.ts` (server-only). Route handlers call it.
Constructors take plain dependencies; there is no DI container.
