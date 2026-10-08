-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('SUBMITTED', 'PICKUP_REQUESTED', 'PICKUP_ASSIGNED', 'COLLECTED', 'RECEIVED_AT_CENTER', 'INSPECTED', 'PROCESSING', 'RECYCLED', 'REFURBISHED', 'DISPOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ItemClassification" AS ENUM ('REUSABLE', 'REFURBISHABLE', 'RECYCLABLE', 'DISPOSABLE');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_centers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "capacity_kg" DOUBLE PRECISION NOT NULL,
    "current_load_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_agent_profiles" (
    "user_id" TEXT NOT NULL,
    "current_load_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_load_kg" DOUBLE PRECISION NOT NULL,
    "available_status" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "collection_agent_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "center_staff_profiles" (
    "user_id" TEXT NOT NULL,
    "center_id" TEXT NOT NULL,

    CONSTRAINT "center_staff_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ewaste_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ewaste_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "center_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "assigned_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "collected_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "status" "ItemStatus" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ewaste_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "pickup_request_id" TEXT,
    "estimated_weight_kg" DOUBLE PRECISION NOT NULL,
    "actual_weight_kg" DOUBLE PRECISION,
    "condition" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ewaste_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_histories" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "old_status" TEXT,
    "new_status" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "inspector_id" TEXT NOT NULL,
    "physical_condition" TEXT,
    "functional_status" BOOLEAN,
    "classification" "ItemClassification",
    "estimated_recoverable_weight_kg" DOUBLE PRECISION,
    "hazardous_components" TEXT,
    "notes" TEXT,
    "inspected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_batches" (
    "id" TEXT NOT NULL,
    "center_id" TEXT NOT NULL,
    "recycler_id" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_batch_items" (
    "batch_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "processed_weight_kg" DOUBLE PRECISION NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_batch_items_pkey" PRIMARY KEY ("batch_id","item_id")
);

-- CreateTable
CREATE TABLE "recoverable_materials" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "recoverable_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_recoveries" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "material_id" INTEGER NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "recovery_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ewaste_categories_name_key" ON "ewaste_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_item_id_key" ON "inspections"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "recoverable_materials_name_key" ON "recoverable_materials"("name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_agent_profiles" ADD CONSTRAINT "collection_agent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "center_staff_profiles" ADD CONSTRAINT "center_staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "center_staff_profiles" ADD CONSTRAINT "center_staff_profiles_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "collection_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "collection_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ewaste_items" ADD CONSTRAINT "ewaste_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ewaste_items" ADD CONSTRAINT "ewaste_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ewaste_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ewaste_items" ADD CONSTRAINT "ewaste_items_pickup_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "pickup_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_histories" ADD CONSTRAINT "status_histories_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ewaste_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_histories" ADD CONSTRAINT "status_histories_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ewaste_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_batches" ADD CONSTRAINT "processing_batches_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "collection_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_batches" ADD CONSTRAINT "processing_batches_recycler_id_fkey" FOREIGN KEY ("recycler_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_batch_items" ADD CONSTRAINT "processing_batch_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "processing_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_batch_items" ADD CONSTRAINT "processing_batch_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ewaste_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_recoveries" ADD CONSTRAINT "material_recoveries_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "processing_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_recoveries" ADD CONSTRAINT "material_recoveries_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "recoverable_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
