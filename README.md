# ♻️ EcoCycle — E-Waste Lifecycle Management Platform

A complete, database-driven full-stack application that tracks electronic waste from the
moment a citizen registers a device to the moment a licensed recycler records the recovered
copper, aluminium or battery chemicals — with every step committed to PostgreSQL.

Built as a Database Systems course project *and* an SDE portfolio project: real schema, real
migrations, real transactions, real tests. There are no mock dashboards, no hard-coded
business records and no decorative buttons — every figure on screen comes from a query.

```
React 19 + TypeScript + Vite 6 + Tailwind 4   ←→   Node 20 + Express 5 + TypeScript   ←→   PostgreSQL 17
                     (browser)                              (REST API)                      (Prisma ORM 6)
```

---

## Table of contents

- [What the platform does](#what-the-platform-does)
- [Roles](#roles)
- [The lifecycle, step by step](#the-lifecycle-step-by-step)
- [Architecture](#architecture)
- [Entity-relationship model](#entity-relationship-model)
- [Repository layout](#repository-layout)
- [Quick start on Windows](#quick-start-on-windows)
- [Database setup, migrations and seed data](#database-setup-migrations-and-seed-data)
- [Running the application](#running-the-application)
- [Demo walkthrough](#demo-walkthrough)
- [Automated tests](#automated-tests)
- [Production builds](#production-builds)
- [API overview](#api-overview)
- [Security model](#security-model)
- [Database engineering highlights](#database-engineering-highlights)
- [Implemented features](#implemented-features)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Documentation map](#documentation-map)

---

## What the platform does

| Area | Capability |
|------|-----------|
| **Submission** | Citizens register one or many e-waste items and optionally book a pickup in the same request |
| **Assignment** | A deterministic rule-based engine picks the best collection agent using eligibility filters plus a weighted score (distance, workload, reliability, vehicle capacity) |
| **Collection** | Agents accept or decline, record the collection weight and hand items over at a collection centre |
| **Receipt** | Centre staff confirm receipt; items move into the inspection queue |
| **Inspection** | Condition, quality score → derived letter grade, measured weight, processing path, repairability, hazard flag and data-wipe tracking |
| **Batching** | Inspected items are grouped into processing batches that are marked ready, attached to a licensed recycler and released |
| **Recycling** | Recyclers start a batch and record recovered materials with quantity, purity and market value |
| **Traceability** | An append-only `status_history` table records every transition with actor, timestamp and note; each item, pickup and batch has its own timeline screen |
| **Analytics** | Role-scoped dashboards and an administrator analytics view built from SQL aggregates: monthly trends, material recovery, centre/agent/recycler performance, assignment statistics, cycle times |
| **Administration** | User, agent, centre, category and pickup management including privileged-account creation |

---

## Roles

Five roles, each with its own home screen and API scope. Public registration **always**
creates a `USER` — the other four are granted only by an administrator (or the seed script).

| Role | Code | Home | Responsibilities |
|------|------|------|------------------|
| Citizen | `USER` | `/dashboard` | Submit items, book pickups, track progress |
| Collection agent | `COLLECTION_AGENT` | `/agent` | Accept/decline assignments, record collections, deliver to a centre |
| Centre staff | `CENTER_STAFF` | `/center` | Receive pickups, inspect and classify items, build and release batches |
| Recycler | `RECYCLER` | `/recycler` | Process released batches, record recovered materials |
| Administrator | `ADMIN` | `/admin` | Manage users, centres, categories; monitor everything |

Role enforcement happens **on the server** for every request (`authenticate`, `requireRole`,
plus per-record ownership filters). The client-side route guards only decide what is rendered.

---

## The lifecycle, step by step

```
  CITIZEN            AGENT                     CENTRE STAFF                 RECYCLER
  ───────            ─────                     ────────────                 ────────
  submit items
      │
      ├─ pickup REQUESTED ──► assignment engine (rules + weights)
      │                            │
      │                       ASSIGNED ──► accept ──► ACCEPTED
      │                            │                    │
      │                            └──► decline/fail ◄──┘
      │                                     (back to the pool)
      │                                                  │
      │                                            COLLECTED
      │                                                  │
      │                                        ┌─────────┘
      │                                        ▼
      │                                 RECEIVED_AT_CENTER
      │                                        │
      │                                  inspect & classify
      │                                        │
      │                                    INSPECTED
      │                                        │
      │                            add to batch (IN_BATCH) ──► READY
      │                                        │                │
      │                                        │            RELEASED ──► IN_PROGRESS
      │                                        │                            │
      │                                        │                  record recovered materials
      │                                        │                            │
      └──────────── traced by status_history ──┴──────────►  COMPLETED (items RECYCLED)
```

Transition legality is defined once, in `backend/src/utils/statusMachine.ts`, and enforced by
the services; illegal moves return `409 INVALID_TRANSITION` with the list of allowed next
states. Database CHECK constraints back the same rules for critical combinations (see
[Database engineering highlights](#database-engineering-highlights)).

---

## Architecture

```
┌──────────────────────────────┐         ┌────────────────────────────────────────┐
│  frontend/  (React 19 SPA)   │         │  backend/  (Express 5 REST API)        │
│                              │         │                                        │
│  pages/*        screens      │  HTTP   │  routes/       7 modules, 12 mounts    │
│  api/           client +     │ ──────► │  middleware/   auth, roles, validation, │
│                 endpoints    │  JSON   │                rate limiting, errors   │
│  context/       auth, toasts │         │  schemas/      Zod request contracts   │
│  components/    ui, charts,  │         │  services/     13 services: business   │
│                 layout       │         │                rules + transactions    │
│  hooks/         data fetch   │         │  utils/        status machine, geo,    │
└──────────────────────────────┘         │                serialisation, ids      │
        │                                │  lib/          Prisma client, errors,  │
        │                                └───────┬────────────────────────────────┘
        │                                        │ Prisma Client 6
        ▼                                        ▼
   browser at :5173                              ┌─────────────────────┐
                                                 │  PostgreSQL 17      │
                                                 │  13 domain tables   │
                                                 │  45 CHECKs, 4       │
                                                 │  triggers, 62 idxs  │
                                                 └─────────────────────┘
```

**Request path:** route → `validate` (Zod) → `authenticate` (JWT) → role/ownership check →
service (business rules inside `prisma.$transaction`) → response envelope `{ data }`,
`{ data, meta }` for lists, `{ error: { code, message, details } }` for failures.

---

## Entity-relationship model

13 domain tables. `users` is the actor table for all five roles; three optional **profile** tables
extend it for agents and recyclers, and centre staff are attached to a centre.

```
users ─┬─1:1─ agent_profiles ──0:N── pickup_requests ──0:N── ewaste_items ──1:N─ inspections
       │                │                    │                    │
       │                └──0:1── collection_centers ◄────────────┘
       ├─1:1─ recycler_profiles ──0:N── processing_batches ──0:N── batch_items (item_id UNIQUE)
       │                                          │
       │                                          └──0:N── recovered_materials (batch_id + material_type UNIQUE)
       │
       └─1:N─ status_history  (polymorphic: exactly one of pickup_request_id / item_id / batch_id)
                               assignment_logs (pickup_request_id + agent_id + method + outcome + score)

categories ──1:N── ewaste_items
```

Mermaid version (renders on GitHub):

```mermaid
erDiagram
    USERS ||--o| AGENT_PROFILES : "agent profile"
    USERS ||--o| RECYCLER_PROFILES : "recycler profile"
    USERS ||--o{ EWASTE_ITEMS : submits
    USERS ||--o{ PICKUP_REQUESTS : requests
    USERS ||--o{ PROCESSING_BATCHES : "creates / processes"
    USERS ||--o{ STATUS_HISTORY : acts
    COLLECTION_CENTERS ||--o{ AGENT_PROFILES : "home centre"
    COLLECTION_CENTERS ||--o{ EWASTE_ITEMS : holds
    COLLECTION_CENTERS ||--o{ PICKUP_REQUESTS : destination
    COLLECTION_CENTERS ||--o{ PROCESSING_BATCHES : owns
    COLLECTION_CENTERS ||--o{ INSPECTIONS : performs
    COLLECTION_CENTERS ||--o{ USERS : "staff"
    CATEGORIES ||--o{ EWASTE_ITEMS : classifies
    PICKUP_REQUESTS ||--o{ EWASTE_ITEMS : groups
    PICKUP_REQUESTS ||--o{ ASSIGNMENT_LOGS : "audit"
    EWASTE_ITEMS ||--o| INSPECTIONS : "one inspection"
    EWASTE_ITEMS ||--o| BATCH_ITEMS : "one batch"
    PROCESSING_BATCHES ||--o{ BATCH_ITEMS : contains
    PROCESSING_BATCHES ||--o{ RECOVERED_MATERIALS : yields
    EWASTE_ITEMS ||--o{ RECOVERED_MATERIALS : "optional attribution"
    PICKUP_REQUESTS ||--o{ STATUS_HISTORY : traces
    EWASTE_ITEMS ||--o{ STATUS_HISTORY : traces
    PROCESSING_BATCHES ||--o{ STATUS_HISTORY : traces
    AGENT_PROFILES ||--o{ ASSIGNMENT_LOGS : "assigned to"
```

Full column-by-column detail, constraint list and indexing rationale: **[docs/DATABASE.md](docs/DATABASE.md)**.

---

## Repository layout

```
ecocycle/
├─ backend/                         # Node + Express + TypeScript REST API
│  ├─ prisma/
│  │  ├─ schema.prisma              # 14 models, enums, relations, indexes
│  │  ├─ migrations/                # 3 versioned migrations (init, integrity, sequences)
│  │  └─ seed.ts                    # idempotent demo data (accounts, centres, a full cycle)
│  ├─ src/
│  │  ├─ config/env.ts              # Zod-validated configuration
│  │  ├─ lib/                       # Prisma client, error classes, logger
│  │  ├─ middleware/                # auth, validate, rateLimit, errorHandler, requestContext
│  │  ├─ schemas/                   # Zod contracts for every endpoint
│  │  ├─ services/                  # 13 services: the business rules
│  │  ├─ utils/                     # status machine, geo, id sequences, query filters, http
│  │  ├─ routes/                    # 7 route modules mounted on 12 paths under /api
│  │  ├─ app.ts                     # createApp() — helmet, cors, json, routers, errors
│  │  └─ index.ts                   # bootstrap; never migrates or seeds
│  ├─ tests/
│  │  ├─ unit/                      # status machine, assignment maths, security, inspection
│  │  └─ integration/               # lifecycle, auth, authorization, guards, admin, rate limit
│  ├─ .env.example                  # every setting, placeholders only
│  └─ package.json
├─ frontend/                        # React 19 + Vite 6 + Tailwind 4 SPA
│  ├─ tests/                       # Vitest regression suite (hermetic) + live smoke test
│  ├─ vitest.config.ts             # jsdom test environment, `@` alias
│  ├─ vitest.live.config.ts        # config for the on-demand live smoke run
│  ├─ tsconfig.test.json           # typecheck project for src + tests
│  ├─ src/
│  │  ├─ api/                       # typed client + one function per endpoint + shared types
│  │  ├─ components/                # ui primitives, charts, timeline, layout, route guards
│  │  ├─ context/                   # auth session + toasts
│  │  ├─ hooks/                     # useResource / useAction / useDebounced
│  │  ├─ lib/                       # formatting, domain vocabulary, navigation
│  │  └─ pages/                     # 29 screens grouped by role
│  ├─ .env.example
│  └─ package.json
├─ docs/
│  ├─ ASSIGNMENT_ALGORITHM.md       # full specification of the scoring engine
│  ├─ DATABASE.md                   # schema, constraints, indexes, transactions
│  ├─ IMPLEMENTATION_PLAN.md        # the phased plan used to build this repository
│  └─ sql/demonstration_queries.sql # joins, aggregation, subqueries, window functions,
│                                   # EXPLAIN/index rationale, transactions, triggers, views
├─ .gitignore
└─ README.md
```

---

## Quick start on Windows

> Verified on Windows 11 with PowerShell. Commands for `cmd.exe` are the same except where
> noted. Linux/macOS equivalents are in the comments.

### 0. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20 LTS or newer | `node -v` |
| npm | ships with Node | `npm -v` |
| PostgreSQL | 14 or newer (17 tested) | `psql --version` |
| Git | any recent | `git --version` |

Install PostgreSQL from the [official installer](https://www.postgresql.org/download/windows/)
and note the password you set for the `postgres` superuser.

### 1. Get the code

```powershell
git clone <your-repository-url> ecocycle
cd ecocycle
```

If you received this as a ZIP, extract it and open a terminal in the extracted folder.

### 2. Create the databases

```powershell
# Development database + a separate database for the automated tests
createdb -U postgres ecocycle_dev
createdb -U postgres ecocycle_test
```

Using `psql` instead:

```powershell
psql -U postgres -c "CREATE DATABASE ecocycle_dev;"
psql -U postgres -c "CREATE DATABASE ecocycle_test;"
```

Or use pgAdmin: right-click **Databases → Create → Database…** and repeat for both names.
If you prefer a dedicated role, create one and use it in the connection strings:

```sql
CREATE ROLE ecocycle LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE ecocycle_dev OWNER ecocycle;
CREATE DATABASE ecocycle_test OWNER ecocycle;
```

### 3. Backend

```powershell
cd backend
npm install

# Create your environment file from the template, then edit it
Copy-Item .env.example .env
notepad .env          # Linux/macOS: cp .env.example .env && nano .env
```

Set at least these values in `backend\.env`:

```ini
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/ecocycle_dev?schema=public"
TEST_DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/ecocycle_test?schema=public"
JWT_SECRET="paste-a-long-random-string-here"
```

Generate a strong secret (PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> If your password contains `@ : / ? # &`, percent-encode it
> (e.g. `p@ss` → `p%40ss`) or PostgreSQL/Prisma will misread the URL.

Apply the schema and load demo data:

```powershell
npx prisma generate
npx prisma migrate deploy      # applies the 3 versioned migrations
npm run db:seed                # idempotent: safe to run repeatedly
```

Start the API:

```powershell
npm run dev                    # http://localhost:4000
```

Check it: `curl http://localhost:4000/api/health` → `{"status":"ok", ...}`.

### 4. Frontend (second terminal)

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev                    # http://localhost:5173
```

Open <http://localhost:5173>. The dev server proxies `/api` to `http://localhost:4000`, so the
browser stays on a single origin and CORS never comes into play.

### 5. Sign in with a demo account

Password for every seeded account: **`Passw0rd123`**

| Role | Email |
|------|-------|
| Administrator | `admin@ecocycle.test` |
| Citizen | `user.priya@ecocycle.test` |
| Collection agent | `agent.chennai@ecocycle.test` |
| Centre staff | `staff.chennai@ecocycle.test` |
| Recycler | `recycler.greenmetals@ecocycle.test` |

The sign-in screen also lists these accounts in a collapsible panel.

---

## Database setup, migrations and seed data

```powershell
cd backend

npx prisma migrate deploy     # apply committed migrations (non-interactive; use in scripts/CI)
npx prisma migrate dev        # development: create/apply migrations from schema changes
npx prisma migrate status     # show which migrations have been applied
npx prisma studio             # browse the data in a GUI

npm run db:seed               # load demo data
npm run db:seed               # run it again — nothing is duplicated (idempotent)
```

**The seed script creates**: 2 collection centres (Chennai, Bengaluru), 7 e-waste categories,
11 accounts (1 admin, 3 agents, 2 staff, 2 recyclers, 3 citizens) and a realistic history —
a delivery chain taken all the way to `RECEIVED_AT_CENTER` and inspected, a batch in
`IN_PROGRESS` with five recorded recoveries (copper, aluminium, glass, battery chemicals,
plastic), one pickup request in status `REQUESTED`, and one batch in `READY` still waiting for a
recycler. Those last two are deliberate: they give you something to *do* on the assignment and
batch screens without creating data first.

**Startup never touches the schema.** `src/index.ts` only connects; migrate and seed are
explicit commands. The application never drops or resets a database.

**Demo accounts, in full** (all `@ecocycle.test`, password `Passw0rd123`):

```
admin                      user.priya      agent.chennai      staff.chennai      recycler.greenmetals
agent.guindy               user.vikram     agent.bengaluru    staff.bengaluru    recycler.ecodismantle
                           user.sneha
```

To start from a clean slate (development only — **this deletes data**):

```powershell
npx prisma migrate reset       # drops, re-migrates and re-seeds the development database
```

---

## Running the application

| What | Command | URL |
|------|---------|-----|
| Backend (watch mode) | `cd backend && npm run dev` | http://localhost:4000 |
| Backend (compiled) | `npm run build && npm start` | http://localhost:4000 |
| Frontend (dev server) | `cd frontend && npm run dev` | http://localhost:5173 |
| Frontend (production preview) | `npm run build && npm run preview` | http://localhost:4173 |

Ports and origins are configurable: `PORT` and `CORS_ORIGINS` in `backend/.env`, and the
dev-server proxy target with `VITE_PROXY_TARGET` in `frontend/.env`.

---

## Demo walkthrough

A five-minute tour that exercises the whole platform. Sign in as the listed account each time
(sign out from the sidebar footer).

1. **Administrator** (`admin@ecocycle.test`) — `/admin`
   Read the operations dashboard: totals, the *needs attention* panel (unassigned pickups,
   batches waiting for a recycler), assignment-engine statistics and the platform activity feed.
   Open **Analytics** for monthly trends, material recovery, centre/agent/recycler performance
   and cycle times. Open **Users**, **Agents**, **Collection centres**, **Categories** to see
   CRUD with real validation (try creating a centre with only a latitude — the API refuses).
2. **Citizen** (`user.priya@ecocycle.test`) — `/dashboard`
   Submit e-waste (`Submit e-waste`): add a laptop and a phone, keep *Book a pickup* checked,
   pick a date tomorrow and submit. You land on the pickup page in status `REQUESTED`.
3. **Administrator** — open the pickup and hit **Assign agent** → method `AUTO`.
   The preview table lists every candidate with its distance, the four score components, the
   total and the exclusion reasons; run it and read the audit trail that appears below.
4. **Agent** (`agent.chennai@ecocycle.test`) — `/agent`
   The request is in your queue. **Accept**, then **Record collection** with a weight.
5. **Centre staff** (`staff.chennai@ecocycle.test`) — `/center`
   **Incoming pickups** → *Receive*. Then **Inspect & classify** → choose the item, enter the
   measured weight, move the quality slider and watch the grade update, pick a processing path,
   flag repairability and save. The item becomes `INSPECTED`.
6. **Centre staff** — **Processing batches** → *New batch*: select the inspected item, name the
   batch, create it. On the batch page: **Mark ready → Attach recycler → Release**.
7. **Recycler** (`recycler.greenmetals@ecocycle.test`) — `/recycler`
   Open the released batch: **Start processing**, then **Record recovery** (e.g. `COPPER`,
   1.2 kg, 95 % purity, ₹740/kg). Add a second material, then **Complete batch** — the API
   refuses to complete a batch with no recovery recorded.
8. **Anyone** — open the item (`/items/:id`) and the batch (`/batches/:id`) to read the complete
   timestamped lifecycle built from `status_history`, and **Activity** for the scoped feed.

Try the deliberate failures while you are there: inspecting an item twice, releasing a batch
without a recycler, completing a batch with no recovery, or opening another user's item — each
returns the API's own explanation, and the UI shows it verbatim.

---

## Automated tests

### Backend — 11 suites, 228 tests

```powershell
cd backend
npm test                 # everything
npm run test:unit        # 4 suites (status machine, assignment maths, security helpers, inspection)
npm run test:integration # 6 suites (lifecycle, auth, authorization, guards, admin, rate limiting)
npm run test:coverage    # with a coverage report
```

Verified on this repository:

```
Test Suites: 11 passed, 11 total
Tests:       228 passed, 228 total
```

| Suite | Tests | Covers |
|-------|------:|--------|
| `unit/statusMachine.test.ts` | 15 | all three state machines: legal transitions, illegal transitions, `assertTransition`, `allowedTransitions` |
| `unit/assignment.test.ts` | 28 | eligibility filters, each score component, missing coordinates and distance fallbacks, determinism and tie-breaking |
| `unit/security.test.ts` | 25 | password hashing and policy, JWT signing/verification and tampering, bearer extraction, geospatial helpers, response serialisation |
| `unit/inspection.test.ts` | 17 | quality grading bands, processing-path suggestions, business-identifier generation, pagination and query helpers |
| `integration/lifecycle.test.ts` | 17 | the full path from submission to completed recycling, asserting persisted rows after every step |
| `integration/auth.test.ts` | 32 | registration (including role injection and case-insensitive emails), login, suspension, token handling, profile self-service, and the login → authenticated-call contract |
| `unit/roles.test.ts` | 2 | the five role strings match the PostgreSQL enum and the client's routing vocabulary |
| `integration/authorization.test.ts` | 37 | the unauthenticated wall, record-level ownership, role gates, per-role data scoping, input hardening |
| `integration/guards.test.ts` | 25 | duplicate prevention, illegal transitions, assignment edge cases, cancellation semantics, agent failure paths |
| `integration/admin.test.ts` | 29 | privileged account creation, user/centre/category management, analytics that agree with raw SQL, profile summaries |
| `integration/rateLimit.test.ts` | 2 | failed-login throttling returns `429` with the documented envelope |

The integration suites run against a **separate database** (`TEST_DATABASE_URL`), which
`tests/helpers/globalSetup.ts` migrates automatically; each test file truncates and re-seeds
its own fixtures. Your development data is never touched, and the helper refuses to run if
`TEST_DATABASE_URL` is missing or identical to `DATABASE_URL`.

### Frontend — 28 hermetic tests + 11 live smoke tests

```powershell
cd frontend
npm test          # Vitest + jsdom: session storage, login, guards, refresh, expired tokens
npm run test:live # against a running stack (needs backend on :4000 and `npm run dev` here)
npm run typecheck # app, node and test TypeScript projects
```

| File | Tests | Covers |
|------|------:|--------|
| `tests/auth.client.test.ts` | 6 | the token is attached to every request, including when `window.localStorage` throws (`SecurityError`) as it does in a sandboxed iframe; the header is omitted only when there is genuinely no session |
| `tests/auth.flow.test.tsx` | 7 | sign-in → protected request carries the token; a blocked-storage sign-in never lands on "Missing bearer token"; a reload with a persisted token restores the session through `/auth/me`; an expired token returns the visitor to `/login`; the guard stops anonymous visitors without calling the API |
| `tests/auth.redirect.test.tsx` | 3 | the screen a user lands on after signing in: a role is never sent to a route its guard refuses (the administrator-after-a-staff-session case), a permitted destination is still honoured, and `/login`/`/register` are never redirect targets |
| `tests/auth.session.test.tsx` | 5 | a late 401 belonging to an **older token** cannot end the session that replaced it; a genuine 403 keeps the token, the page and the current session (and shows the API's reason); a protected page renders nothing and issues no data request until the session has been restored |
| `tests/roles.test.ts` | 7 | the five role strings match the backend enum, every role can open its own home screen, other roles' screens are refused, and parameterised routes resolve |
| `tests/live/auth.live.ts` | 11 | against the **real** API through the dev proxy: all five seeded accounts sign in and reach their own dashboard with the bearer token; the proxy forwards `Authorization` (raw `fetch`, no client); a persisted token restores a session; a blocked-storage login works; and a genuine 403 (`FORBIDDEN`) is distinguishable from a lost session (`UNAUTHENTICATED`/`INVALID_CREDENTIALS`) |

The live suite is excluded from `npm test` so the default run stays hermetic and CI-safe; it
is meant to be run while the two dev servers are up, and it can be pointed at another host with
`ECOCYCLE_API_URL`.

Both layers exist for a reason: the hermetic tests pin the *decisions* (which screen a role is
sent to, how a 401/403 is classified, when a session ends) with a stubbed API, while the live
suite proves the same behaviour against the real backend and the reverse proxy.

---

## Production builds

```powershell
# Backend → dist/ (JavaScript + generated Prisma client)
cd backend
npm run build
npm start                      # NODE_ENV=production node dist/index.js

# Frontend → dist/ (static assets, vendor chunks split)
cd ..\frontend
npm run build
npm run preview                # serve the built bundle locally to check it
```

Deploying the two halves separately:

1. Build the frontend with an explicit API URL:
   `$env:VITE_API_URL="https://api.example.com"; npm run build`
   (PowerShell syntax; on Linux/macOS: `VITE_API_URL=https://api.example.com npm run build`).
   Left empty, the client calls a relative `/api`, which is what you want when a reverse proxy
   serves the SPA and the API from the same origin.
2. Add the deployed frontend origin to `CORS_ORIGINS` in the backend environment.
3. Run `npx prisma migrate deploy` against the production database before starting the API.

---

## API overview

All endpoints live under `/api`. Successful responses are `{ "data": … }`, lists add
`"meta": { page, limit, total, totalPages, hasNextPage, hasPreviousPage }`, and errors are
`{ "error": { "code", "message", "details"? } }` with a matching HTTP status.

| Group | Endpoints | Who |
|-------|-----------|-----|
| `/api/auth` | `POST /register`, `POST /login`, `GET /me`, `PATCH /me`, `POST /change-password` | public / any signed-in user |
| `/api/users` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `POST /:id/suspend`, `POST /:id/activate`, `POST /:id/reset-password`, `DELETE /:id` | ADMIN |
| | `GET /agents`, `PATCH /agents/:id`, `GET /recyclers`, `PATCH /recyclers/:id` | ADMIN, CENTER_STAFF |
| `/api/centers` | `GET /`, `POST /`, `GET /:id`, `GET /:id/stats`, `PATCH /:id`, `DELETE /:id` | read: any; write: ADMIN |
| `/api/categories` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` | read: any; write: ADMIN |
| `/api/items` | `GET /`, `GET /summary`, `GET /pending-inspection`, `POST /`, `GET /:id`, `GET /:id/timeline`, `PATCH /:id`, `POST /:id/cancel`, `POST /:id/inspect`, `DELETE /:id` | scoped per role |
| `/api/pickups` | `GET /`, `POST /`, `GET /:id`, `GET /:id/timeline`, `GET /:id/assignment-logs`, `GET /:id/assignment-preview`, `POST /:id/assign`, `POST /:id/accept`, `POST /:id/decline`, `POST /:id/collect`, `POST /:id/fail`, `POST /:id/receive`, `POST /:id/cancel` | scoped per role |
| `/api/batches` | `GET /`, `GET /batchable-items`, `POST /`, `GET /:id`, `GET /:id/timeline`, `PATCH /:id`, `POST /:id/items`, `DELETE /:id/items/:itemId`, `POST /:id/ready`, `POST /:id/recycler`, `POST /:id/release`, `POST /:id/start`, `POST /:id/complete`, `POST /:id/recoveries`, `GET /:id/recoveries`, `DELETE /:id` | CENTER_STAFF / RECYCLER / ADMIN |
| `/api/recoveries` | `GET /`, `GET /by-material`, `PATCH /:id`, `DELETE /:id` | RECYCLER, CENTER_STAFF, ADMIN |
| `/api/inspections` | `GET /`, `GET /summary`, `POST /bulk`, `GET /:id`, `PATCH /:id` | CENTER_STAFF, ADMIN |
| `/api/analytics` | `GET /overview`, `/summary`, `/monthly`, `/materials`, `/categories`, `/centers`, `/agents`, `/recyclers`, `/assignments`, `/cycle-times`, `/recent-activity` | role-scoped (some ADMIN only) |
| `/api/dashboard` | `GET /` — one role-shaped payload per role | any signed-in user |
| `/api/activity` | `GET /` — scoped lifecycle event feed | any signed-in user |

`POST /api/pickups/:id/assign` accepts `{ method: "AUTO" | "MANUAL" | "REASSIGNMENT", agentId?, force? }`.
`GET /api/pickups/:id/assignment-preview` runs the engine as a **dry run** and returns the full
candidate table — useful for demonstrating the algorithm without changing data.

---

## Security model

* **Passwords** — hashed with `bcryptjs` (pure-JavaScript bcrypt, see
  [Known limitations](#known-limitations) for why not the native `bcrypt`), cost factor
  configurable via `BCRYPT_SALT_ROUNDS`, plus a policy check (length, letter, digit).
  Hashes are never selected into a response, and a serialiser strips them as defence in depth.
* **Sessions** — stateless JWT (`HS256`) with an expiry (`JWT_EXPIRES_IN`, default 8 h). The
  secret comes from the environment; production refuses to start with a short one. The token is
  verified on every request and the user is re-read from the database, so suspension takes
  effect immediately.
* **Token storage in the browser** — the token is held in memory for the life of the page and
  mirrored to `localStorage` when the browser permits it, so a reload restores the session.
  Memory is the source of truth because sandboxed iframes (the `sandbox` attribute without
  `allow-same-origin`), Safari private mode and some embedded webviews throw on any Web Storage
  access; the client keeps working there and simply cannot survive a reload, which the login
  screen states. A `401` on any request other than the credential endpoints drops the session
  and returns the visitor to `/login` with an explanation. Two rules keep that from
  mis-firing: a rejection is only acted on when it belongs to the token that is still current
  (a late response from a previous session cannot end a newer one), and **403 is never treated
  as an expiry** — it means "authenticated, but not allowed", so the token and the page stay
  and the API's own reason is displayed.
* **Authorization** — `requireRole(...)` per route plus per-record ownership filters inside the
  queries themselves, so a citizen cannot read another citizen's item even by guessing its id
  (such lookups return `404`, not `403`, to avoid leaking existence).
* **Input validation** — a Zod schema for every body, query and route param; unknown keys are
  stripped. Notably, `POST /api/auth/register` has **no role field at all**, so a client cannot
  inject `"role": "ADMIN"`.
* **Rate limiting** — `express-rate-limit` on the credential endpoints (failed attempts only)
  and a general API limiter; both are configurable and can be disabled for load testing.
* **HTTP hardening** — `helmet`, an explicit CORS allow-list, JSON body size limit, and a
  central error handler that logs details server-side while returning sanitised messages.
* **Auditability** — `status_history` is append-only (a database trigger rejects `UPDATE`),
  and `assignment_logs` records who decided what, with which score and why.

---

## Database engineering highlights

The parts worth pointing at in a database-systems review:

| Topic | Where it shows up |
|-------|-------------------|
| **Normalisation** | 3NF across 13 domain tables; lookup tables for categories and centres; role/profile separation instead of nullable columns |
| **Keys and relationships** | Surrogate `SERIAL` primary keys, natural business codes (`ITM-2026-01004`) generated from 3 dedicated PostgreSQL sequences (`nextval`, never `MAX(id)+1`), foreign keys with explicit `ON DELETE` rules |
| **Unique constraints as invariants** | one inspection per item, one batch per item, one recovery row per `(batch, material_type)`, one agent/recycler profile per user, lower-cased unique emails |
| **CHECK constraints** | grade ↔ score band, repairable items cannot be disposed, status ↔ required-timestamp coherence, load ≤ daily maximum, weight/quantity positivity, coordinate ranges, PIN-code shape |
| **Triggers** | append-only `status_history`; profile ↔ role consistency (an `agent_profiles` row must belong to a `COLLECTION_AGENT`); a role change is refused while a matching profile exists |
| **Indexing** | B-tree composites matching the real access paths, **partial indexes** for open work queues, a **GIN index** on the recycler `accepted_materials` array, unique index on `lower(email)` |
| **Transactions** | every multi-step operation (submission + pickup, assignment + load counter + history, receive + item statuses, batch completion + recovery) runs in one `prisma.$transaction`, with `SELECT … FOR UPDATE` where two coordinators could race |
| **Query techniques** | ~690 lines of demonstration SQL: 8-table joins, `GROUP BY`/`HAVING`, `FILTER` aggregates, scalar and `NOT EXISTS` subqueries, LATERAL joins, CTEs, recursive CTE, window functions (`rank`, running totals, `DISTINCT ON`), `EXPLAIN (ANALYZE, BUFFERS)` index rationale, transaction blocks, constraint-failure demos, views and a materialised view |
| **Audit trail** | polymorphic `status_history` enforced by a `num_nonnulls(...) = 1` CHECK so a row always points at exactly one parent |

Run the demonstration file:

```powershell
psql "postgresql://postgres:YOUR_PASSWORD@localhost:5432/ecocycle_dev" -f ..\docs\sql\demonstration_queries.sql
```

Sections A–E and H are read-only; section F performs transactional writes (use a scratch copy
if you want to keep the demo data pristine); section G deliberately violates constraints and
shows the database refusing, statement by statement.

The assignment engine has its own specification, including the exact formula, worked example
and edge cases: **[docs/ASSIGNMENT_ALGORITHM.md](docs/ASSIGNMENT_ALGORITHM.md)**.

---

## Implemented features

**Citizen** — registration and sign-in; dashboard with real totals; multi-item submission with
optional pickup in one transaction; item list with server-side filters and pagination; item
detail with specs, inspection outcome, batch membership and full timeline; edit/cancel/delete
rules that mirror the state machine; pickup tracking; profile and password management.

**Collection agent** — dashboard with queue, workload meter and reliability; accept; decline
with a reason (frees the slot and returns the request to the pool); record collection with
weight and notes; mark a pickup failed; assignment history with scores and distances.

**Centre staff** — centre dashboard (inventory by status, inspection queue, incoming pickups,
open batches, recovered weight); confirm receipt; inspect and classify with live grade
derivation and validation; create batches from eligible items; add/remove items while editable;
mark ready, attach a recycler, release, start and complete; record recoveries per material;
per-centre isolation enforced by the API.

**Recycler** — dashboard with assigned batches and recovery output; batch list; start
processing; record recovered materials with quantity, purity and market value; correct or
delete a recovery while the batch is open; recovery ledger with per-material aggregates.

**Administrator** — operations dashboard with *needs attention*; analytics suite (trends,
material recovery, centre/agent/recycler performance, assignment statistics, cycle times);
user management with privileged-role creation and role-specific profile blocks; agent
directory editing the exact inputs of the assignment engine; centre CRUD with per-centre
statistics; category CRUD; cross-centre pickup and batch views; scoped activity feed.

**Platform-wide** — JWT auth with role and ownership enforcement, token kept in memory and
persisted when the browser allows it; Zod validation on both sides; central error handling with
typed error codes; rate limiting; rate-limit, expired-session and error states in the UI;
responsive, accessible layout with loading/empty/error states everywhere; charts from Recharts
fed only by API aggregates; 10 automated backend suites (226 tests) covering the lifecycle end
to end, plus 13 hermetic and 3 live frontend tests for the authentication and session layer.

---

## Known limitations

Honest scope boundaries — useful for a viva or a code review:

1. **`bcryptjs` instead of the native `bcrypt`.** Chosen so the project installs and runs on
   Windows without a C++ build toolchain. It is API-compatible and slower per hash; swapping to
   `bcrypt` or `argon2` is a one-line change in `src/services/auth.service.ts` if the target
   server has build tools.
2. **Straight-line distance.** The engine uses the haversine formula, not routed distance.
   Live traffic and travel time need a paid routing API, which the brief excludes.
3. **No email or SMS.** Notifications are in-app only; password resets are performed by an
   administrator.
4. **Single-tenant, single-currency.** Market values are recorded in INR per kilogram.
5. **Coordinates are optional.** An agent or pickup without coordinates falls back to
   PIN-code/city scoring, which is coarser than real distance. The UI flags rows that lack them.
6. **`status_history` grows unbounded.** Append-only by design; a production deployment should
   partition or archive it by year.
7. **Rate limiting is in-process.** Suitable for one instance; multiple instances need a shared
   store (Redis).
8. **No file uploads.** Item photos and recycling certificates are out of scope.
9. **Batch item weight allocation** assumes one item per inspection record; bulk inspection of a
   pickup allocates weights per item but the schema keeps one measurement per item.
10. **Dependency advisories accepted knowingly.** `npm audit` reports two moderate advisories in
    `react-router-dom` 6.x (an open-redirect in `<Link>`/`useNavigate` with attacker-controlled
    backslash paths, and an SSR-hydration issue that cannot apply here — this client has no
    server rendering). All navigation targets are fixed internal paths, so neither is reachable;
    the fix is React Router 7, a breaking upgrade outside this project's pinned versions. The
    backend's high-severity report is `deepmerge-ts` inside the Prisma **CLI**, not the runtime
    client. Both are recorded in the README rather than silenced.
11. **The frontend suite covers the authentication and session layer, not every screen.** 13
    hermetic tests plus 3 live ones pin the flows that broke in practice (token attach, reload
    restore, guards, expired sessions). The remaining screens rely on the production build,
    server-side tests and the walkthrough above — component tests for each screen would be the
    next increment.

---

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `Can't reach database server at localhost:5432` | PostgreSQL service is not running. Windows: `services.msc` → **postgresql-x64-17** → Start. Linux: `sudo systemctl start postgresql` |
| `Authentication failed for user "postgres"` | Wrong password in `DATABASE_URL`. Reset it with `ALTER USER postgres PASSWORD 'new';` and update `.env`. Remember to percent-encode special characters |
| `database "ecocycle_dev" does not exist` | Create it (see [Database setup](#database-setup-migrations-and-seed-data)) |
| `Environment validation failed: JWT_SECRET ... at least 32 characters` | The API refuses to boot with a short secret in production. Generate one with the `node -e` command above |
| Prisma: `P3009` / *migrate found failed migrations* | A migration was interrupted. Run `npx prisma migrate status`; if the database is empty, `npx prisma migrate reset`. Otherwise mark the migration with `npx prisma migrate resolve --rolled-back <name>` |
| `Cannot find module '.prisma/client'` | Run `npx prisma generate` (also part of `npm run build`) |
| Frontend loads but every page shows a network error | The API is not running, or it is on another port. Start `npm run dev` in `backend`, and check `VITE_PROXY_TARGET` in `frontend/.env` |
| `Unexpected token '<' … is not valid JSON` | A request hit the dev server instead of the API — usually a wrong `VITE_API_URL`, or the backend crashed. Check the backend log |
| Everything returns `429 Too Many Requests` | You exhausted the credential limiter (default: 20 failed attempts / 15 min). Wait, or raise `AUTH_RATE_LIMIT_MAX_ATTEMPTS` in `.env` |
| `401 Invalid or expired token` immediately after signing in | `JWT_SECRET` changed between signing and verifying (e.g. the `.env` file was edited). Sign in again |
| Protected pages report `Missing bearer token` right after a successful login | The browser refused to store the session token (sandboxed iframe, blocked cookies/storage, private mode). The client now keeps the token in memory, so this only appears if the session genuinely ended — check the browser console for a `SecurityError` and sign in again |
| Signed out again after every page reload | Web Storage is unavailable in that context, so the session cannot be persisted. Normal in a sandboxed preview iframe; open the app directly in a browser tab to keep the session across reloads |
| Frontend tests fail with *no EcoCycle API at http://127.0.0.1:5173* | Expected for `npm run test:live`: it needs both dev servers running. Use `npm test` for the hermetic suite, or set `ECOCYCLE_API_URL` |
| Tests fail with `TEST_DATABASE_URL must be set` | Add `TEST_DATABASE_URL` to `backend/.env` — it must point at a **different** database than `DATABASE_URL` |
| `psql: command not found` on Windows | Add PostgreSQL's `bin` folder (e.g. `C:\Program Files\PostgreSQL\17\bin`) to `PATH`, or use pgAdmin / the full path to `psql.exe` |
| Port 5173 or 4000 already in use | Change `PORT` in `backend/.env`, and start Vite with `npm run dev -- --port 5174` |
| Seed script appears to do nothing the second time | Correct — it is idempotent by design and will not duplicate records |

---

## Documentation map

| Document | Contents |
|----------|----------|
| [docs/ASSIGNMENT_ALGORITHM.md](docs/ASSIGNMENT_ALGORITHM.md) | Eligibility filters, distance sources and fallbacks, the exact scoring formula, weights and configuration, worked example, tie-breaks, concurrency, edge cases, why it is not AI, extension points, and the tests that pin it |
| [docs/DATABASE.md](docs/DATABASE.md) | Table-by-table schema, relationships and delete rules, every constraint and trigger, the index catalogue with rationale, transaction catalogue, and how to run the queries |
| [docs/sql/demonstration_queries.sql](docs/sql/demonstration_queries.sql) | Runnable SQL: joins, aggregation, subqueries, CTEs, window functions, index/EXPLAIN analysis, transactions, constraint demos, views |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | The 7-phase plan, entity model and test matrix used to build the repository |

---

## License

Released under the MIT License. Demonstration data, account names and organisation names are
fictional.
