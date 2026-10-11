-- =====================================================================================
--  EcoCycle — integrity hardening migration
-- =====================================================================================
--  Prisma's schema DSL cannot express domain CHECK constraints, partial indexes,
--  functional indexes or cross-table invariants that require a trigger. This migration
--  adds them on top of the generated DDL so that the *database itself* refuses to store
--  corrupt lifecycle data, independently of the application layer.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. users
-- -------------------------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_chk"  CHECK (email = lower(email)),
  ADD CONSTRAINT "users_full_name_len_chk"    CHECK (char_length(btrim(full_name)) >= 2),
  ADD CONSTRAINT "users_latitude_chk"         CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
  ADD CONSTRAINT "users_longitude_chk"        CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  ADD CONSTRAINT "users_phone_chk"            CHECK (phone IS NULL OR phone ~ '^\+?[0-9 ()\-]{7,20}$');

-- Functional unique index: e-mail uniqueness is case-insensitive even if a client
-- bypasses the API normalisation.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower(email));

-- -------------------------------------------------------------------------------------
-- 2. collection_centers
-- -------------------------------------------------------------------------------------
ALTER TABLE "collection_centers"
  ADD CONSTRAINT "centers_capacity_chk"  CHECK (capacity_kg > 0),
  ADD CONSTRAINT "centers_latitude_chk"  CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
  ADD CONSTRAINT "centers_longitude_chk" CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  ADD CONSTRAINT "centers_pincode_chk"   CHECK (pincode ~ '^[0-9A-Za-z\- ]{4,12}$');

-- -------------------------------------------------------------------------------------
-- 3. categories
-- -------------------------------------------------------------------------------------
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_hazard_level_chk" CHECK (hazard_level BETWEEN 1 AND 5);

-- -------------------------------------------------------------------------------------
-- 4. agent_profiles
-- -------------------------------------------------------------------------------------
ALTER TABLE "agent_profiles"
  ADD CONSTRAINT "agent_capacity_chk"     CHECK (vehicle_capacity_kg > 0),
  ADD CONSTRAINT "agent_load_chk"         CHECK (current_load_count >= 0),
  ADD CONSTRAINT "agent_max_daily_chk"    CHECK (max_daily_pickups > 0),
  ADD CONSTRAINT "agent_rating_chk"       CHECK (rating_avg >= 0 AND rating_avg <= 5),
  -- An agent may never be handed more open pickups than their declared daily maximum.
  ADD CONSTRAINT "agent_load_within_max_chk" CHECK (current_load_count <= max_daily_pickups);

-- -------------------------------------------------------------------------------------
-- 5. recycler_profiles
-- -------------------------------------------------------------------------------------
ALTER TABLE "recycler_profiles"
  ADD CONSTRAINT "recycler_capacity_chk" CHECK (max_capacity_kg > 0),
  ADD CONSTRAINT "recycler_materials_chk" CHECK (cardinality(accepted_materials) >= 1);

-- GIN index: lets the assignment/analytics layer ask "which recyclers accept copper?"
-- without scanning every row.
CREATE INDEX "recycler_materials_gin_idx" ON "recycler_profiles" USING GIN (accepted_materials);

-- -------------------------------------------------------------------------------------
-- 6. pickup_requests
-- -------------------------------------------------------------------------------------
ALTER TABLE "pickup_requests"
  ADD CONSTRAINT "pickup_latitude_chk"   CHECK (latitude  IS NULL OR (latitude  BETWEEN -90  AND 90)),
  ADD CONSTRAINT "pickup_longitude_chk"  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  ADD CONSTRAINT "pickup_pincode_chk"    CHECK (pincode ~ '^[0-9A-Za-z\- ]{4,12}$'),
  ADD CONSTRAINT "pickup_est_weight_chk" CHECK (estimated_weight_kg IS NULL OR estimated_weight_kg > 0),
  ADD CONSTRAINT "pickup_coll_weight_chk" CHECK (collected_weight_kg IS NULL OR collected_weight_kg > 0),
  -- A request can only have advanced past REQUESTED if an agent is attached.
  ADD CONSTRAINT "pickup_agent_required_chk" CHECK (
    status NOT IN ('ASSIGNED', 'ACCEPTED', 'COLLECTED', 'RECEIVED_AT_CENTER') OR agent_id IS NOT NULL
  ),
  -- COLLECTED implies a collection timestamp; RECEIVED_AT_CENTER implies a receipt timestamp.
  ADD CONSTRAINT "pickup_timestamps_chk" CHECK (
    (status <> 'COLLECTED' OR collected_at IS NOT NULL) AND
    (status <> 'RECEIVED_AT_CENTER' OR (collected_at IS NOT NULL AND received_at IS NOT NULL))
  ),
  ADD CONSTRAINT "pickup_cancelled_chk" CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL);

-- Partial index: the agent dashboards and the assignment engine only ever scan *open*
-- requests, which are a small fraction of the table. Keeping the index partial keeps it
-- small and hot in cache.
CREATE INDEX "pickup_open_idx"
  ON "pickup_requests" (status, preferred_date)
  WHERE status IN ('REQUESTED', 'ASSIGNED', 'ACCEPTED', 'COLLECTED');

CREATE INDEX "pickup_user_created_idx" ON "pickup_requests" (user_id, created_at DESC);

-- -------------------------------------------------------------------------------------
-- 7. ewaste_items
-- -------------------------------------------------------------------------------------
ALTER TABLE "ewaste_items"
  ADD CONSTRAINT "item_quantity_chk"    CHECK (quantity > 0 AND quantity <= 10000),
  ADD CONSTRAINT "item_est_weight_chk"  CHECK (estimated_weight_kg IS NULL OR estimated_weight_kg > 0),
  -- Items physically at a centre must have a centre recorded.
  ADD CONSTRAINT "item_center_required_chk" CHECK (
    status NOT IN ('RECEIVED_AT_CENTER', 'INSPECTED', 'IN_BATCH', 'PROCESSING', 'RECYCLED') OR center_id IS NOT NULL
  );

CREATE INDEX "item_user_created_idx" ON "ewaste_items" (user_id, created_at DESC);
CREATE INDEX "item_open_idx" ON "ewaste_items" (status)
  WHERE status NOT IN ('RECYCLED', 'CANCELLED', 'REJECTED');

-- -------------------------------------------------------------------------------------
-- 8. status_history — append-only trail
-- -------------------------------------------------------------------------------------
-- "Exactly one parent" invariant: a history row describes a pickup request XOR an item
-- XOR a batch. This is the relational alternative to a polymorphic child table.
ALTER TABLE "status_history"
  ADD CONSTRAINT "history_single_parent_chk"
    CHECK (num_nonnulls(pickup_request_id, item_id, batch_id) = 1),
  ADD CONSTRAINT "history_entity_matches_chk" CHECK (
    (entity_type = 'PICKUP_REQUEST' AND pickup_request_id IS NOT NULL) OR
    (entity_type = 'EWASTE_ITEM'    AND item_id          IS NOT NULL) OR
    (entity_type = 'PROCESSING_BATCH' AND batch_id       IS NOT NULL)
  ),
  ADD CONSTRAINT "history_status_len_chk" CHECK (char_length(status) BETWEEN 2 AND 40);

CREATE INDEX "history_timeline_idx" ON "status_history" (created_at DESC);

-- The audit trail must be append-only. Any UPDATE or DELETE attempt is rejected loudly
-- rather than silently corrupting the lifecycle record.
CREATE OR REPLACE FUNCTION ecocycle_block_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'status_history is append-only (attempted % on row id=%)', TG_OP, COALESCE(OLD.id, NEW.id)
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER status_history_append_only
  BEFORE UPDATE OR DELETE ON "status_history"
  FOR EACH ROW EXECUTE FUNCTION ecocycle_block_history_mutation();

-- -------------------------------------------------------------------------------------
-- 9. inspections — grade must agree with the measured quality score
-- -------------------------------------------------------------------------------------
ALTER TABLE "inspections"
  ADD CONSTRAINT "inspection_score_chk" CHECK (quality_score BETWEEN 0 AND 100),
  ADD CONSTRAINT "inspection_weight_chk" CHECK (actual_weight_kg > 0),
  ADD CONSTRAINT "inspection_grade_band_chk" CHECK (
    (quality_grade = 'A' AND quality_score BETWEEN 85 AND 100) OR
    (quality_grade = 'B' AND quality_score BETWEEN 70 AND 84)  OR
    (quality_grade = 'C' AND quality_score BETWEEN 50 AND 69)  OR
    (quality_grade = 'D' AND quality_score BETWEEN 0  AND 49)
  ),
  -- DISPOSAL is the only path where the item is not expected to be repairable.
  ADD CONSTRAINT "inspection_repairable_chk" CHECK (NOT is_repairable OR processing_path <> 'DISPOSAL');

-- -------------------------------------------------------------------------------------
-- 10. processing_batches
-- -------------------------------------------------------------------------------------
ALTER TABLE "processing_batches"
  ADD CONSTRAINT "batch_target_weight_chk" CHECK (target_weight_kg IS NULL OR target_weight_kg > 0),
  ADD CONSTRAINT "batch_actual_weight_chk" CHECK (actual_weight_kg IS NULL OR actual_weight_kg > 0),
  -- A batch that has left DRAFT must name a recycler.
  ADD CONSTRAINT "batch_recycler_required_chk" CHECK (
    status NOT IN ('RELEASED', 'IN_PROGRESS', 'COMPLETED') OR recycler_id IS NOT NULL
  ),
  ADD CONSTRAINT "batch_release_ts_chk" CHECK (
    status NOT IN ('RELEASED', 'IN_PROGRESS', 'COMPLETED') OR released_at IS NOT NULL
  ),
  ADD CONSTRAINT "batch_completed_ts_chk" CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL),
  ADD CONSTRAINT "batch_started_ts_chk"   CHECK (status <> 'IN_PROGRESS' OR started_at IS NOT NULL)
;

CREATE INDEX "batch_open_idx" ON "processing_batches" (status, center_id)
  WHERE status IN ('DRAFT', 'READY');

-- -------------------------------------------------------------------------------------
-- 11. batch_items
-- -------------------------------------------------------------------------------------
ALTER TABLE "batch_items"
  ADD CONSTRAINT "batch_item_weight_chk" CHECK (weight_at_addition_kg IS NULL OR weight_at_addition_kg > 0);

-- -------------------------------------------------------------------------------------
-- 12. recovered_materials
-- -------------------------------------------------------------------------------------
ALTER TABLE "recovered_materials"
  ADD CONSTRAINT "recovery_quantity_chk" CHECK (quantity_kg > 0),
  ADD CONSTRAINT "recovery_purity_chk"   CHECK (purity_pct IS NULL OR (purity_pct > 0 AND purity_pct <= 100)),
  ADD CONSTRAINT "recovery_value_chk"    CHECK (market_value_per_kg IS NULL OR market_value_per_kg >= 0);

-- -------------------------------------------------------------------------------------
-- 13. Cross-table invariant: a profile may only extend a user holding the matching role.
--     A CHECK constraint cannot reference another table, so this uses triggers.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ecocycle_assert_profile_role() RETURNS trigger AS $$
DECLARE
  required_role "Role";
  actual_role   "Role";
BEGIN
  required_role := CASE TG_TABLE_NAME
                     WHEN 'agent_profiles'    THEN 'COLLECTION_AGENT'::"Role"
                     WHEN 'recycler_profiles' THEN 'RECYCLER'::"Role"
                   END;

  SELECT role INTO actual_role FROM "users" WHERE id = NEW.user_id;

  IF actual_role IS NULL THEN
    RAISE EXCEPTION 'user % does not exist', NEW.user_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF actual_role <> required_role THEN
    RAISE EXCEPTION 'user % has role % but a % profile requires role %',
      NEW.user_id, actual_role, TG_TABLE_NAME, required_role USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_profile_role_guard
  BEFORE INSERT OR UPDATE OF user_id ON "agent_profiles"
  FOR EACH ROW EXECUTE FUNCTION ecocycle_assert_profile_role();

CREATE TRIGGER recycler_profile_role_guard
  BEFORE INSERT OR UPDATE OF user_id ON "recycler_profiles"
  FOR EACH ROW EXECUTE FUNCTION ecocycle_assert_profile_role();

-- The reverse direction: once a privileged profile exists, the user's role may not be
-- demoted to something incompatible (e.g. COLLECTION_AGENT -> USER while pickups are open).
CREATE OR REPLACE FUNCTION ecocycle_assert_user_role_change() RETURNS trigger AS $$
BEGIN
  IF NEW.role = OLD.role THEN
    RETURN NEW;
  END IF;

  IF OLD.role = 'COLLECTION_AGENT' AND NEW.role <> 'COLLECTION_AGENT'
     AND EXISTS (SELECT 1 FROM "agent_profiles" WHERE user_id = NEW.id) THEN
    RAISE EXCEPTION 'cannot change role of user %: an agent profile exists (delete it first)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.role = 'RECYCLER' AND NEW.role <> 'RECYCLER'
     AND EXISTS (SELECT 1 FROM "recycler_profiles" WHERE user_id = NEW.id) THEN
    RAISE EXCEPTION 'cannot change role of user %: a recycler profile exists (delete it first)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_role_guard
  BEFORE UPDATE OF role ON "users"
  FOR EACH ROW EXECUTE FUNCTION ecocycle_assert_user_role_change();
