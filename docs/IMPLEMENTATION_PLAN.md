# EcoCycle — Implementation Plan

**Project:** EcoCycle — E-Waste Lifecycle Management Platform
**Stack:** React + TypeScript + Vite + Tailwind (FE) · Node.js + Express + TypeScript (BE) · PostgreSQL + Prisma (DB)

---

## 1. Scope decomposition

| # | Phase | Deliverable | Verification |
|---|-------|-------------|--------------|
| 0 | Recon | Pin mutually-compatible package versions, provision PostgreSQL 17 | `SELECT version()` |
| 1 | Data layer | Normalized Prisma schema (13 entities), enums, constraints, versioned migration | `prisma migrate deploy`, `prisma validate` |
| 2 | Backend core | Express app, config, error handling, JWT/bcrypt auth, Zod validation, rate limiting | type-check |
| 3 | Domain services | Status machines, transactions, ownership/role guards, assignment engine | unit + integration tests |
| 4 | API surface | 60+ REST endpoints across 11 modules | integration tests |
| 5 | Frontend | 25 pages, role-aware routing, Tailwind design system, Recharts analytics | production build |
| 6 | Quality | Jest unit + integration suites, full lifecycle E2E test | `npm test` real output |
| 7 | Docs & vcs | README, setup guide, ER diagram, SQL examples, Git history | file review + git log |

## 2. File structure

```
ecocycle/
├── README.md                         # Setup, run, test, troubleshoot
├── docs/
│   ├── IMPLEMENTATION_PLAN.md        # this file
│   ├── ARCHITECTURE.md               # layers, request flow, auth model
│   ├── ER_DIAGRAM.md                 # Mermaid ER + relationship rationale
│   ├── ASSIGNMENT_ALGORITHM.md       # scoring formula + edge cases
│   └── sql/demonstration_queries.sql # joins, aggregates, subqueries, CTEs, EXPLAIN
├── backend/
│   ├── package.json / package-lock.json / tsconfig.json / jest.config.js
│   ├── .env.example / .gitignore
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/               # versioned SQL (incl. CHECK constraints)
│   │   └── seed.ts                   # idempotent demo seed
│   ├── src/
│   │   ├── app.ts  index.ts  config/  lib/  middleware/  utils/
│   │   ├── services/                 # business logic (transactions, state machines)
│   │   ├── schemas/                  # Zod request contracts
│   │   └── routes/                   # thin HTTP handlers
│   └── tests/
│       ├── unit/                     # pure logic: scoring, transitions, crypto, geo
│       ├── integration/              # supertest + real PostgreSQL
│       └── helpers/
└── frontend/
    ├── package.json / package-lock.json / vite.config.ts / tsconfig.json
    ├── .env.example / .gitignore / index.html
    └── src/
        ├── main.tsx  App.tsx  index.css
        ├── api/            # typed fetch client (single source of truth for endpoints)
        ├── context/        # AuthProvider (JWT persistence, role gates)
        ├── components/     # ui/ primitives, layout, domain widgets
        └── pages/          # auth, user, agent, center, recycler, admin, analytics, errors
```

## 3. Data model (13 entities)

`users` · `agent_profiles` · `recycler_profiles` · `collection_centers` · `categories` ·
`pickup_requests` · `ewaste_items` · `status_history` · `inspections` ·
`processing_batches` · `batch_items` · `recovered_materials` · `assignment_logs`

Integrity strategy: FK delete rules per relationship, 15 CHECK constraints (weights > 0,
`num_nonnulls()` = 1 on `status_history`, role↔profile XOR, grade ranges), unique
constraints that make duplicate operations *impossible at the database level*
(`inspections.item_id`, `batch_items.item_id`, `(batch_id, material_type)`), and
composite/partial indexes justified by the query patterns.

## 4. Lifecycle state machines

- **PickupRequest:** `REQUESTED → ASSIGNED → ACCEPTED → COLLECTED → RECEIVED_AT_CENTER`
  with `FAILED` (reassignable) and `CANCELLED` branches.
- **EwasteItem:** `SUBMITTED → PICKUP_SCHEDULED → COLLECTED → RECEIVED_AT_CENTER →
  INSPECTED → IN_BATCH → PROCESSING → RECYCLED` plus `REJECTED` / `CANCELLED`.
- **ProcessingBatch:** `DRAFT → READY → RELEASED → IN_PROGRESS → COMPLETED`
  (release requires an assigned recycler + ≥1 item; completion requires ≥1 recovery record).

Every transition runs inside a `prisma.$transaction` that writes the domain row **and** an
append-only `status_history` row — no orphaned transitions are possible.

## 5. Assignment engine

Deterministic weighted scoring (documented in `docs/ASSIGNMENT_ALGORITHM.md`):
`score = Σ(normalized factor × env-configurable weight)` over distance, workload,
availability and capacity, with hard eligibility filters, deterministic tie-breaking,
graceful handling of missing coordinates, and full audit rows in `assignment_logs`.

## 6. Test strategy (~90 assertions)

| Suite | Coverage |
|-------|----------|
| unit/assignment | eligibility filters, scoring monotonicity, tie-break determinism, no-coords fallback, weight normalization |
| unit/statusMachine | every legal transition + rejection of illegal ones |
| unit/crypto+geo | bcrypt round-trip, JWT sign/verify/expiry, haversine correctness |
| integration/auth | register/login/me, role escalation blocked, rate limit, duplicate email |
| integration/lifecycle | full 9-step E2E workflow + timeline verification |
| integration/guards | cross-user ownership 403/404, duplicate collection/inspection/recovery, invalid transitions, batch release rules |
| integration/admin | user/center/category CRUD, analytics aggregates vs raw SQL |

## 7. Commit staging

`chore: scaffold` → `feat(db): schema+migration+seed` → `feat(api): auth` →
`feat(api): domain` → `feat(web): ui` → `test: suites` → `docs: readme/er/sql`
