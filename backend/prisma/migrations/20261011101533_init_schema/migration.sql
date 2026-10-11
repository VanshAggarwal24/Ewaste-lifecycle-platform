-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'COLLECTION_AGENT', 'CENTER_STAFF', 'RECYCLER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CenterStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "PickupStatus" AS ENUM ('REQUESTED', 'ASSIGNED', 'ACCEPTED', 'COLLECTED', 'RECEIVED_AT_CENTER', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('SUBMITTED', 'PICKUP_SCHEDULED', 'COLLECTED', 'RECEIVED_AT_CENTER', 'INSPECTED', 'IN_BATCH', 'PROCESSING', 'RECYCLED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('WORKING', 'REPAIRABLE', 'FAULTY', 'SEVERELY_DAMAGED');

-- CreateEnum
CREATE TYPE "QualityGrade" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "ProcessingPath" AS ENUM ('REFURBISHMENT', 'COMPONENT_RECOVERY', 'MATERIAL_RECOVERY', 'DISPOSAL');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'READY', 'RELEASED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('COPPER', 'ALUMINIUM', 'STEEL', 'GOLD', 'SILVER', 'PALLADIUM', 'PLASTIC', 'GLASS', 'BATTERY_CHEMICALS', 'RARE_EARTH', 'OTHER');

-- CreateEnum
CREATE TYPE "LifecycleEntity" AS ENUM ('PICKUP_REQUEST', 'EWASTE_ITEM', 'PROCESSING_BATCH');

-- CreateEnum
CREATE TYPE "AssignmentMethod" AS ENUM ('AUTO', 'MANUAL', 'REASSIGNMENT');

-- CreateEnum
CREATE TYPE "AssignmentOutcome" AS ENUM ('ASSIGNED', 'NO_ELIGIBLE_AGENT', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20),
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "address_line" VARCHAR(255),
    "city" VARCHAR(80),
    "state" VARCHAR(80),
    "pincode" VARCHAR(12),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "staffed_center_id" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "center_id" INTEGER,
    "vehicle_type" VARCHAR(40),
    "vehicle_capacity_kg" DECIMAL(8,2) NOT NULL DEFAULT 50,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "current_load_count" INTEGER NOT NULL DEFAULT 0,
    "max_daily_pickups" INTEGER NOT NULL DEFAULT 10,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recycler_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "organization_name" VARCHAR(160) NOT NULL,
    "license_number" VARCHAR(60) NOT NULL,
    "accepted_materials" "MaterialType"[],
    "max_capacity_kg" DECIMAL(10,2) NOT NULL DEFAULT 1000,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "contact_phone" VARCHAR(20),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recycler_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_centers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "address_line" VARCHAR(255) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "state" VARCHAR(80) NOT NULL,
    "pincode" VARCHAR(12) NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "capacity_kg" DECIMAL(12,2) NOT NULL DEFAULT 5000,
    "status" "CenterStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collection_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "description" VARCHAR(400),
    "hazard_level" INTEGER NOT NULL DEFAULT 1,
    "default_path" "ProcessingPath" NOT NULL DEFAULT 'MATERIAL_RECOVERY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_requests" (
    "id" SERIAL NOT NULL,
    "request_code" VARCHAR(30) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "agent_id" INTEGER,
    "center_id" INTEGER,
    "category_id" INTEGER,
    "status" "PickupStatus" NOT NULL DEFAULT 'REQUESTED',
    "address_line" VARCHAR(255) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "state" VARCHAR(80) NOT NULL,
    "pincode" VARCHAR(12) NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "preferred_date" DATE NOT NULL,
    "time_slot" VARCHAR(40),
    "notes" VARCHAR(500),
    "estimated_weight_kg" DECIMAL(10,3),
    "assigned_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "collected_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "failure_reason" VARCHAR(400),
    "collected_weight_kg" DECIMAL(10,3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pickup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ewaste_items" (
    "id" SERIAL NOT NULL,
    "item_code" VARCHAR(30) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "pickup_request_id" INTEGER,
    "category_id" INTEGER NOT NULL,
    "center_id" INTEGER,
    "name" VARCHAR(160) NOT NULL,
    "brand" VARCHAR(80),
    "model_number" VARCHAR(80),
    "serial_number" VARCHAR(80),
    "description" VARCHAR(600),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "estimated_weight_kg" DECIMAL(10,3),
    "status" "ItemStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ewaste_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" SERIAL NOT NULL,
    "entity_type" "LifecycleEntity" NOT NULL,
    "pickup_request_id" INTEGER,
    "item_id" INTEGER,
    "batch_id" INTEGER,
    "status" VARCHAR(40) NOT NULL,
    "note" VARCHAR(500),
    "actor_id" INTEGER,
    "actor_role" "Role",
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_logs" (
    "id" SERIAL NOT NULL,
    "pickup_request_id" INTEGER NOT NULL,
    "agent_id" INTEGER,
    "assigned_by_id" INTEGER,
    "method" "AssignmentMethod" NOT NULL DEFAULT 'AUTO',
    "outcome" "AssignmentOutcome" NOT NULL DEFAULT 'ASSIGNED',
    "score" DECIMAL(8,4),
    "distance_km" DECIMAL(8,2),
    "reason" VARCHAR(600) NOT NULL,
    "candidates" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "center_id" INTEGER,
    "inspected_by_id" INTEGER,
    "condition" "ItemCondition" NOT NULL DEFAULT 'FAULTY',
    "quality_score" INTEGER NOT NULL,
    "quality_grade" "QualityGrade" NOT NULL,
    "processing_path" "ProcessingPath" NOT NULL,
    "actual_weight_kg" DECIMAL(10,3) NOT NULL,
    "is_repairable" BOOLEAN NOT NULL DEFAULT false,
    "hazard_flag" BOOLEAN NOT NULL DEFAULT false,
    "data_wipe_required" BOOLEAN NOT NULL DEFAULT true,
    "data_wipe_done" BOOLEAN NOT NULL DEFAULT false,
    "remarks" VARCHAR(600),
    "inspected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_batches" (
    "id" SERIAL NOT NULL,
    "batch_code" VARCHAR(30) NOT NULL,
    "center_id" INTEGER NOT NULL,
    "recycler_id" INTEGER,
    "created_by_id" INTEGER,
    "name" VARCHAR(160) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
    "processing_path" "ProcessingPath",
    "target_weight_kg" DECIMAL(12,3),
    "actual_weight_kg" DECIMAL(12,3),
    "released_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "notes" VARCHAR(800),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "processing_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_items" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "added_by_id" INTEGER,
    "weight_at_addition_kg" DECIMAL(10,3),
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovered_materials" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "recorded_by_id" INTEGER,
    "material_type" "MaterialType" NOT NULL,
    "quantity_kg" DECIMAL(12,3) NOT NULL,
    "unit" VARCHAR(10) NOT NULL DEFAULT 'KG',
    "purity_pct" DECIMAL(5,2),
    "market_value_per_kg" DECIMAL(12,2),
    "notes" VARCHAR(500),
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovered_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_city_idx" ON "users"("city");

-- CreateIndex
CREATE UNIQUE INDEX "agent_profiles_user_id_key" ON "agent_profiles"("user_id");

-- CreateIndex
CREATE INDEX "agent_profiles_center_id_is_available_idx" ON "agent_profiles"("center_id", "is_available");

-- CreateIndex
CREATE INDEX "agent_profiles_is_available_current_load_count_idx" ON "agent_profiles"("is_available", "current_load_count");

-- CreateIndex
CREATE UNIQUE INDEX "recycler_profiles_user_id_key" ON "recycler_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "recycler_profiles_license_number_key" ON "recycler_profiles"("license_number");

-- CreateIndex
CREATE INDEX "recycler_profiles_is_active_idx" ON "recycler_profiles"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "collection_centers_code_key" ON "collection_centers"("code");

-- CreateIndex
CREATE INDEX "collection_centers_status_city_idx" ON "collection_centers"("status", "city");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_idx" ON "categories"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_requests_request_code_key" ON "pickup_requests"("request_code");

-- CreateIndex
CREATE INDEX "pickup_requests_status_preferred_date_idx" ON "pickup_requests"("status", "preferred_date");

-- CreateIndex
CREATE INDEX "pickup_requests_user_id_status_idx" ON "pickup_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "pickup_requests_agent_id_status_idx" ON "pickup_requests"("agent_id", "status");

-- CreateIndex
CREATE INDEX "pickup_requests_center_id_status_idx" ON "pickup_requests"("center_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ewaste_items_item_code_key" ON "ewaste_items"("item_code");

-- CreateIndex
CREATE INDEX "ewaste_items_user_id_status_idx" ON "ewaste_items"("user_id", "status");

-- CreateIndex
CREATE INDEX "ewaste_items_pickup_request_id_idx" ON "ewaste_items"("pickup_request_id");

-- CreateIndex
CREATE INDEX "ewaste_items_status_center_id_idx" ON "ewaste_items"("status", "center_id");

-- CreateIndex
CREATE INDEX "ewaste_items_category_id_idx" ON "ewaste_items"("category_id");

-- CreateIndex
CREATE INDEX "status_history_entity_type_item_id_created_at_idx" ON "status_history"("entity_type", "item_id", "created_at");

-- CreateIndex
CREATE INDEX "status_history_entity_type_pickup_request_id_created_at_idx" ON "status_history"("entity_type", "pickup_request_id", "created_at");

-- CreateIndex
CREATE INDEX "status_history_entity_type_batch_id_created_at_idx" ON "status_history"("entity_type", "batch_id", "created_at");

-- CreateIndex
CREATE INDEX "assignment_logs_pickup_request_id_idx" ON "assignment_logs"("pickup_request_id");

-- CreateIndex
CREATE INDEX "assignment_logs_agent_id_created_at_idx" ON "assignment_logs"("agent_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_item_id_key" ON "inspections"("item_id");

-- CreateIndex
CREATE INDEX "inspections_center_id_inspected_at_idx" ON "inspections"("center_id", "inspected_at");

-- CreateIndex
CREATE INDEX "inspections_processing_path_idx" ON "inspections"("processing_path");

-- CreateIndex
CREATE UNIQUE INDEX "processing_batches_batch_code_key" ON "processing_batches"("batch_code");

-- CreateIndex
CREATE INDEX "processing_batches_status_center_id_idx" ON "processing_batches"("status", "center_id");

-- CreateIndex
CREATE INDEX "processing_batches_recycler_id_status_idx" ON "processing_batches"("recycler_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "batch_items_item_id_key" ON "batch_items"("item_id");

-- CreateIndex
CREATE INDEX "batch_items_batch_id_idx" ON "batch_items"("batch_id");

-- CreateIndex
CREATE INDEX "recovered_materials_material_type_recorded_at_idx" ON "recovered_materials"("material_type", "recorded_at");

-- CreateIndex
CREATE INDEX "recovered_materials_batch_id_idx" ON "recovered_materials"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "recovered_materials_batch_id_material_type_key" ON "recovered_materials"("batch_id", "material_type");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staffed_center_id_fkey" FOREIGN KEY ("staffed_center_id") REFERENCES "collection_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "collection_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycler_profiles" ADD CONSTRAINT "recycler_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "collection_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ewaste_items" ADD CONSTRAINT "ewaste_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ewaste_items" ADD CONSTRAINT "ewaste_items_pickup_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "pickup_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ewaste_items" ADD CONSTRAINT "ewaste_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ewaste_items" ADD CONSTRAINT "ewaste_items_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "collection_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_pickup_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "pickup_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ewaste_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "processing_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_logs" ADD CONSTRAINT "assignment_logs_pickup_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "pickup_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_logs" ADD CONSTRAINT "assignment_logs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agent_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_logs" ADD CONSTRAINT "assignment_logs_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ewaste_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "collection_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_batches" ADD CONSTRAINT "processing_batches_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "collection_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_batches" ADD CONSTRAINT "processing_batches_recycler_id_fkey" FOREIGN KEY ("recycler_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_batches" ADD CONSTRAINT "processing_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "processing_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ewaste_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovered_materials" ADD CONSTRAINT "recovered_materials_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "processing_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovered_materials" ADD CONSTRAINT "recovered_materials_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ewaste_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovered_materials" ADD CONSTRAINT "recovered_materials_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
