-- E-Waste Lifecycle - SQL Demonstration Queries

-- 1. SELECT & WHERE: Find all pending pickup requests for a specific center
SELECT id, user_id, status, scheduled_at 
FROM pickup_requests 
WHERE center_id = 'center-uuid-here' AND status = 'PICKUP_REQUESTED';

-- 2. ORDER BY & GROUP BY: Count e-waste items submitted per user, ordered by count descending
SELECT u.name, u.email, COUNT(e.id) as total_items_submitted
FROM users u
JOIN ewaste_items e ON u.id = e.user_id
GROUP BY u.id, u.name, u.email
ORDER BY total_items_submitted DESC;

-- 3. HAVING: Find collection centers with more than 1000 kg current load
SELECT name, current_load_kg 
FROM collection_centers 
GROUP BY id, name, current_load_kg 
HAVING current_load_kg > 1000;

-- 4. INNER JOIN: List all processed batches, the center name, and the recycler name
SELECT pb.id, cc.name AS center_name, u.name AS recycler_name, pb.status, pb.completed_at
FROM processing_batches pb
INNER JOIN collection_centers cc ON pb.center_id = cc.id
INNER JOIN users u ON pb.recycler_id = u.id;

-- 5. LEFT JOIN: List all categories and the number of items in each (including empty categories)
SELECT c.name, COUNT(i.id) as item_count
FROM ewaste_categories c
LEFT JOIN ewaste_items i ON c.id = i.category_id
GROUP BY c.id, c.name;

-- 6. Subquery: Find the agent with the highest maximum load capacity
SELECT name, email 
FROM users 
WHERE id = (
    SELECT user_id 
    FROM collection_agent_profiles 
    ORDER BY max_load_kg DESC 
    LIMIT 1
);

-- 7. Aggregate Functions: Get total weight collected across all centers
SELECT SUM(current_load_kg) as total_inventory_weight, MAX(capacity_kg) as largest_center_capacity
FROM collection_centers;

-- 8. Analytics (Recovery Rate): Calculate the recovery rate across the entire platform
SELECT 
    (SUM(mr.quantity_kg) / (
        SELECT SUM(pbi.processed_weight_kg) 
        FROM processing_batch_items pbi 
        JOIN processing_batches pb ON pbi.batch_id = pb.id 
        WHERE pb.status = 'COMPLETED'
    )) * 100 AS global_recovery_rate_percentage
FROM material_recoveries mr;

-- 9. Date-based Analysis: Count items submitted per month
SELECT DATE_TRUNC('month', submitted_at) as month, COUNT(id) as items_submitted
FROM ewaste_items
GROUP BY DATE_TRUNC('month', submitted_at)
ORDER BY month DESC;

-- 10. Update Operations (Transaction snippet equivalent): Accept Pickup
-- BEGIN;
-- UPDATE pickup_requests SET status = 'ASSIGNED', agent_id = 'uuid' WHERE id = 'uuid' AND status = 'REQUESTED';
-- UPDATE ewaste_items SET status = 'PICKUP_ASSIGNED' WHERE pickup_request_id = 'uuid';
-- COMMIT;

-- 11. Delete Operations: Delete an unassigned pickup request (cascade deletes its links if configured, or just sets item status back)
-- DELETE FROM pickup_requests WHERE id = 'uuid' AND status = 'REQUESTED';

-- 12. Indexes Verification (Explain Plan test)
-- EXPLAIN ANALYZE SELECT * FROM ewaste_items WHERE user_id = 'uuid' AND status = 'SUBMITTED';

-- 13. Smart Assignment Component: Calculate haversine distance (pure SQL approximation) for finding closest agents
-- Note: This is an example if distance was done purely in SQL.
SELECT u.name, 
       (6371 * acos(cos(radians(40.7128)) * cos(radians(u.latitude)) * cos(radians(u.longitude) - radians(-74.0060)) + sin(radians(40.7128)) * sin(radians(u.latitude)))) AS distance_km
FROM users u
JOIN collection_agent_profiles cap ON u.id = cap.user_id
WHERE cap.available_status = true
ORDER BY distance_km ASC;

-- 14. Nested Subqueries: Find the top 3 recyclers by total material recovered
SELECT u.name, u.email, 
    (SELECT SUM(mr.quantity_kg) 
     FROM material_recoveries mr 
     JOIN processing_batches pb ON mr.batch_id = pb.id 
     WHERE pb.recycler_id = u.id) as total_recovered
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE r.name = 'RECYCLER'
ORDER BY total_recovered DESC NULLS LAST
LIMIT 3;

-- 15. Concurrency Check/Locking:
-- SELECT id, status FROM pickup_requests WHERE id = 'uuid' FOR UPDATE;
