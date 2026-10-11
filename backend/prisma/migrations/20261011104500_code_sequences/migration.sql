-- =====================================================================================
--  Business identifier sequences
-- =====================================================================================
--  Human-facing codes (PR-2026-01042, ITM-2026-00017, BAT-2026-00003) are drawn from
--  PostgreSQL sequences rather than derived from `MAX(id) + 1`. Sequences are atomic and
--  connection-safe, so two concurrent submissions can never receive the same code.
-- =====================================================================================

CREATE SEQUENCE IF NOT EXISTS "pickup_request_code_seq"  AS BIGINT START WITH 1001 INCREMENT BY 1 NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS "ewaste_item_code_seq"     AS BIGINT START WITH 1001 INCREMENT BY 1 NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS "processing_batch_code_seq" AS BIGINT START WITH 1001 INCREMENT BY 1 NO MAXVALUE CACHE 1;
