-- ============================================================================
-- FOOD WASTE REDISTRIBUTION AND RESOURCE ALLOCATION SYSTEM
-- Team Member 1: Sruthi Vejju         - PES1UG24CS472
-- Team Member 2: Shubashitha Gowtham - PES1UG24CS450
-- STAGE 5: DEMONSTRATION DATA + DATABASE TESTS
-- Compatible with schema.sql + advanced_features.sql (PostgreSQL 17/pgvector)
-- ============================================================================
-- This file INSERTS demo data permanently if all tests pass.
-- Re-running it intentionally FAILS without duplicating the demo data.
-- Uses synthetic 384-dimensional test vectors, NOT AI-generated embeddings.
-- Test users have NONFUNCTIONAL password placeholders and cannot log in.
-- Do NOT use demo accounts/password placeholders in a production system.
-- Run via psql with -v ON_ERROR_STOP=1. Do not run it in a live production DB.
-- ============================================================================

BEGIN;
SET LOCAL client_min_messages = NOTICE;
SET LOCAL transaction_isolation = 'read committed';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM organizations WHERE org_name = 'DEMO - GreenBite Kitchen') THEN
    RAISE EXCEPTION 'Demo data already exists. Script intentionally refuses to insert duplicates.';
  END IF;
  IF to_regprocedure('reserve_food(bigint,bigint,numeric,numeric)') IS NULL THEN
    RAISE EXCEPTION 'Run advanced_features.sql before sample_data_and_tests.sql';
  END IF;
END $$;

-- IDs are stored in a session-local temp table, so no assumptions about
-- identity/sequence values (e.g., ID=1) are needed.
CREATE TEMP TABLE demo_ids (
  tag TEXT PRIMARY KEY,
  id BIGINT NOT NULL
) ON COMMIT DROP;

-- 1. ORGANIZATIONS: two donors and two NGOs.
WITH inserted AS (
  INSERT INTO organizations
    (org_name, org_type, address, contact_person, contact_phone, verification_status)
  VALUES
    ('DEMO - GreenBite Kitchen', 'DONOR', 'Indiranagar, Bengaluru', 'Asha Rao', '9000000101', 'VERIFIED'),
    ('DEMO - CityHarvest Bakery', 'DONOR', 'Jayanagar, Bengaluru', 'Kiran Shah', '9000000102', 'VERIFIED'),
    ('DEMO - Hope Meals NGO', 'NGO', 'Koramangala, Bengaluru', 'Neha Kumar', '9000000201', 'VERIFIED'),
    ('DEMO - CareBridge NGO', 'NGO', 'BTM Layout, Bengaluru', 'Ravi Patel', '9000000202', 'VERIFIED')
  RETURNING org_id, org_name
)
INSERT INTO demo_ids(tag,id)
SELECT CASE org_name
         WHEN 'DEMO - GreenBite Kitchen' THEN 'donor_a'
         WHEN 'DEMO - CityHarvest Bakery' THEN 'donor_b'
         WHEN 'DEMO - Hope Meals NGO' THEN 'ngo_a'
         WHEN 'DEMO - CareBridge NGO' THEN 'ngo_b'
       END, org_id
FROM inserted;

-- 2. USERS: placeholders are intentionally NOT real authentication hashes.
INSERT INTO users (org_id, full_name, email, password_hash)
VALUES
 ((SELECT id FROM demo_ids WHERE tag='donor_a'), 'DEMO Asha Rao', 'demo-asha@example.invalid', 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH'),
 ((SELECT id FROM demo_ids WHERE tag='donor_b'), 'DEMO Kiran Shah', 'demo-kiran@example.invalid', 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH'),
 ((SELECT id FROM demo_ids WHERE tag='ngo_a'), 'DEMO Neha Kumar', 'demo-neha@example.invalid', 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH'),
 ((SELECT id FROM demo_ids WHERE tag='ngo_b'), 'DEMO Ravi Patel', 'demo-ravi@example.invalid', 'DEMO_ONLY_NOT_A_REAL_PASSWORD_HASH');

-- 3. DONATIONS: two servings-based and one kg-based.
-- Synthetic vector directions let the search visibly rank candidates.
WITH inserted AS (
 INSERT INTO donations
 (donor_org_id, food_name, description, category, total_qty, unit,
  prepared_at, expires_at, pickup_address, status, embedding)
 VALUES
 ((SELECT id FROM demo_ids WHERE tag='donor_a'),
  'DEMO Fresh Vegetable Meals', 'Fresh cooked vegetarian meals ready for NGO collection',
  'Cooked Meals', 40, 'servings', CURRENT_TIMESTAMP - INTERVAL '1 hour',
  CURRENT_TIMESTAMP + INTERVAL '36 hours', 'Indiranagar, Bengaluru', 'AVAILABLE',
  ('[' || '1,' || repeat('0,', 382) || '0]')::vector),
 ((SELECT id FROM demo_ids WHERE tag='donor_b'),
  'DEMO Whole Wheat Bread', 'Packaged bread suitable for immediate distribution',
  'Bakery', 25, 'servings', CURRENT_TIMESTAMP - INTERVAL '2 hours',
  CURRENT_TIMESTAMP + INTERVAL '48 hours', 'Jayanagar, Bengaluru', 'AVAILABLE',
  ('[' || '0,1,' || repeat('0,', 381) || '0]')::vector),
 ((SELECT id FROM demo_ids WHERE tag='donor_a'),
  'DEMO Fresh Produce', 'Fresh raw vegetables for community kitchens',
  'Vegetables', 25, 'kg', NULL,
  CURRENT_TIMESTAMP + INTERVAL '4 days', 'Indiranagar, Bengaluru', 'AVAILABLE',
  ('[' || '0,1,' || repeat('0,', 381) || '0]')::vector)
 RETURNING donation_id, food_name
)
INSERT INTO demo_ids(tag,id)
SELECT CASE food_name
         WHEN 'DEMO Fresh Vegetable Meals' THEN 'meal'
         WHEN 'DEMO Whole Wheat Bread' THEN 'bread'
         WHEN 'DEMO Fresh Produce' THEN 'produce'
       END, donation_id
FROM inserted;

-- 4. NGO REQUESTS: quantity and units intentionally align with donations.
WITH inserted AS (
 INSERT INTO ngo_requests
 (ngo_org_id, description, category, requested_qty, unit,
  needed_by, delivery_address, priority, status, embedding)
 VALUES
 ((SELECT id FROM demo_ids WHERE tag='ngo_a'),
  'Cooked vegetarian meals for community dinner', 'Cooked Meals', 30,
  'servings', CURRENT_TIMESTAMP + INTERVAL '1 day',
  'Koramangala, Bengaluru', 'HIGH', 'OPEN',
  ('[' || '0.8,0.6,' || repeat('0,', 381) || '0]')::vector),
 ((SELECT id FROM demo_ids WHERE tag='ngo_b'),
  'Fresh vegetables for NGO kitchen preparation', 'Vegetables', 15,
  'kg', CURRENT_TIMESTAMP + INTERVAL '2 days',
  'BTM Layout, Bengaluru', 'MEDIUM', 'OPEN',
  ('[' || '0,1,' || repeat('0,', 381) || '0]')::vector)
 RETURNING request_id, description
)
INSERT INTO demo_ids(tag,id)
SELECT CASE description
         WHEN 'Cooked vegetarian meals for community dinner' THEN 'meal_request'
         WHEN 'Fresh vegetables for NGO kitchen preparation' THEN 'produce_request'
       END, request_id
FROM inserted;

-- 5. POSITIVE TESTS: reservation function, foreign keys, pickups and views.
INSERT INTO demo_ids(tag,id)
SELECT 'meal_allocation', reserve_food(
  (SELECT id FROM demo_ids WHERE tag='meal'),
  (SELECT id FROM demo_ids WHERE tag='meal_request'), 12.00, 0.9100);
INSERT INTO demo_ids(tag,id)
SELECT 'produce_allocation', reserve_food(
  (SELECT id FROM demo_ids WHERE tag='produce'),
  (SELECT id FROM demo_ids WHERE tag='produce_request'), 10.00, 0.9400);

INSERT INTO pickups(allocation_id, scheduled_at, collected_by, vehicle_no, delivery_status)
VALUES ((SELECT id FROM demo_ids WHERE tag='meal_allocation'),
        CURRENT_TIMESTAMP + INTERVAL '3 hours', 'DEMO Pickup Volunteer',
        'KA-01-DEMO', 'SCHEDULED');

DO $$
DECLARE v NUMERIC;
BEGIN
 SELECT available_qty INTO v FROM donation_availability
 WHERE donation_id = (SELECT id FROM demo_ids WHERE tag='meal');
 IF v IS DISTINCT FROM 28 THEN
   RAISE EXCEPTION 'FAIL: meal available_qty expected 28, got %', v;
 END IF;
 SELECT remaining_qty INTO v FROM ngo_request_availability
 WHERE request_id = (SELECT id FROM demo_ids WHERE tag='meal_request');
 IF v IS DISTINCT FROM 18 THEN
   RAISE EXCEPTION 'FAIL: meal remaining_qty expected 18, got %', v;
 END IF;
 SELECT available_qty INTO v FROM donation_availability
 WHERE donation_id = (SELECT id FROM demo_ids WHERE tag='produce');
 IF v IS DISTINCT FROM 15 THEN
   RAISE EXCEPTION 'FAIL: produce available_qty expected 15, got %', v;
 END IF;
 RAISE NOTICE 'PASS: allocations, pickup and availability views';
END $$;

-- 6. NEGATIVE TESTS: intentional rejections. Each failed operation is caught
-- within an EXCEPTION subtransaction, leaving demo data unchanged.
DO $$
DECLARE
 v_donation BIGINT := (SELECT id FROM demo_ids WHERE tag='meal');
 v_request BIGINT := (SELECT id FROM demo_ids WHERE tag='meal_request');
 v_ngo BIGINT := (SELECT id FROM demo_ids WHERE tag='ngo_a');
 v_produce BIGINT := (SELECT id FROM demo_ids WHERE tag='produce');
 v_msg TEXT;
BEGIN
 -- Exceed the donation quantity (40 total, 12 reserved).
 BEGIN
   PERFORM reserve_food(v_donation, v_request, 35, 0.9);
   RAISE EXCEPTION 'TEST_NOT_REJECTED';
 EXCEPTION WHEN OTHERS THEN
   v_msg := SQLERRM;
   IF v_msg = 'TEST_NOT_REJECTED' THEN RAISE EXCEPTION 'FAIL: donation over-allocation accepted'; END IF;
   IF v_msg NOT LIKE '%exceeds remaining donation quantity%' THEN
     RAISE EXCEPTION 'FAIL: wrong donation capacity error: %', v_msg;
   END IF;
   RAISE NOTICE 'PASS: donation over-allocation rejected';
 END;

 -- Exceed request quantity while donation still has room (remaining NGO=18).
 BEGIN
   PERFORM reserve_food(v_donation, v_request, 20, 0.9);
   RAISE EXCEPTION 'TEST_NOT_REJECTED';
 EXCEPTION WHEN OTHERS THEN
   v_msg := SQLERRM;
   IF v_msg = 'TEST_NOT_REJECTED' THEN RAISE EXCEPTION 'FAIL: request over-allocation accepted'; END IF;
   IF v_msg NOT LIKE '%exceeds remaining NGO request quantity%' THEN
     RAISE EXCEPTION 'FAIL: wrong request capacity error: %', v_msg;
   END IF;
   RAISE NOTICE 'PASS: request over-allocation rejected';
 END;

 -- Wrong units (kg donation, servings request).
 BEGIN
   PERFORM reserve_food(v_produce, v_request, 1, 0.5);
   RAISE EXCEPTION 'TEST_NOT_REJECTED';
 EXCEPTION WHEN OTHERS THEN
   v_msg := SQLERRM;
   IF v_msg = 'TEST_NOT_REJECTED' THEN RAISE EXCEPTION 'FAIL: incompatible units accepted'; END IF;
   IF v_msg NOT LIKE '%units must match%' THEN RAISE EXCEPTION 'FAIL: wrong unit error: %', v_msg; END IF;
   RAISE NOTICE 'PASS: mismatched units rejected';
 END;

 -- Donor organization ID must reference a DONOR.
 BEGIN
   INSERT INTO donations (donor_org_id,food_name,description,category,total_qty,
       unit,expires_at,pickup_address)
   VALUES (v_ngo,'SHOULD FAIL','Invalid ownership test','Cooked Meals',5,
       'servings',CURRENT_TIMESTAMP + INTERVAL '1 day','TEST');
   RAISE EXCEPTION 'TEST_NOT_REJECTED';
 EXCEPTION WHEN OTHERS THEN
   v_msg := SQLERRM;
   IF v_msg = 'TEST_NOT_REJECTED' THEN RAISE EXCEPTION 'FAIL: NGO donation accepted'; END IF;
   IF v_msg NOT LIKE '%DONOR organization%' THEN RAISE EXCEPTION 'FAIL: wrong donor role error: %', v_msg; END IF;
   RAISE NOTICE 'PASS: NGO prevented from creating donor-owned donation';
 END;

 -- Cannot decrease donation below reserved amount (12).
 BEGIN
   UPDATE donations SET total_qty = 5 WHERE donation_id = v_donation;
   RAISE EXCEPTION 'TEST_NOT_REJECTED';
 EXCEPTION WHEN OTHERS THEN
   v_msg := SQLERRM;
   IF v_msg = 'TEST_NOT_REJECTED' THEN RAISE EXCEPTION 'FAIL: unsafe donation quantity update accepted'; END IF;
   IF v_msg NOT LIKE '%cannot be lower than already allocated%' THEN
     RAISE EXCEPTION 'FAIL: wrong donation update error: %', v_msg;
   END IF;
   RAISE NOTICE 'PASS: donation quantity protected';
 END;

 -- Cannot change org role after creation.
 BEGIN
   UPDATE organizations SET org_type = 'DONOR' WHERE org_id = v_ngo;
   RAISE EXCEPTION 'TEST_NOT_REJECTED';
 EXCEPTION WHEN OTHERS THEN
   v_msg := SQLERRM;
   IF v_msg = 'TEST_NOT_REJECTED' THEN RAISE EXCEPTION 'FAIL: organization type change accepted'; END IF;
   IF v_msg NOT LIKE '%cannot be changed%' THEN RAISE EXCEPTION 'FAIL: wrong org type error: %', v_msg; END IF;
   RAISE NOTICE 'PASS: organization type immutable';
 END;

 -- Uniqueness: at most one pickup row for an allocation.
 BEGIN
   INSERT INTO pickups (allocation_id, scheduled_at)
   VALUES ((SELECT id FROM demo_ids WHERE tag='meal_allocation'), CURRENT_TIMESTAMP + INTERVAL '4 hours');
   RAISE EXCEPTION 'TEST_NOT_REJECTED';
 EXCEPTION WHEN OTHERS THEN
   v_msg := SQLERRM;
   IF v_msg = 'TEST_NOT_REJECTED' THEN RAISE EXCEPTION 'FAIL: second pickup accepted'; END IF;
   IF v_msg NOT LIKE '%duplicate key value violates unique constraint%' THEN
     RAISE EXCEPTION 'FAIL: wrong duplicate pickup error: %', v_msg;
   END IF;
   RAISE NOTICE 'PASS: duplicate pickup rejected';
 END;
END $$;

-- 7. VECTOR MATCHING: synthetic test vectors, expected ranking.
DO $$
DECLARE
 v_top BIGINT;
 v_expected BIGINT := (SELECT id FROM demo_ids WHERE tag='meal');
BEGIN
 SELECT donation_id INTO v_top
 FROM find_matching_donations((SELECT id FROM demo_ids WHERE tag='meal_request'), 5)
 LIMIT 1;
 IF v_top IS DISTINCT FROM v_expected THEN
   RAISE EXCEPTION 'FAIL: vector ranking expected meal donation %, got %', v_expected, v_top;
 END IF;
 RAISE NOTICE 'PASS: pgvector returned expected top donation';
END $$;

-- 8. REPORTING QUERIES (for lab demo): JOIN, GROUP BY, HAVING,
-- ORDER BY, aggregates, subquery and views.
SELECT 'DONATION_AVAILABILITY' AS report, donation_id, food_name, total_qty,
       available_qty, unit
FROM donation_availability
WHERE donation_id IN (SELECT id FROM demo_ids WHERE tag IN ('meal','bread','produce'))
ORDER BY donation_id;

SELECT 'NGO_REQUEST_AVAILABILITY' AS report, request_id, requested_qty, remaining_qty, unit
FROM ngo_request_availability
WHERE request_id IN (SELECT id FROM demo_ids WHERE tag IN ('meal_request','produce_request'))
ORDER BY request_id;

SELECT o.org_name AS ngo_name, d.unit, COUNT(*) AS active_allocation_count,
       SUM(a.allocated_qty) AS total_allocated_quantity
FROM allocations a
JOIN ngo_requests r ON r.request_id = a.request_id
JOIN organizations o ON o.org_id = r.ngo_org_id
JOIN donations d ON d.donation_id = a.donation_id
WHERE a.status IN ('RESERVED','COLLECTED')
  AND a.allocation_id IN (SELECT id FROM demo_ids WHERE tag IN ('meal_allocation','produce_allocation'))
GROUP BY o.org_name,d.unit
HAVING SUM(a.allocated_qty) > 0
ORDER BY total_allocated_quantity DESC;

SELECT * FROM find_matching_donations((SELECT id FROM demo_ids WHERE tag='meal_request'),5);

COMMIT;
\echo 'SUCCESS: demo records committed; all database tests passed.'
\echo 'NOTE: two-session simultaneous concurrency testing is still pending.'
\echo 'NOTE: synthetic vectors are test fixtures, not genuine semantic embeddings.'
