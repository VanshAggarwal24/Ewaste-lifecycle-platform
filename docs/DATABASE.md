# EcoCycle database reference

PostgreSQL 17 · Prisma ORM 6 · 13 domain tables · 13 enums · 45 CHECK constraints ·
30 foreign keys · 62 indexes · 4 triggers · 3 business-code sequences

This document explains the schema as it actually exists after `prisma migrate deploy`, why each
piece is there, and how to inspect or extend it. It is the reference behind the
[Entity-relationship model](../README.md#entity-relationship-model) section of the README.

**Contents**

1. [Files and migration workflow](#1-files-and-migration-workflow)
2. [Conventions](#2-conventions)
3. [Enum catalogue](#3-enum-catalogue)
4. [Tables](#4-tables)
5. [Relationships and delete rules](#5-relationships-and-delete-rules)
6. [Unique constraints](#6-unique-constraints)
7. [CHECK constraint catalogue](#7-check-constraint-catalogue)
8. [Triggers](#8-triggers)
9. [Index catalogue and rationale](#9-index-catalogue-and-rationale)
10. [Business codes and sequences](#10-business-codes-and-sequences)
11. [Transactions](#11-transactions)
12. [Views and reporting](#12-views-and-reporting)
13. [Extending the schema safely](#13-extending-the-schema-safely)

---

## 1. Files and migration workflow

```
backend/prisma/
├─ schema.prisma                     # single source of truth for the models
├─ migrations/
│  ├─ 20261011101533_init_schema/           # tables, enums, indexes, foreign keys
│  ├─ 20261011103000_integrity_constraints/ # CHECK constraints, partial indexes, triggers
│  └─ 20261011104500_code_sequences/        # business-code sequences + default values
└─ seed.ts                           # idempotent demo data
```

| Task | Command |
|------|---------|
| Apply committed migrations (safe, non-interactive) | `npx prisma migrate deploy` |
| Create a migration from a schema edit | `npx prisma migrate dev --name describe_the_change` |
| See what is applied | `npx prisma migrate status` |
| Regenerate the typed client | `npx prisma generate` |
| Browse data | `npx prisma studio` |
| Reset a development database | `npx prisma migrate reset` (⚠ destroys data) |

Two rules the application follows:

* **The API never touches the schema.** `src/index.ts` only opens a connection; migrations and
  seeding are separate commands. Nothing in the running application can drop or reset a table.
* **Applied migrations are never hand-edited.** The integrity constraints live in their own
  migration so the history reads as an evolution: structure first, then rules, then sequences.

The automated test suite migrates the *test* database with the same command
(`tests/helpers/globalSetup.ts` → `prisma migrate deploy`), so tests run against exactly the
schema production runs against.

---

## 2. Conventions

| Convention | Detail |
|------------|--------|
| Primary keys | Surrogate `SERIAL` integers, named `id`. Referenced by `pickup_request_id`, `item_id`, … |
| Business identifiers | Human-readable codes (`ITM-2026-01004`, `PR-2026-01002`, `BAT-2026-01001`, `CC-CHN-01`, `laptops-computers`) generated from PostgreSQL sequences, never from `MAX(id)+1` |
| Money and weight | `NUMERIC(12,3)` for weights in kilograms (gram resolution), `NUMERIC(12,2)` for prices, `NUMERIC(8,2)` for capacity |
| Timestamps | `TIMESTAMPTZ(3)` everywhere; `created_at DEFAULT CURRENT_TIMESTAMP`, `updated_at` maintained by Prisma |
| Text | `VARCHAR(n)` with explicit limits so clients cannot store unbounded strings |
| Nullability | Optional by exception: a `NULL` column means "not applicable yet" (e.g. `inspections.center_id` before a centre is assigned) |
| Coordinates | `NUMERIC(10,7)` ± range CHECK; optional, and the assignment engine degrades gracefully when they are missing |
| Booleans | Named as facts: `is_available`, `hazard_flag`, `data_wipe_done` |
| Audit trail | Every state change writes a row into `status_history`; the table is append-only by trigger |

---

## 3. Enum catalogue

Enums are PostgreSQL types, so an invalid status cannot be stored even by a manual `INSERT`.

| Enum | Values |
|------|--------|
| `Role` | `USER`, `COLLECTION_AGENT`, `CENTER_STAFF`, `RECYCLER`, `ADMIN` |
| `UserStatus` | `ACTIVE`, `SUSPENDED` |
| `CenterStatus` | `ACTIVE`, `INACTIVE`, `MAINTENANCE` |
| `ItemStatus` | `SUBMITTED`, `PICKUP_SCHEDULED`, `COLLECTED`, `RECEIVED_AT_CENTER`, `INSPECTED`, `IN_BATCH`, `PROCESSING`, `RECYCLED`, `REJECTED`, `CANCELLED` |
| `PickupStatus` | `REQUESTED`, `ASSIGNED`, `ACCEPTED`, `COLLECTED`, `RECEIVED_AT_CENTER`, `FAILED`, `CANCELLED` |
| `BatchStatus` | `DRAFT`, `READY`, `RELEASED`, `IN_PROGRESS`, `COMPLETED` |
| `ItemCondition` | `WORKING`, `REPAIRABLE`, `FAULTY`, `SEVERELY_DAMAGED` |
| `QualityGrade` | `A`, `B`, `C`, `D` |
| `ProcessingPath` | `REFURBISHMENT`, `COMPONENT_RECOVERY`, `MATERIAL_RECOVERY`, `DISPOSAL` |
| `MaterialType` | `COPPER`, `ALUMINIUM`, `STEEL`, `GOLD`, `SILVER`, `PALLADIUM`, `PLASTIC`, `GLASS`, `BATTERY_CHEMICALS`, `RARE_EARTH`, `OTHER` |
| `AssignmentMethod` | `AUTO`, `MANUAL`, `REASSIGNMENT` |
| `AssignmentOutcome` | `ASSIGNED`, `NO_ELIGIBLE_AGENT`, `SKIPPED` |
| `LifecycleEntity` | `PICKUP_REQUEST`, `EWASTE_ITEM`, `PROCESSING_BATCH` |

Transition rules between statuses are *not* expressed as enums — they live in
`src/utils/statusMachine.ts` and in the CHECK constraints listed in section 7, so an illegal
transition is refused by the API *and* by the database.

---

## 4. Tables

### `users` — every actor in the system (17 columns)

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `email` | varchar(255) | unique, plus a unique index on `lower(email)`; CHECK forces lower-case storage |
| `password_hash` | varchar(255) | bcrypt (cost from `BCRYPT_SALT_ROUNDS`); never returned by the API |
| `full_name` | varchar(120) | CHECK: at least 2 non-space characters |
| `phone` | varchar(20) | CHECK: `+?[0-9 ()\-]{7,20}` |
| `role` | `Role` | default `USER`; guarded by the `user_role_guard` trigger |
| `status` | `UserStatus` | default `ACTIVE`; `SUSPENDED` accounts are rejected at login and on every request |
| `address_line`, `city`, `state`, `pincode` | text | pincode CHECK `^[0-9A-Za-z\- ]{4,12}$` |
| `latitude`, `longitude` | numeric(10,7) | optional, ± range CHECKs |
| `staffed_center_id` | FK → `collection_centers.id` | `CENTER_STAFF` only (enforced in the service layer) |
| `last_login_at` | timestamptz | written on successful login |
| `created_at`, `updated_at` | timestamptz | |

Only one table for identities means JWT subjects, audit rows and ownership columns all point at
the same key. Role-specific data lives in the profile tables below.

### `agent_profiles` — collection agents (1:1 with a `COLLECTION_AGENT` user)

`user_id` (unique FK), `center_id` (FK, nullable — an unassigned agent), `vehicle_type`,
`vehicle_capacity_kg` (> 0, default 50), `is_available`, `is_verified`,
`current_load_count`, `max_daily_pickups` (> 0, default 10), `rating_avg` (0–5, default 0).

`current_load_count`, `is_available`, `is_verified`, `vehicle_capacity_kg` and `max_daily_pickups`
are exactly the inputs of the assignment engine — the profile edit screen in the admin UI maps
one-to-one onto the scoring formula.

### `recycler_profiles` — licensed recyclers (1:1 with a `RECYCLER` user)

`user_id` (unique FK), `organization_name`, `license_number` (unique), `accepted_materials`
(`MaterialType[]`, GIN-indexed, CHECK ≥ 1 element), `max_capacity_kg`, `is_active`,
`contact_phone`.

### `collection_centers` — physical drop-off and processing hubs

`code` (unique, e.g. `CC-CHN-01`), `name`, `address_line`, `city`, `state`, `pincode`,
`latitude`, `longitude`, `phone`, `email`, `capacity_kg` (> 0), `status` (`CenterStatus`).

### `categories` — e-waste taxonomy

`name` (unique), `slug` (unique), `description`, `hazard_level` (1–5), `default_path`
(`ProcessingPath`, pre-selects the inspection path), `is_active`. Seeded with seven categories:
Mobile Phones & Tablets, Laptops & Computers, Televisions & Monitors, Batteries & Power Cells,
Home Appliances, Networking Equipment, Printers & Scanners.

### `pickup_requests` — a booked collection (26 columns)

Ownership and routing: `user_id` (FK, RESTRICT), `agent_id` (FK → `agent_profiles.id`,
`SET NULL` on delete), `center_id` (FK, `SET NULL`), `category_id` (FK, `SET NULL` —
the dominant category of the load).

Address: `address_line`, `city`, `state`, `pincode`, `latitude`, `longitude`
(these are what the assignment engine reads).

Scheduling: `preferred_date` (date, required), `time_slot`, `notes`.

Outcome: `estimated_weight_kg`, `collected_weight_kg` (> 0 when present), `failure_reason`.

Timeline: `assigned_at`, `accepted_at`, `collected_at`, `received_at`, `cancelled_at`,
plus `created_at` / `updated_at`. Every one of them is written by the service inside the same
transaction as the status change, and the coherence of those pairs is enforced by
`pickup_timestamps_chk`, `pickup_cancelled_chk` and `pickup_agent_required_chk`.

### `ewaste_items` — the items themselves (16 columns)

`item_code` (unique business id), `user_id` (owner, RESTRICT), `pickup_request_id`
(`SET NULL` when a request is deleted — items survive their pickup), `category_id` (RESTRICT),
`center_id` (`SET NULL`; required for statuses from `RECEIVED_AT_CENTER` onwards via
`item_center_required_chk`), `name`, `brand`, `model_number`, `serial_number`, `description`,
`quantity` (1–10000), `estimated_weight_kg`, `status` (`ItemStatus`).

### `inspections` — one measurement per item (unique `item_id`)

`center_id`, `inspected_by_id`, `condition` (`ItemCondition`), `quality_score` (0–100),
`quality_grade` (`QualityGrade`, must match the score band), `processing_path`,
`actual_weight_kg` (> 0), `is_repairable`, `hazard_flag`, `data_wipe_required` (default true),
`data_wipe_done`, `remarks`, `inspected_at`.

The grade is derived by the API (`gradeForScore`) and re-checked by the database —
a mismatched pair such as grade `A` with score 60 is rejected (see demo query G.1).

### `processing_batches` — recycler-bound groups of inspected items

`batch_code` (unique), `center_id` (RESTRICT — a centre with batches cannot be deleted),
`recycler_id` (FK → `users.id`, `SET NULL`), `created_by_id` (`SET NULL`), `name`, `status`
(`BatchStatus`), `processing_path`, `target_weight_kg`, `actual_weight_kg`, `released_at`,
`started_at`, `completed_at`, `notes`.

### `batch_items` — the batch ↔ item join, with its own invariant

`batch_id` (CASCADE), `item_id` (**unique** — an item belongs to at most one batch ever),
`added_by_id`, `weight_at_addition_kg` (> 0 when present), `added_at`.

The unique index on `item_id` is the database-level proof of "no double processing"; the API
also checks it and returns a friendly `409` with the existing batch's code.

### `recovered_materials` — the recycler's output ledger

`batch_id` (CASCADE), `item_id` (nullable attribution, `SET NULL`), `recorded_by_id`,
`material_type` (`MaterialType`), `quantity_kg` (> 0), `unit` (default `KG`), `purity_pct`
(0–100 when present), `market_value_per_kg` (≥ 0 when present), `notes`, `recorded_at`.

Unique on `(batch_id, material_type)`: a batch records one figure per material and *updates* it
rather than appending duplicates, which keeps yield calculations unambiguous.

### `status_history` — the append-only lifecycle ledger

`entity_type` (`LifecycleEntity`), `pickup_request_id` / `item_id` / `batch_id`
(**exactly one** non-null), `status` (varchar(40) — deliberately not an enum, so it can hold
whichever machine applies), `note`, `actor_id` (`SET NULL` if the user is deleted),
`actor_role` (snapshot of the role at the time), `metadata` (jsonb for extra context),
`created_at`.

### `assignment_logs` — why each agent got (or did not get) a pickup

`pickup_request_id` (CASCADE), `agent_id` (nullable, `SET NULL`), `assigned_by_id` (nullable),
`method` (`AssignmentMethod`), `outcome` (`AssignmentOutcome`), `score` (numeric(8,4)),
`distance_km` (numeric(8,2)), `reason` (human-readable explanation), `candidates` (jsonb —
the full scored candidate table for that decision), `created_at`.

This is the table that makes the rule-based engine auditable: every auto-assignment, manual
override and failed search leaves a row you can read in the UI under
**Pickup → Assignment history**.

---

## 5. Relationships and delete rules

30 foreign keys, all `ON UPDATE CASCADE`, with delete behaviour chosen per relationship:

| Parent → child | On delete | Why |
|----------------|-----------|-----|
| `users` → `agent_profiles`, `recycler_profiles` | CASCADE | a profile is meaningless without its user |
| `users` → `ewaste_items`, `pickup_requests` | RESTRICT | business records must not vanish silently |
| `users` → `inspections.inspected_by_id`, `processing_batches.created_by_id`, `recovered_materials.recorded_by_id`, `status_history.actor_id`, `assignment_logs.assigned_by_id` | SET NULL | keep the record, lose the (deleted) actor, `actor_role` keeps the historical context |
| `users` → `processing_batches.recycler_id`, `pickup_requests.agent_id` | SET NULL | an assignment disappears with its agent, the work item does not |
| `users.staffed_center_id` → `collection_centers` | SET NULL | staff survive a centre closure |
| `collection_centers` → `ewaste_items.center_id`, `pickup_requests.center_id`, `inspections.center_id`, `agent_profiles.center_id` | SET NULL | historical rows keep existing without the centre |
| `collection_centers` → `processing_batches.center_id` | RESTRICT | a centre with batches cannot be deleted |
| `categories` → `ewaste_items.category_id` | RESTRICT | items must stay classified |
| `categories` → `pickup_requests.category_id` | SET NULL | the dominant category is informational |
| `pickup_requests` → `ewaste_items.pickup_request_id` | SET NULL | deleting a request orphans its items back to the owner, who then re-books |
| `pickup_requests` → `status_history`, `assignment_logs` | CASCADE | the audit rows belong to that request |
| `ewaste_items` → `inspections.item_id`, `status_history.item_id` | CASCADE | measurement and history belong to the item |
| `ewaste_items` → `batch_items.item_id` | RESTRICT | refuse to delete an item that is committed to a batch |
| `ewaste_items` → `recovered_materials.item_id` | SET NULL | recovery survives item cleanup |
| `processing_batches` → `batch_items`, `recovered_materials`, `status_history` | CASCADE | a deleted draft takes its own contents with it |

Practical effect: **cancelling** a pickup is a status change (items return to the owner), while
**deleting** a request is only allowed while it has no collected history — the API checks this
before issuing the `DELETE`, and the FK rules are the backstop.

---

## 6. Unique constraints

| Constraint | Table | Meaning |
|------------|-------|---------|
| `users_email_key`, `users_email_lower_key` | users | e-mail uniqueness, case-insensitively |
| `agent_profiles_user_id_key` | agent_profiles | one agent profile per user |
| `recycler_profiles_user_id_key`, `recycler_profiles_license_number_key` | recycler_profiles | one profile per user; licences are globally unique |
| `categories_name_key`, `categories_slug_key` | categories | no duplicate taxonomy |
| `collection_centers_code_key` | collection_centers | stable centre codes |
| `ewaste_items_item_code_key`, `pickup_requests_request_code_key`, `processing_batches_batch_code_key` | items / pickups / batches | business identifiers are unique |
| `inspections_item_id_key` | inspections | **one inspection per item** — a second one is refused with the first one's id |
| `batch_items_item_id_key` | batch_items | **an item can be processed once** |
| `recovered_materials_batch_id_material_type_key` | recovered_materials | one recovery figure per material per batch |

---

## 7. CHECK constraint catalogue

45 CHECK constraints. Grouped by the invariant they defend:

**Grade and inspection coherence** (`inspections`)

| Constraint | Rule |
|------------|------|
| `inspection_score_chk` | `quality_score BETWEEN 0 AND 100` |
| `inspection_grade_band_chk` | A ⇔ 85–100, B ⇔ 70–84, C ⇔ 50–69, D ⇔ 0–49 |
| `inspection_repairable_chk` | a repairable item cannot be routed to `DISPOSAL` |
| `inspection_weight_chk` | measured weight > 0 |

**State ↔ required data coherence**

| Constraint | Rule |
|------------|------|
| `pickup_agent_required_chk` | `ASSIGNED`, `ACCEPTED`, `COLLECTED`, `RECEIVED_AT_CENTER` all require an `agent_id` |
| `pickup_timestamps_chk` | `COLLECTED` requires `collected_at`; `RECEIVED_AT_CENTER` requires `collected_at` **and** `received_at` |
| `pickup_cancelled_chk` | `CANCELLED` requires `cancelled_at` |
| `batch_recycler_required_chk` | `RELEASED`, `IN_PROGRESS`, `COMPLETED` require a recycler |
| `batch_release_ts_chk`, `batch_started_ts_chk`, `batch_completed_ts_chk` | those statuses require their timestamps |
| `item_center_required_chk` | items from `RECEIVED_AT_CENTER` onwards must have a centre |

**Polymorphic parent integrity** (`status_history`)

| Constraint | Rule |
|------------|------|
| `history_single_parent_chk` | `num_nonnulls(pickup_request_id, item_id, batch_id) = 1` — exactly one parent |
| `history_entity_matches_chk` | `entity_type` must match which parent column is filled |
| `history_status_len_chk` | status strings are 2–40 characters |

**Numeric sanity**

`agent_capacity_chk` (vehicle > 0), `agent_max_daily_chk` (> 0), `agent_load_chk` (≥ 0),
`agent_load_within_max_chk` (load ≤ daily maximum), `agent_rating_chk` (0–5),
`batch_item_weight_chk`, `batch_target_weight_chk`, `batch_actual_weight_chk`,
`recycler_capacity_chk`, `recycler_materials_chk` (≥ 1 accepted material),
`recovery_quantity_chk`, `recovery_purity_chk` (0 < p ≤ 100), `recovery_value_chk` (≥ 0),
`centers_capacity_chk`, `item_quantity_chk` (1–10000), `item_est_weight_chk`,
`pickup_est_weight_chk`, `pickup_coll_weight_chk`, `categories_hazard_level_chk` (1–5).

**Data hygiene**

`users_email_lowercase_chk`, `users_full_name_len_chk`, `users_phone_chk`,
`centers_pincode_chk`, `pickup_pincode_chk`,
`users_latitude_chk`/`users_longitude_chk`, `centers_latitude_chk`/`centers_longitude_chk`,
`pickup_latitude_chk`/`pickup_longitude_chk`.

Each of these has a counterpart in the Zod schemas, so the user sees a friendly message and the
database remains the last line of defence. Test coverage: `tests/integration/guards.test.ts`
asserts the API-level behaviour, and `docs/sql/demonstration_queries.sql` section G shows the
database refusing the same writes directly in `psql`.

---

## 8. Triggers

Four triggers, all in PL/pgSQL, created by the `integrity_constraints` migration.

### `status_history_append_only` — an audit trail you cannot rewrite

```sql
CREATE TRIGGER status_history_append_only
  BEFORE DELETE OR UPDATE ON status_history
  FOR EACH ROW EXECUTE FUNCTION ecocycle_block_history_mutation();
```

The function raises a `check_violation` naming the attempted operation. Combined with the FK
`ON DELETE CASCADE` rules, this means: history appears when a lifecycle event happens, and the
only way it disappears is by deleting the parent entity itself. (Demo query G.8.)

### `agent_profile_role_guard`, `recycler_profile_role_guard` — profile ↔ role consistency

```sql
CREATE TRIGGER agent_profile_role_guard
  BEFORE INSERT OR UPDATE OF user_id ON agent_profiles
  FOR EACH ROW EXECUTE FUNCTION ecocycle_assert_profile_role();
```

The function looks up `users.role` and raises unless the user is a `COLLECTION_AGENT`
(respectively `RECYCLER`). This is what makes "citizens never become agents by accident" true at
the storage layer and not merely in the service code. (Demo query G.10.)

### `user_role_guard` — no silent side-effects when a role changes

```sql
CREATE TRIGGER user_role_guard
  BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION ecocycle_assert_user_role_change();
```

Moving a user out of `COLLECTION_AGENT` or `RECYCLER` while a matching profile row still exists
is refused with an explanatory message; delete or reassign the profile first. Role *upgrades* on
a user with no profile are allowed — that is how an administrator promotes a citizen to staff.

---

## 9. Index catalogue and rationale

62 indexes: 28 unique (14 primary keys — the 13 domain tables plus Prisma's `_prisma_migrations` — and 14 business keys) and 34 secondary. The
secondary ones exist because a specific screen issues that query; section E of
`docs/sql/demonstration_queries.sql` runs `EXPLAIN (ANALYZE, BUFFERS)` over each access path so
the planner's choice can be observed.

| Index | Type | Serves |
|-------|------|--------|
| `ewaste_items_user_id_status_idx` | btree (user_id, status) | "my items, filtered by status" — the citizen dashboard and item list |
| `item_user_created_idx` | btree (user_id, created_at DESC) | "my latest activity" without a sort |
| `item_open_idx` | **partial** on `status` WHERE status ∉ (RECYCLED, CANCELLED, REJECTED) | open-work counts; the index stays small as history accumulates |
| `ewaste_items_status_center_id_idx` | btree (status, center_id) | the centre inspection queue |
| `ewaste_items_pickup_request_id_idx`, `ewaste_items_category_id_idx` | btree | joins and category analytics |
| `pickup_requests_status_preferred_date_idx` | btree (status, preferred_date) | coordinator work queue in date order |
| `pickup_requests_user_id_status_idx`, `pickup_user_created_idx` | btree | a citizen's pickup list |
| `pickup_requests_agent_id_status_idx` | btree (agent_id, status) | an agent's own assignments |
| `pickup_requests_center_id_status_idx` | btree (center_id, status) | incoming deliveries per centre |
| `pickup_open_idx` | **partial** WHERE status ∈ (REQUESTED, ASSIGNED, ACCEPTED, COLLECTED) | the "needs attention" panel and assignment pool |
| `agent_profiles_is_available_current_load_count_idx` | btree (is_available, current_load_count) | the assignment engine's candidate scan |
| `agent_profiles_center_id_is_available_idx` | btree (center_id, is_available) | "available agents at my centre" |
| `inspections_item_id_key` | unique | duplicate-inspection prevention |
| `inspections_center_id_inspected_at_idx` | btree (center_id, inspected_at) | centre inspection history |
| `inspections_processing_path_idx` | btree | routing analytics (refurbish vs. recovery vs. disposal) |
| `processing_batches_status_center_id_idx`, `batch_open_idx` (**partial**, DRAFT/READY) | btree | centre batch board and "waiting for a recycler" queue |
| `processing_batches_recycler_id_status_idx` | btree | a recycler's assigned batches |
| `batch_items_batch_id_idx`, `batch_items_item_id_key` | btree (idx + unique) | batch contents; one-batch-per-item guarantee |
| `recovered_materials_batch_id_idx`, `recovered_materials_batch_id_material_type_key` | btree | batch recovery sheet and its uniqueness rule |
| `recovered_materials_material_type_recorded_at_idx` | btree (material_type, recorded_at) | material analytics over time |
| `recycler_materials_gin_idx` | **GIN** on `accepted_materials` | "which active recyclers accept copper?" (`@>` containment) |
| `recycler_profiles_is_active_idx` | btree | recycler selection |
| `status_history_entity_type_*_created_at_idx` × 3 | btree (entity_type, parent, created_at) | all three timeline screens, ordered and filtered |
| `history_timeline_idx` | btree (created_at DESC) | the global activity feed |
| `assignment_logs_pickup_request_id_idx`, `assignment_logs_agent_id_created_at_idx` | btree | assignment audit per request and per agent |
| `users_role_status_idx` | btree (role, status) | admin user directory filters |
| `users_city_idx` | btree | city grouping for centre/agent coverage; the engine's same-city distance fallback |
| `users_email_lower_key` | **unique expression** on `lower(email)` | case-insensitive login |
| `collection_centers_status_city_idx`, `categories_is_active_idx` | btree | small lookup tables with one hot filter |

Reads that are deliberately *not* indexed are the ones the demo file measures with a sequential
scan (E.8) — the point being that an index is a cost/benefit decision, not a default.

`EXPLAIN` note for reviewers: on a seeded database of a few dozen rows PostgreSQL may still
choose a sequential scan because it is genuinely cheaper. To watch the index being used,
populate a few thousand rows (`INSERT … SELECT generate_series(...)`) or run
`SET enable_seqscan = off;` before the query in section E.

---

## 10. Business codes and sequences

Three PostgreSQL sequences back the human-readable identifiers, so codes are unique even under
concurrent inserts — and `nextval` is non-transactional, which is exactly what you want for a
never-reused identifier.

| Sequence | Format | Example |
|----------|--------|---------|
| `ewaste_item_code_seq` | `ITM-<year>-<5 digits>` | `ITM-2026-01004` |
| `pickup_request_code_seq` | `PR-<year>-<5 digits>` | `PR-2026-01002` |
| `processing_batch_code_seq` | `BAT-<year>-<5 digits>` | `BAT-2026-01001` |

Sequences start at 1001 to keep early demo data readable. Centre codes and category slugs are
supplied by the administrator (`CC-CHN-01`, `laptops-computers`) and are unique by constraint.

---

## 11. Transactions

The API performs **28** `prisma.$transaction(...)` blocks across six services. Every operation
that writes more than one row uses one; a failure anywhere rolls the whole thing back, so the
database never holds a half-finished step.

| Operation | Rows written atomically | File |
|-----------|------------------------|------|
| Submit items + create the pickup request | `ewaste_items` × n, `pickup_requests`, `status_history` × n | `item.service.ts` |
| Cancel / delete an item | item status, history, request roll-up | `item.service.ts` |
| Inspect an item | `inspections`, item status → `INSPECTED`, history, batch recalculation | `inspection.service.ts` |
| Bulk inspection of a pickup | one inspection per item, all statuses and history | `inspection.service.ts` |
| Assign an agent (auto / manual / reassignment) | `pickup_requests` (+`assigned_at`, `agent_id`), agent load counter, `assignment_logs`, history | `assignment.service.ts` |
| Accept, decline, fail, collect, receive, cancel a pickup | request status + timestamps, item statuses, item centre, history, agent counter | `pickup.service.ts` |
| Create a batch / add / remove items | `processing_batches`, `batch_items`, item statuses, weights, history | `batch.service.ts` |
| Mark ready, attach recycler, release, start, complete | batch status + timestamps, item statuses, history | `batch.service.ts` |
| Record, edit or delete a recovery | `recovered_materials`, batch `actual_weight_kg` roll-up, history | `recovery.service.ts` |
| Create a privileged user (+ profile) | `users`, `agent_profiles` / `recycler_profiles` | `user.service.ts` |

**Concurrency control.** The two operations where two people could realistically race — a
coordinator assigning while another assigns or the agent accepts — lock the pickup row first:

```ts
await tx.$queryRaw`SELECT id FROM "pickup_requests" WHERE id = ${pickupRequestId} FOR UPDATE`;
```

Because the row (and therefore the transition) is locked, the second caller re-reads the new
status and is refused with `409 INVALID_TRANSITION` instead of double-assigning. Section F of
the demonstration file reproduces these transactions in plain SQL, including F.4, where a
deliberate CHECK violation proves the rollback.

---

## 12. Views and reporting

The application queries tables directly through Prisma. Two reporting views are provided in
`docs/sql/demonstration_queries.sql` (section H) for analysts and for the "reporting objects"
part of the syllabus — they are **created by that script, not by a migration**, so the schema
stays exactly what Prisma manages.

| Object | Purpose |
|--------|---------|
| `vw_item_lifecycle` | one row per item with owner, pickup, agent, centre, inspection, batch, recycler and recovered weight — the whole lifecycle flattened for dashboards |
| `mv_centre_monthly` | materialised view of centre throughput per month (items, inspected kg, recovered kg) with a unique key so it supports `REFRESH MATERIALIZED VIEW CONCURRENTLY` |

```sql
-- after running the script once
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_centre_monthly;
SELECT * FROM mv_centre_monthly ORDER BY month DESC;
```

---

## 13. Extending the schema safely

1. Edit `prisma/schema.prisma` (models, then indexes).
2. If the change is a rule PostgreSQL can express (a range, a required pairing, a uniqueness
   invariant), add it as raw SQL to a **new** migration:

   ```powershell
   npx prisma migrate dev --name add_my_constraint --create-only
   # paste the ALTER TABLE ... ADD CONSTRAINT / CREATE TRIGGER / CREATE INDEX inside
   npx prisma migrate dev
   ```

3. `npx prisma generate` (or `npm run build`, which runs it first).
4. Update the Zod schema, the service logic, and the tests that pin the behaviour.
5. If the rule is invariant-shaped, add a `G`-section demonstration to
   `docs/sql/demonstration_queries.sql` so the database's refusal is documented too.

Never edit an applied migration (Prisma stores a checksum and will refuse to continue), and
never let application startup migrate — `migrate deploy` belongs in your release process, not in
`src/index.ts`.

---

*Related: [README](../README.md) · [assignment engine](ASSIGNMENT_ALGORITHM.md) ·
[demonstration SQL](sql/demonstration_queries.sql) · [implementation plan](IMPLEMENTATION_PLAN.md)*
