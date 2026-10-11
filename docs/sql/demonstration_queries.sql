-- =====================================================================================
--  EcoCycle — SQL demonstration queries
-- =====================================================================================
--  Database : PostgreSQL 14+ (developed on 17)
--  Schema   : created by the Prisma migrations in backend/prisma/migrations
--
--  How to run
--  ----------
--    psql "postgresql://ecocycle:YOUR_PASSWORD@localhost:5432/ecocycle_dev" -f docs/sql/demonstration_queries.sql
--  or paste sections into psql / pgAdmin / DBeaver.
--
--  The file is organised as:
--    A. Joins across the lifecycle
--    B. Aggregation and grouping
--    C. Subqueries and CTEs
--    D. Window functions
--    E. Index rationale (with EXPLAIN guidance)
--    F. Transaction-based operations (the same shape the API uses)
--    G. Constraint and trigger behaviour
--    H. Reporting views
--
--  Every statement is read-only unless it is inside section F or G.
-- =====================================================================================


-- *************************************************************************************
-- A. JOINS ACROSS THE LIFECYCLE
-- *************************************************************************************

-- A.1  The complete story of one item: owner, category, pickup, agent, centre, inspection,
--      batch and recycler. Eight tables joined from the item outwards.
SELECT i.item_code,
       i.name                             AS item,
       c.name                             AS category,
       c.hazard_level,
       owner.full_name                    AS owner,
       pr.request_code                    AS pickup_request,
       pr.status                          AS pickup_status,
       agent_user.full_name               AS agent,
       cc.name                            AS centre,
       ins.condition,
       ins.quality_grade,
       ins.processing_path,
       ins.actual_weight_kg,
       b.batch_code,
       rec_user.full_name                 AS recycler_contact,
       rp.organization_name               AS recycler_org,
       i.status                           AS item_status
FROM ewaste_items i
JOIN categories            c          ON c.id = i.category_id
JOIN users                 owner      ON owner.id = i.user_id
LEFT JOIN pickup_requests  pr         ON pr.id = i.pickup_request_id
LEFT JOIN agent_profiles   ap         ON ap.id = pr.agent_id
LEFT JOIN users            agent_user ON agent_user.id = ap.user_id
LEFT JOIN collection_centers cc       ON cc.id = i.center_id
LEFT JOIN inspections      ins        ON ins.item_id = i.id
LEFT JOIN batch_items      bi         ON bi.item_id = i.id
LEFT JOIN processing_batches b        ON b.id = bi.batch_id
LEFT JOIN users            rec_user   ON rec_user.id = b.recycler_id
LEFT JOIN recycler_profiles rp        ON rp.user_id = rec_user.id
ORDER BY i.created_at DESC
LIMIT 25;

-- A.2  Open pickups with the agent who owns them and how much they are carrying.
--      LEFT JOIN keeps unassigned requests visible — those are the ones needing action.
SELECT pr.request_code,
       pr.status,
       pr.city,
       pr.preferred_date,
       pr.estimated_weight_kg,
       COALESCE(u.full_name, '— unassigned —')            AS agent,
       ap.current_load_count,
       ap.max_daily_pickups,
       (ap.current_load_count * 100.0 / NULLIF(ap.max_daily_pickups, 0))::numeric(5,1) AS load_pct,
       cc.name                                            AS destination_centre
FROM pickup_requests pr
LEFT JOIN agent_profiles ap ON ap.id = pr.agent_id
LEFT JOIN users u           ON u.id = ap.user_id
LEFT JOIN collection_centers cc ON cc.id = pr.center_id
WHERE pr.status IN ('REQUESTED', 'ASSIGNED', 'ACCEPTED', 'COLLECTED')
ORDER BY pr.preferred_date, pr.created_at;

-- A.3  Self-join: centres that are in the same city, useful for hub planning.
SELECT a.name AS centre_a, b.name AS centre_b, a.city
FROM collection_centers a
JOIN collection_centers b ON a.city = b.city AND a.id < b.id
ORDER BY a.city, a.name;

-- A.4  Agents and their centre, including agents with no centre (LEFT JOIN).
SELECT u.full_name, u.city AS agent_city, cc.name AS centre, cc.city AS centre_city,
       ap.is_available, ap.is_verified, ap.rating_avg
FROM agent_profiles ap
JOIN users u ON u.id = ap.user_id
LEFT JOIN collection_centers cc ON cc.id = ap.center_id
WHERE u.status = 'ACTIVE'
ORDER BY cc.name NULLS LAST, u.full_name;


-- *************************************************************************************
-- B. AGGREGATION AND GROUPING
-- *************************************************************************************

-- B.1  Material recovery per material type: total, average assay and estimated value.
SELECT rm.material_type,
       count(*)                                        AS records,
       sum(rm.quantity_kg)::numeric(12,3)              AS total_kg,
       round(avg(rm.purity_pct), 2)                    AS avg_purity_pct,
       sum(rm.quantity_kg * COALESCE(rm.market_value_per_kg, 0))::numeric(14,2) AS estimated_value
FROM recovered_materials rm
GROUP BY rm.material_type
ORDER BY total_kg DESC;

-- B.2  Centre performance: how much each centre received, inspected, batched and recovered.
SELECT cc.code,
       cc.name,
       count(DISTINCT i.id)                             AS items_received,
       count(DISTINCT ins.id)                           AS inspections,
       COALESCE(sum(DISTINCT ins.actual_weight_kg), 0)::numeric(12,3) AS inspected_kg,
       count(DISTINCT b.id)                             AS batches,
       count(DISTINCT CASE WHEN b.status = 'COMPLETED' THEN b.id END) AS completed_batches,
       COALESCE(sum(rm.quantity_kg), 0)::numeric(12,3)  AS recovered_kg
FROM collection_centers cc
LEFT JOIN ewaste_items      i   ON i.center_id   = cc.id
LEFT JOIN inspections       ins ON ins.center_id = cc.id
LEFT JOIN processing_batches b  ON b.center_id   = cc.id
LEFT JOIN recovered_materials rm ON rm.batch_id  = b.id
GROUP BY cc.id, cc.code, cc.name
ORDER BY recovered_kg DESC;

-- B.3  Monthly lifecycle activity. date_trunc gives a dense, correctly-ordered series.
SELECT to_char(date_trunc('month', i.created_at), 'YYYY-MM') AS month,
       count(*)                                              AS items_submitted,
       sum(i.quantity)                                       AS units,
       COALESCE(sum(i.estimated_weight_kg), 0)::numeric(12,3) AS declared_kg
FROM ewaste_items i
GROUP BY 1
ORDER BY 1;

-- B.4  Recovery yield per batch: recovered weight as a share of the weight that went in.
--      HAVING removes batches that have not produced any recovery yet.
SELECT b.batch_code,
       b.status,
       count(bi.id)                                     AS items,
       COALESCE(sum(bi.weight_at_addition_kg), 0)::numeric(12,3) AS input_kg,
       COALESCE(sum(rm.quantity_kg), 0)::numeric(12,3)           AS recovered_kg,
       round(100.0 * COALESCE(sum(rm.quantity_kg), 0) / NULLIF(sum(bi.weight_at_addition_kg), 0), 2) AS yield_pct
FROM processing_batches b
LEFT JOIN batch_items        bi ON bi.batch_id = b.id
LEFT JOIN recovered_materials rm ON rm.batch_id = b.id
GROUP BY b.id, b.batch_code, b.status
HAVING COALESCE(sum(rm.quantity_kg), 0) > 0
ORDER BY yield_pct DESC NULLS LAST;

-- B.5  Fleet utilisation, including the unused capacity per agent.
SELECT u.full_name,
       ap.current_load_count || ' / ' || ap.max_daily_pickups AS load,
       ap.max_daily_pickups - ap.current_load_count           AS free_slots,
       count(pr.id) FILTER (WHERE pr.status IN ('COLLECTED', 'RECEIVED_AT_CENTER')) AS completed_pickups,
       count(pr.id) FILTER (WHERE pr.status = 'FAILED')       AS failed_pickups
FROM agent_profiles ap
JOIN users u ON u.id = ap.user_id
LEFT JOIN pickup_requests pr ON pr.agent_id = ap.id
GROUP BY u.full_name, ap.current_load_count, ap.max_daily_pickups
ORDER BY free_slots DESC;

-- B.6  Inspection outcome mix per centre (conditional aggregation instead of several queries).
SELECT cc.code,
       count(*)                                                  AS inspections,
       count(*) FILTER (WHERE ins.processing_path = 'REFURBISHMENT')      AS refurbish,
       count(*) FILTER (WHERE ins.processing_path = 'COMPONENT_RECOVERY') AS component,
       count(*) FILTER (WHERE ins.processing_path = 'MATERIAL_RECOVERY')  AS material,
       count(*) FILTER (WHERE ins.processing_path = 'DISPOSAL')           AS disposal,
       count(*) FILTER (WHERE ins.hazard_flag)                            AS hazard_flagged,
       round(avg(ins.quality_score), 1)                          AS avg_score
FROM inspections ins
JOIN collection_centers cc ON cc.id = ins.center_id
GROUP BY cc.code
ORDER BY inspections DESC;


-- *************************************************************************************
-- C. SUBQUERIES AND CTEs
-- *************************************************************************************

-- C.1  Items that are inspected but not yet batched, with the age of the inspection.
SELECT i.item_code, i.name, ins.processing_path, ins.actual_weight_kg,
       ins.inspected_at,
       now() - ins.inspected_at AS waiting_since
FROM ewaste_items i
JOIN inspections ins ON ins.item_id = i.id
WHERE i.status = 'INSPECTED'
  AND NOT EXISTS (SELECT 1 FROM batch_items bi WHERE bi.item_id = i.id)
ORDER BY ins.inspected_at;

-- C.2  Agents whose current load is above the fleet average (scalar subquery in the WHERE).
SELECT u.full_name, ap.current_load_count
FROM agent_profiles ap
JOIN users u ON u.id = ap.user_id
WHERE ap.current_load_count > (SELECT avg(current_load_count) FROM agent_profiles);

-- C.3  Centres that have never completed an inspection (NOT EXISTS is usually the clearest
--      and fastest formulation; a LEFT JOIN … IS NULL works too).
SELECT cc.code, cc.name, cc.city
FROM collection_centers cc
WHERE NOT EXISTS (SELECT 1 FROM inspections ins WHERE ins.center_id = cc.id);

-- C.4  Cycle times between lifecycle milestones for each pickup request.
--      LATERAL lets the CTE reference the outer row — one pass, no self-join on timestamps.
WITH milestones AS (
    SELECT pr.id,
           pr.request_code,
           pr.created_at,
           pr.assigned_at,
           pr.accepted_at,
           pr.collected_at,
           pr.received_at
    FROM pickup_requests pr
    WHERE pr.collected_at IS NOT NULL
)
SELECT request_code,
       round(EXTRACT(EPOCH FROM (assigned_at  - created_at ))  / 3600.0, 2) AS requested_to_assigned_h,
       round(EXTRACT(EPOCH FROM (accepted_at  - assigned_at))  / 3600.0, 2) AS assigned_to_accepted_h,
       round(EXTRACT(EPOCH FROM (collected_at - accepted_at))  / 3600.0, 2) AS accepted_to_collected_h,
       round(EXTRACT(EPOCH FROM (received_at  - collected_at)) / 3600.0, 2) AS collected_to_received_h,
       round(EXTRACT(EPOCH FROM (received_at  - created_at))   / 3600.0, 2) AS total_hours
FROM milestones
ORDER BY total_hours DESC
LIMIT 20;

-- C.5  Category mix with a subquery for the declared weight ranking.
SELECT c.name,
       c.hazard_level,
       c.default_path,
       (SELECT count(*) FROM ewaste_items i WHERE i.category_id = c.id)                  AS items,
       (SELECT COALESCE(sum(i.estimated_weight_kg), 0)
          FROM ewaste_items i WHERE i.category_id = c.id)::numeric(12,3)                AS declared_kg,
       (SELECT count(*) FROM inspections ins
          JOIN ewaste_items i2 ON i2.id = ins.item_id
        WHERE i2.category_id = c.id AND ins.hazard_flag)                                AS hazard_flagged
FROM categories c
ORDER BY items DESC;

-- C.6  LATERAL join: the gap between consecutive lifecycle events of one item, computed by
--      looking up the "next" event per row. LATERAL can reference the current row, which a
--      plain correlated subquery in the SELECT list cannot do as cleanly for several columns.
SELECT sh.id,
       sh.status,
       sh.created_at,
       nxt.status                                        AS next_status,
       round(EXTRACT(EPOCH FROM (nxt.created_at - sh.created_at)) / 3600.0, 2) AS hours_to_next
FROM status_history sh
LEFT JOIN LATERAL (
    SELECT sh2.status, sh2.created_at
    FROM status_history sh2
    WHERE sh2.item_id = sh.item_id
      AND sh.item_id IS NOT NULL
      AND sh2.created_at > sh.created_at
    ORDER BY sh2.created_at
    LIMIT 1
) nxt ON true
WHERE sh.item_id IS NOT NULL
ORDER BY sh.item_id, sh.created_at
LIMIT 30;

-- C.7  Recursive CTE.
--      This schema is flat — no table references itself — so a recursive walk over the real
--      data would have nothing to traverse. The construct is demonstrated below on a
--      generated series, which is the pattern to reuse if a hierarchy is ever added (for
--      example a component tree: a device containing parts containing materials).
WITH RECURSIVE steps(step_no, label) AS (
    SELECT 1, 'REQUESTED'::text
    UNION ALL
    SELECT step_no + 1,
           (ARRAY['ASSIGNED', 'ACCEPTED', 'COLLECTED', 'RECEIVED_AT_CENTER', 'INSPECTED', 'IN_BATCH', 'PROCESSING', 'RECYCLED'])[step_no]
    FROM steps
    WHERE step_no < 9
)
SELECT step_no, label FROM steps ORDER BY step_no;

-- C.8  Agents who failed at least one pickup, with the count and the most recent reason.
SELECT u.full_name,
       counts.failed,
       (SELECT pr.failure_reason
          FROM pickup_requests pr
         WHERE pr.agent_id = ap.id AND pr.status = 'FAILED'
         ORDER BY pr.created_at DESC LIMIT 1) AS latest_reason
FROM agent_profiles ap
JOIN users u ON u.id = ap.user_id
JOIN (SELECT agent_id, count(*) AS failed
      FROM pickup_requests
      WHERE status = 'FAILED'
      GROUP BY agent_id) counts ON counts.agent_id = ap.id
ORDER BY counts.failed DESC;


-- *************************************************************************************
-- D. WINDOW FUNCTIONS
-- *************************************************************************************

-- D.1  Rank agents inside their own centre by completed pickups (window partition).
SELECT cc.name AS centre,
       u.full_name,
       count(*) FILTER (WHERE pr.status IN ('COLLECTED', 'RECEIVED_AT_CENTER')) AS completed,
       rank() OVER (PARTITION BY cc.id
                    ORDER BY count(*) FILTER (WHERE pr.status IN ('COLLECTED', 'RECEIVED_AT_CENTER')) DESC) AS rank_in_centre
FROM pickup_requests pr
JOIN agent_profiles ap ON ap.id = pr.agent_id
JOIN users u ON u.id = ap.user_id
LEFT JOIN collection_centers cc ON cc.id = ap.center_id
GROUP BY cc.id, cc.name, u.full_name
ORDER BY centre, rank_in_centre;

-- D.2  Running total of recovered weight over time (frame clause).
SELECT day,
       daily_kg,
       sum(daily_kg) OVER (ORDER BY day)::numeric(12,3) AS cumulative_kg
FROM (
    SELECT date_trunc('day', recorded_at)::date AS day,
           sum(quantity_kg)                     AS daily_kg
    FROM recovered_materials
    GROUP BY 1
) per_day
ORDER BY day;

-- D.3  Per batch, each material's share of that batch's recovery.
SELECT b.batch_code,
       rm.material_type,
       rm.quantity_kg,
       round(100.0 * rm.quantity_kg / sum(rm.quantity_kg) OVER (PARTITION BY rm.batch_id), 2) AS share_pct
FROM recovered_materials rm
JOIN processing_batches b ON b.id = rm.batch_id
ORDER BY b.batch_code, share_pct DESC;

-- D.4  Latest event per request (DISTINCT ON — the idiomatic PostgreSQL "top 1 per group").
SELECT DISTINCT ON (sh.pickup_request_id)
       sh.pickup_request_id, sh.status, sh.note, sh.created_at
FROM status_history sh
WHERE sh.pickup_request_id IS NOT NULL
ORDER BY sh.pickup_request_id, sh.created_at DESC;


-- *************************************************************************************
-- E. INDEX RATIONALE
-- *************************************************************************************
--  The schema declares these indexes (see prisma/migrations). Each one exists because a
--  specific read path is hot. Run the queries below with EXPLAIN (ANALYZE, BUFFERS) to see
--  the planner choosing an Index Scan instead of a Sequential Scan once the table grows.
--
--  Index                                   | Serves
--  ----------------------------------------+-----------------------------------------------
--  ewaste_items_user_id_status_idx          | a citizen's item list filtered by status (E.1)
--  ewaste_items_status_center_id_idx        | the centre inspection queue (E.2)
--  pickup_requests_status_preferred_date_idx| the coordinator work queue ordered by date (E.3)
--  pickup_requests_agent_id_status_idx      | an agent's own assignments (E.4)
--  agent_profiles_is_available_current_load_count_idx | eligible-agent candidate scan (E.5)
--  recovered_materials_material_type_recorded_at_idx  | recovery analytics by material (E.6)
--  recycler_materials_gin_idx (GIN on the array)      | "which recyclers accept COPPER?" (E.7)
--  history_timeline_idx                     | timeline reads, newest first
--  *_open_idx (partial indexes)             | only the small set of rows that are still open
--  users_email_lower_key (unique on lower(email)) | case-insensitive login lookups

-- E.1
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, item_code, name, status
FROM ewaste_items
WHERE user_id = 1 AND status IN ('SUBMITTED', 'PICKUP_SCHEDULED')
ORDER BY created_at DESC;

-- E.2  Partial index demo: only unassigned/active requests are indexed, which keeps it small.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, request_code, preferred_date
FROM pickup_requests
WHERE status IN ('REQUESTED', 'ASSIGNED', 'ACCEPTED')
ORDER BY preferred_date;

-- E.3
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, request_code
FROM pickup_requests
WHERE status = 'REQUESTED'
ORDER BY preferred_date
LIMIT 20;

-- E.4
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, request_code, status
FROM pickup_requests
WHERE agent_id = 1 AND status IN ('ASSIGNED', 'ACCEPTED')
ORDER BY preferred_date;

-- E.5  The assignment engine's candidate scan: availability flag plus remaining capacity.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, user_id, current_load_count, max_daily_pickups
FROM agent_profiles
WHERE is_available AND is_verified AND current_load_count < max_daily_pickups;

-- E.6
EXPLAIN (ANALYZE, BUFFERS)
SELECT material_type, sum(quantity_kg)
FROM recovered_materials
WHERE recorded_at >= now() - interval '12 months'
GROUP BY material_type;

-- E.7  Array containment uses the GIN index (recyclers that accept copper).
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, organization_name
FROM recycler_profiles
WHERE accepted_materials @> ARRAY['COPPER']::"MaterialType"[]
  AND is_active;

-- E.8  Writing an index is only worth it if the read pattern is real. This query shows the
--      cost of a missing index for comparison (sequential scan on a filtered text column).
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, batch_code FROM processing_batches WHERE notes LIKE '%contamination%';


-- *************************************************************************************
-- F. TRANSACTION-BASED OPERATIONS
-- *************************************************************************************
--  These mirror what the API does inside `prisma.$transaction(...)`. They are written here
--  with explicit BEGIN/COMMIT so the behaviour can be inspected step by step.
--
--  Section F changes data: run it against a seeded development database (npm run db:seed)
--  and prefer a scratch copy if you want to keep the demo data pristine. The statements pick
--  their target rows with subqueries, so they work whatever the ids happen to be.
--
--  F.1  Receiving a pickup at a centre: advance the request, advance its items, write the
--       history rows — all or nothing.

BEGIN;

-- Pick a collected request that is still waiting for receipt, and the staff account that
-- would receive it at that centre.
CREATE TEMP TABLE _target AS
SELECT pr.id                        AS request_id,
       COALESCE(pr.center_id, (SELECT id FROM collection_centers ORDER BY id LIMIT 1)) AS center_id,
       (SELECT u.id FROM users u
         WHERE u.role = 'CENTER_STAFF' AND u.status = 'ACTIVE'
         ORDER BY u.id LIMIT 1)     AS actor_id
FROM pickup_requests pr
WHERE pr.status = 'COLLECTED'
ORDER BY pr.id
LIMIT 1;

-- Lock the request so a concurrent receipt cannot race with us.
SELECT id, status FROM pickup_requests WHERE id = (SELECT request_id FROM _target) FOR UPDATE;

UPDATE pickup_requests
   SET status       = 'RECEIVED_AT_CENTER',
       center_id    = COALESCE(center_id, (SELECT center_id FROM _target)),
       received_at  = now(),
       updated_at   = now()
 WHERE id = (SELECT request_id FROM _target)
   AND status = 'COLLECTED';          -- guard: only a collected request can be received

UPDATE ewaste_items
   SET status     = 'RECEIVED_AT_CENTER',
       center_id  = (SELECT center_id FROM _target),
       updated_at = now()
 WHERE pickup_request_id = (SELECT request_id FROM _target)
   AND status = 'COLLECTED';

INSERT INTO status_history (entity_type, pickup_request_id, status, note, actor_id, actor_role, created_at)
SELECT 'PICKUP_REQUEST', request_id, 'RECEIVED_AT_CENTER', 'Received at collection centre', actor_id, 'CENTER_STAFF', now()
FROM _target;

INSERT INTO status_history (entity_type, item_id, status, note, actor_id, actor_role, created_at)
SELECT 'EWASTE_ITEM', i.id, 'RECEIVED_AT_CENTER', 'Item received at centre', (SELECT actor_id FROM _target), 'CENTER_STAFF', now()
FROM ewaste_items i
WHERE i.pickup_request_id = (SELECT request_id FROM _target)
  AND i.status = 'RECEIVED_AT_CENTER';

COMMIT;
-- ROLLBACK;   -- use this instead of COMMIT while experimenting

-- F.2  Assignment: lock the request, move the load counter, and keep both consistent.
BEGIN;

SELECT id, status, agent_id FROM pickup_requests ORDER BY id LIMIT 1 FOR UPDATE;

-- Release the previous agent (reassignment) and claim a slot for the new one.
UPDATE agent_profiles
   SET current_load_count = GREATEST(current_load_count - 1, 0)
 WHERE id = (SELECT agent_id FROM pickup_requests WHERE status = 'ASSIGNED' ORDER BY id LIMIT 1);

UPDATE agent_profiles
   SET current_load_count = current_load_count + 1
 WHERE id = (SELECT id FROM agent_profiles
              WHERE is_available AND is_verified AND current_load_count < max_daily_pickups
              ORDER BY id LIMIT 1);

UPDATE pickup_requests
   SET agent_id = (SELECT id FROM agent_profiles ORDER BY id LIMIT 1),
       status   = 'ASSIGNED', assigned_at = now(), updated_at = now()
 WHERE id = (SELECT id FROM pickup_requests ORDER BY id LIMIT 1);

INSERT INTO assignment_logs (pickup_request_id, agent_id, assigned_by_id, method, outcome, score, distance_km, reason, created_at)
SELECT pr.id, ap.id, admin.id, 'REASSIGNMENT', 'ASSIGNED', 0.9292, 1.92,
       'Highest weighted score among eligible agents', now()
FROM (SELECT id FROM pickup_requests ORDER BY id LIMIT 1) pr,
     (SELECT id FROM agent_profiles ORDER BY id LIMIT 1) ap,
     (SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1) admin;

COMMIT;

-- F.3  Completing a batch and recording its recovery atomically.
BEGIN;

UPDATE processing_batches
   SET status = 'COMPLETED', completed_at = now(), updated_at = now()
 WHERE id = (SELECT id FROM processing_batches WHERE status = 'IN_PROGRESS' ORDER BY id LIMIT 1);

INSERT INTO recovered_materials (batch_id, recorded_by_id, material_type, quantity_kg, unit, purity_pct, market_value_per_kg, recorded_at)
SELECT b.id, b.recycler_id, 'COPPER', 1.200, 'KG', 95.00, 740.50, now()
FROM processing_batches b
WHERE b.status = 'IN_PROGRESS' AND b.recycler_id IS NOT NULL
ON CONFLICT (batch_id, material_type) DO NOTHING;   -- unique (batch_id, material_type)

INSERT INTO status_history (entity_type, batch_id, status, note, actor_id, actor_role, created_at)
SELECT 'PROCESSING_BATCH', b.id, 'COMPLETED', 'Batch completed with 1.200 kg copper recovered', b.recycler_id, 'RECYCLER', now()
FROM processing_batches b
WHERE b.status = 'COMPLETED'
LIMIT 1;

-- Any failure here (bad enum, negative quantity, missing recovery) aborts the whole unit:
-- ROLLBACK;
COMMIT;

-- F.4  Demonstrating atomicity: the second statement violates a CHECK constraint, so the
--      first statement is rolled back as well and the database is unchanged.
BEGIN;

UPDATE agent_profiles SET current_load_count = current_load_count + 1
 WHERE id = (SELECT id FROM agent_profiles ORDER BY id LIMIT 1);

-- This will fail: current_load_count may never exceed max_daily_pickups
UPDATE agent_profiles SET current_load_count = max_daily_pickups + 5
 WHERE id = (SELECT id FROM agent_profiles ORDER BY id LIMIT 1);

ROLLBACK;
-- After the ROLLBACK, verify that the counter is exactly as it was before:
SELECT id, current_load_count, max_daily_pickups FROM agent_profiles ORDER BY id LIMIT 1;

-- F.5  Isolating a reporting transaction so dashboards never see a half-finished write.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) AS items, (SELECT count(*) FROM pickup_requests) AS pickups FROM ewaste_items;
COMMIT;


-- *************************************************************************************
-- G. CONSTRAINT AND TRIGGER BEHAVIOUR
-- *************************************************************************************
--  The schema does not rely on application code alone. These examples demonstrate the
--  database refusing invalid data on its own.
--
--  Each statement below is expected to FAIL. Run them one at a time and read the error.

-- G.1  An inspection graded A with a score of 60 violates the grade/score band CHECK.
--      ERROR: new row for relation "inspections" violates check constraint "inspection_grade_band_chk"
UPDATE inspections SET quality_grade = 'A', quality_score = 60
 WHERE id = (SELECT id FROM inspections ORDER BY id LIMIT 1);

-- G.2  A repairable item may not be routed to disposal.
--      ERROR: violates check constraint "inspection_repairable_chk"
UPDATE inspections SET is_repairable = true, processing_path = 'DISPOSAL'
 WHERE id = (SELECT id FROM inspections ORDER BY id LIMIT 1);

-- G.3  A second inspection of the same item is impossible (unique index on item_id).
--      ERROR: duplicate key value violates unique constraint "inspections_item_id_key"
INSERT INTO inspections (item_id, center_id, inspected_by_id, condition, quality_score, quality_grade,
                         processing_path, actual_weight_kg, is_repairable, hazard_flag,
                         data_wipe_required, data_wipe_done, inspected_at, created_at, updated_at)
SELECT ins.item_id, ins.center_id, ins.inspected_by_id, 'FAULTY', 55, 'C', 'MATERIAL_RECOVERY',
       1.5, false, false, true, false, now(), now(), now()
FROM inspections ins
ORDER BY ins.id LIMIT 1;

-- G.4  The same item cannot appear in two batches (unique index on batch_items.item_id).
--      ERROR: duplicate key value violates unique constraint "batch_items_item_id_key"
INSERT INTO batch_items (batch_id, item_id, added_at)
SELECT bi.batch_id, bi.item_id, now() FROM batch_items bi ORDER BY bi.id LIMIT 1;

-- G.5  A batch cannot carry two recovery rows for the same material
--      (unique constraint on recovered_materials (batch_id, material_type)).
INSERT INTO recovered_materials (batch_id, recorded_by_id, material_type, quantity_kg, unit, recorded_at)
SELECT rm.batch_id, rm.recorded_by_id, rm.material_type, 0.5, 'KG', now()
FROM recovered_materials rm
ORDER BY rm.id LIMIT 1;

-- G.6  Status history rows must point at exactly one parent record.
--      ERROR: violates check constraint "history_single_parent_chk"
INSERT INTO status_history (entity_type, item_id, pickup_request_id, status, created_at)
SELECT 'EWASTE_ITEM', i.id, pr.id, 'INSPECTED', now()
FROM ewaste_items i, pickup_requests pr
ORDER BY i.id, pr.id LIMIT 1;

-- G.7  A pickup in status ASSIGNED must reference an agent.
--      ERROR: violates check constraint "pickup_agent_required_chk"
UPDATE pickup_requests SET status = 'ASSIGNED', agent_id = NULL
 WHERE id = (SELECT id FROM pickup_requests ORDER BY id LIMIT 1);

-- G.8  The audit trail is append-only: an UPDATE is rejected by the trigger.
--      ERROR: status_history rows are append-only and cannot be modified
UPDATE status_history SET note = 'tampered'
 WHERE id = (SELECT id FROM status_history ORDER BY id LIMIT 1);

-- G.9  Email addresses are stored lower-cased, enforced by a CHECK constraint.
INSERT INTO users (email, password_hash, full_name, role, status, created_at, updated_at)
VALUES ('MixedCase@Example.test', 'x', 'Bad Case', 'USER', 'ACTIVE', now(), now());

-- G.10 The role/profile triggers keep the two tables consistent: an agent profile can only
--      belong to a COLLECTION_AGENT user, so pointing one at a citizen fails.
INSERT INTO agent_profiles (user_id, vehicle_capacity_kg, max_daily_pickups, is_available, is_verified, current_load_count, rating_avg, created_at, updated_at)
SELECT u.id, 50, 10, true, true, 0, 5.0, now(), now()
FROM users u
WHERE u.role <> 'COLLECTION_AGENT'
  AND NOT EXISTS (SELECT 1 FROM agent_profiles ap WHERE ap.user_id = u.id)
ORDER BY u.id
LIMIT 1;


-- *************************************************************************************
-- H. REPORTING VIEWS
-- *************************************************************************************
--  Views are convenient for dashboards and for handing analysts a stable, read-only shape.
--  Create them in a scratch database or a migration of your own — the application does not
--  depend on them, and Prisma migrations do not manage them.

DROP VIEW IF EXISTS vw_item_lifecycle;
CREATE VIEW vw_item_lifecycle AS
SELECT i.id,
       i.item_code,
       i.name                              AS item_name,
       i.status                            AS item_status,
       c.name                              AS category,
       c.hazard_level,
       owner.full_name                     AS owner,
       pr.request_code,
       pr.status                           AS pickup_status,
       agent_user.full_name                AS agent,
       cc.code                             AS centre_code,
       ins.quality_grade,
       ins.processing_path,
       ins.actual_weight_kg,
       b.batch_code,
       b.status                            AS batch_status,
       rp.organization_name                AS recycler,
       COALESCE(rm_sum.recovered_kg, 0)    AS recovered_kg
FROM ewaste_items i
JOIN categories c ON c.id = i.category_id
JOIN users owner ON owner.id = i.user_id
LEFT JOIN pickup_requests pr ON pr.id = i.pickup_request_id
LEFT JOIN agent_profiles ap ON ap.id = pr.agent_id
LEFT JOIN users agent_user ON agent_user.id = ap.user_id
LEFT JOIN collection_centers cc ON cc.id = i.center_id
LEFT JOIN inspections ins ON ins.item_id = i.id
LEFT JOIN batch_items bi ON bi.item_id = i.id
LEFT JOIN processing_batches b ON b.id = bi.batch_id
LEFT JOIN users rec_user ON rec_user.id = b.recycler_id
LEFT JOIN recycler_profiles rp ON rp.user_id = rec_user.id
LEFT JOIN (SELECT batch_id, sum(quantity_kg) AS recovered_kg
             FROM recovered_materials GROUP BY batch_id) rm_sum ON rm_sum.batch_id = b.id;

-- A dashboard query becomes trivial:
SELECT centre_code, count(*) AS items, sum(recovered_kg)::numeric(12,3) AS recovered_kg
FROM vw_item_lifecycle
GROUP BY centre_code
ORDER BY recovered_kg DESC NULLS LAST;

-- Materialised view for expensive aggregates: refresh on a schedule.
DROP MATERIALIZED VIEW IF EXISTS mv_centre_monthly;
CREATE MATERIALIZED VIEW mv_centre_monthly AS
SELECT cc.id AS center_id,
       cc.code AS center_code,
       date_trunc('month', i.created_at)::date AS month,
       count(DISTINCT i.id) AS items,
       COALESCE(sum(ins.actual_weight_kg), 0) AS inspected_kg,
       COALESCE(sum(rm.quantity_kg), 0)       AS recovered_kg
FROM collection_centers cc
LEFT JOIN ewaste_items i ON i.center_id = cc.id
LEFT JOIN inspections ins ON ins.center_id = cc.id
LEFT JOIN processing_batches b ON b.center_id = cc.id
LEFT JOIN recovered_materials rm ON rm.batch_id = b.id
GROUP BY cc.id, cc.code, date_trunc('month', i.created_at);

CREATE UNIQUE INDEX mv_centre_monthly_key ON mv_centre_monthly (center_id, month);
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_centre_monthly;

SELECT * FROM mv_centre_monthly ORDER BY month DESC, recovered_kg DESC;

-- Clean-up (optional):
-- DROP MATERIALIZED VIEW IF EXISTS mv_centre_monthly;
-- DROP VIEW IF EXISTS vw_item_lifecycle;
