# Pickup assignment: rule-based scoring specification

> **This is a deterministic, rule-and-weight algorithm — not artificial intelligence.**
> There is no machine learning, no statistical model, no training data and no third-party
> service. Given the same database state and the same configuration, the engine always
> produces the same assignment. Every decision is explainable by reading the rules below.

Source of truth: `backend/src/services/assignment.service.ts`
Configuration: `backend/src/config/env.ts` (`ASSIGN_*` environment variables)

---

## 1. Purpose

When a citizen books a pickup (`POST /api/items` with a `pickup` block, or `POST /api/pickups`),
the request must be routed to a **collection agent** who can realistically serve it. Doing that
by hand does not scale and is not auditable, so the platform computes it with two well-defined
stages:

1. **Eligibility (hard filters)** — a candidate that fails *any* filter is never assigned,
   regardless of how attractive its score is.
2. **Scoring (weighted sum)** — the remaining candidates are ranked by a score in `[0, 1]`
   built from four normalised factors.

The chosen agent, the score, the distance, the ranked candidate pool and a human-readable
reason are all persisted to `assignment_logs`, so a coordinator can answer "why this agent?"
for any historical request.

---

## 2. Stage 1 — eligibility filters

A candidate agent profile is **excluded** when any of the following is true. The exclusions are
returned as human-readable strings (`exclusionReasons`) and stored with the audit entry.

| # | Filter | Rule | Rationale |
|---|--------|------|-----------|
| 1 | Account state | The agent's user account must be `ACTIVE` **and** have role `COLLECTION_AGENT` (filtered in the candidate query) | Suspended or non-agent accounts must never receive work |
| 2 | Verification | `agent_profiles.is_verified = true` | Unvetted agents cannot be dispatched to citizens |
| 3 | Availability | `agent_profiles.is_available = true` (shift toggle) | An off-duty agent must not be assigned |
| 4 | Daily capacity | `current_load_count < max_daily_pickups` | Prevents overloading one agent; mirrored by a database CHECK constraint |
| 5 | Centre alignment | If the request has a `center_id` **and** the agent has a `center_id`, they must match | A request owned by a centre is served by that centre's agents |
| 6 | Vehicle capacity | `vehicle_capacity_kg >= pickup.estimated_weight_kg` (skipped when the estimate is unknown) | The vehicle must be able to carry the load |
| 7 | Service radius | Distance must be `<= ASSIGN_MAX_DISTANCE_KM` (default **50 km**) — checked only when both points are known | Keeps the assignment geographically sensible |

Filters are evaluated in a pure function, `scoreCandidate()`, so the rules are unit-tested
directly (`backend/tests/unit/assignment.test.ts`) without a database.

---

## 3. Distance resolution and fallbacks

Distance is computed with the **haversine great-circle formula** (`backend/src/utils/geo.ts`)
on WGS-84 decimal degrees. Precision is more than sufficient for city-scale dispatch; it is a
straight-line distance, not a routed one (see §7).

The pickup origin is resolved in priority order:

| Priority | Source | Condition | Distance source recorded |
|----------|--------|-----------|--------------------------|
| 1 | Request coordinates | `pickup_requests.latitude/longitude` present | `COORDINATES` |
| 2 | PIN-code centroid | Known PIN code from the built-in centroid table | `PINCODE_CENTROID` |
| 3 | City name | Compared with the agent's centre city | `CITY` |

The agent's position is resolved as: **agent user coordinates → home centre coordinates → none**.

When **no distance can be computed at all**, the distance factor is not zero (which would
unfairly bury the candidate) but a neutral fallback:

| Situation | Distance score |
|-----------|---------------|
| Same city (case-insensitive match on the centre city vs. the request city) | `0.60` |
| Nothing known | `0.50` |

When a real distance exists:

```
distanceScore = clamp01(1 − distanceKm / ASSIGN_MAX_DISTANCE_KM)
```

so a request at the agent's doorstep scores `≈ 1.0` and one exactly at the service radius
scores `0.0`.

---

## 4. Stage 2 — scoring

Each factor is normalised into `[0, 1]`, where **higher is better**.

| Factor | Formula | Notes |
|--------|---------|-------|
| `distanceScore` | `clamp01(1 − km / maxDistanceKm)`, or the fallback table above | Closest agent ranks highest |
| `workloadScore` | `clamp01(1 − current_load_count / max_daily_pickups)` | Spreads work across the fleet; an idle agent scores `1.0`, a full one is already filtered out |
| `reliabilityScore` | `clamp01(rating_avg / 5)`, or `0.7` when the agent has no rating history | `0.7` is deliberately **neutral**: a new agent is assignable but not preferred over a proven one. The constant is `NEUTRAL_RELIABILITY_SCORE` |
| `capacityScore` | `clamp01(vehicle_capacity_kg / max(vehicle_capacity_kg of the candidate pool))` | Rewards the larger vehicle for bigger loads; relative to the pool, so the value is always meaningful |

### Weighted sum

```
score = w_distance    · distanceScore
      + w_workload    · workloadScore
      + w_availability· reliabilityScore        ← weight of the reliability factor
      + w_capacity    · capacityScore
```

> The third weight is named `ASSIGN_WEIGHT_AVAILABILITY` for historical reasons, but the hard
> availability filter is stage 1; in stage 2 this weight applies to **reliability**
> (`rating_avg`). Hence the same weight is documented in the API payload as
> `weights.availability` and in the UI column as "Availability". The two names refer to the
> same coefficient.

Results are rounded to 4 decimal places.

### Weights and configuration

| Environment variable | Default | Meaning |
|----------------------|---------|---------|
| `ASSIGN_WEIGHT_DISTANCE` | `0.45` | Proximity |
| `ASSIGN_WEIGHT_WORKLOAD` | `0.25` | Fleet load balancing |
| `ASSIGN_WEIGHT_AVAILABILITY` | `0.20` | Service reliability |
| `ASSIGN_WEIGHT_CAPACITY` | `0.10` | Vehicle size |
| `ASSIGN_MAX_DISTANCE_KM` | `50` | Service radius (hard filter) |
| `ASSIGN_CANDIDATE_POOL` | `10` | How many ranked candidates are stored in the audit log |
| `ASSIGN_MAX_DAILY_PICKUPS` | `10` | Default daily limit for newly created agent profiles |

The configured weights are **normalised at start-up** (`normalizedAssignmentWeights()` in
`backend/src/config/env.ts`) by dividing each by their sum, so `0.45 / 0.25 / 0.20 / 0.10`,
`45 / 25 / 20 / 10` and `0.9 / 0.5 / 0.4 / 0.2` all describe the same preference profile.
Configuration validation refuses to boot if all four weights are zero (nothing could be
ranked) or if production secrets are too short.

### Tie-breaks (a total order)

Equal scores are resolved deterministically — the result never depends on database row order:

1. higher **total score**
2. shorter **known distance** (candidates with a known distance beat ones without)
3. fewer **open pickups**
4. lower **agent profile id** (stable insertion-ordered identity)

---

## 5. Worked example

Weights `0.45 / 0.25 / 0.20 / 0.10`, `ASSIGN_MAX_DISTANCE_KM = 50`.
Pickup: 2 items, estimated 18 kg, no centre binding.

| | Agent A | Agent B |
|---|---|---|
| Distance | 8.00 km → `1 − 8/50 = 0.840` | 3.00 km → `1 − 3/50 = 0.940` |
| Workload | 2 / 10 → `0.800` | 7 / 10 → `0.300` |
| Reliability | 4.5 → `0.900` | 4.8 → `0.960` |
| Capacity | 200 kg (pool max 500) → `0.400` | 500 kg (pool max 500) → `1.000` |
| **Score** | `0.45(0.840)+0.25(0.800)+0.20(0.900)+0.10(0.400) = **0.7980**` | `0.45(0.940)+0.25(0.300)+0.20(0.960)+0.10(1.000) = **0.7900**` |

**Agent A wins** even though Agent B is closer, because Agent A is far less loaded and its
vehicle still satisfies the 18 kg load. This is the intended behaviour: proximity matters most,
but the fleet stays balanced.

### Observed ranking on the seeded development data

The seeded Chennai pickup (`PR-2026-01002`, 7.4 kg) produced:

| Agent | Distance | Distance source | Eligible | Total score |
|-------|----------|-----------------|----------|-------------|
| Karthik Subramanian | 1.92 km | `COORDINATES` | yes | `0.9292` |
| Meera Krishnan | 4.70 km | `COORDINATES` | yes | `0.8850` |
| Ravi Prasad | 284.72 km | `COORDINATES` | **no** | excluded — beyond the 50 km radius |

`AUTO` assignment therefore chose Karthik and stored a reason string naming the winning score
and distance. You can reproduce this from the UI with **Reassign → preview**, which calls
`GET /api/pickups/:id/assignment-preview` (a dry run that writes nothing).

---

## 6. Persistence, transactions and concurrency

`autoAssignPickup()` performs the whole decision inside **one database transaction**:

```
BEGIN
  SELECT id FROM pickup_requests WHERE id = $1 FOR UPDATE   -- row lock
  load candidates (active, COLLECTION_AGENT role)
  score + rank                                       -- pure functions, no I/O
  if no eligible agent:
      INSERT assignment_logs (outcome = NO_ELIGIBLE_AGENT, candidates = top N)
      INSERT status_history (attempt note)
      return { assigned: false, reason }               -- request left untouched
  if reassigning: decrement previous agent's current_load_count
  UPDATE pickup_requests SET agent_id, status = 'ASSIGNED', assigned_at = now()
  UPDATE agent_profiles  SET current_load_count = current_load_count + 1
  UPDATE ewaste_items    SET status = 'PICKUP_SCHEDULED'   -- for the linked items
  INSERT assignment_logs (outcome = ASSIGNED, score, distance, reason, candidates)
  INSERT status_history  (ASSIGNED, with the reason)
COMMIT
```

Guarantees:

* **No double assignment.** `SELECT … FOR UPDATE` serialises two coordinators clicking
  "Assign" at the same instant; the loser re-reads the committed status and fails its status
  check with `409 INVALID_TRANSITION`.
* **No lost slots.** The load counter moves in the same transaction as the status change, and
  `agent_load_within_max_chk` (`current_load_count <= max_daily_pickups`) makes an over-booked
  agent impossible even under a buggy code path.
* **Full auditability.** `assignment_logs` records method (`AUTO` / `MANUAL` / `REASSIGNMENT`),
  outcome (`ASSIGNED` / `NO_ELIGIBLE_AGENT` / `SKIPPED`), score, distance, reason and the
  ranked pool; `status_history` records the same event in the lifecycle trail.

---

## 7. Edge cases and how they are handled

| Situation | Behaviour |
|-----------|-----------|
| **No registered agents** | Attempt logged: *"No collection agents are registered in the system"*; the request stays `REQUESTED` and can be retried |
| **No eligible agent** | Attempt logged with the pool and per-candidate exclusion reasons; the request stays `REQUESTED`. The admin dashboard surfaces these as *needs attention* |
| **Missing coordinates** | Falls back to PIN-code centroid → same city → neutral `0.50`; eligibility is never decided by an unknown distance |
| **Estimated weight unknown** | The vehicle-capacity filter is skipped (weights are measured at the centre anyway) |
| **Agent declines** | `POST /api/pickups/:id/decline` releases the agent's slot, logs `SKIPPED` with the reason, returns the request to `REQUESTED` for reassignment |
| **Collection fails** | `POST /api/pickups/:id/fail` records the reason, releases the slot and returns the request to the pool; the failure is visible in `assignment_logs` and analytics |
| **Reassignment** | `POST /api/pickups/:id/assign` with `force: true` (ADMIN only, or staff for a request that has not been accepted) releases the previous agent's slot and re-runs the engine; `method: REASSIGNMENT` is recorded |
| **Manual assignment** | `method: MANUAL` with an `agentId` still runs the eligibility filters — an ineligible agent is refused with `409`, so the rules cannot be bypassed silently |
| **Request already collected** | Assignment is refused (`409`); the state machine is the single source of truth |

---

## 8. Why not AI?

The course and project briefs explicitly exclude unnecessary AI/ML. Beyond that requirement,
a rule-based engine is the better engineering choice here:

* **Auditable** — "why this agent?" has a numeric, reproducible answer, which matters when the
  decision affects a citizen's collection and an agent's workload.
* **Testable** — every rule is a pure function with unit tests; there is no accuracy metric to
  tune and no drift over time.
* **Explainable to operators** — a coordinator can re-tune four weights and immediately
  reproduce the effect with the dry-run preview.
* **No external dependency** — no paid API, no hosted model, no data-protection surface for
  citizen addresses.

Deliberate omissions, and why:

| Not included | Reason |
|--------------|--------|
| Live traffic / travel time | Requires a paid routing API; the brief forbids paid credits |
| Historical acceptance probability per agent | Would require a model and enough data to avoid bias; the reliability rating already captures service quality |
| Fuel cost optimisation | Needs vehicle telemetry and current fuel prices |
| Time-of-day routing windows | Would need traffic data; the `time_slot` preference is honoured operationally by the agent |

---

## 9. Extending the engine

The design keeps the scoring core pure, so extensions are additive:

1. **New factor** — add it to `scoreCandidate()` with a `clamp01` normalisation, add a weight to
   `env.ts`, and extend the unit tests. The API preview payload and the UI pick up new
   components automatically once the shape is returned.
2. **New distance source** — e.g. a customer-provided geocoder: resolve it in
   `resolveRequestLocation()` and add the enum member to `DistanceSource`.
3. **Per-centre weight profiles** — move the weights from the environment into a
   `center_settings` table and load them per request; the scoring function already accepts a
   `config` argument.
4. **Slot-based availability** — replace `max_daily_pickups` with a per-slot capacity table;
   the hard filter is a single predicate.

---

## 10. Tests that pin this behaviour

| Test file | What it proves |
|-----------|----------------|
| `backend/tests/unit/assignment.test.ts` | Each hard filter; distance, workload, reliability and capacity maths; the neutral reliability default; weight re-normalisation; the full tie-break order |
| `backend/tests/integration/guards.test.ts` | No-eligible-agent path stays unassigned and logs the attempt; manual assignment to an ineligible agent is refused; reassignment releases the previous agent's slot; assignment of a collected request is refused |
| `backend/tests/integration/lifecycle.test.ts` | The assignment produced by a live `AUTO` run flows correctly into acceptance, collection and receipt |
| `backend/tests/integration/admin.test.ts` | Assignment statistics and the audit trail are exposed to administrators and match the underlying rows |
