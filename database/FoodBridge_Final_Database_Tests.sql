-- ============================================================================
-- FOODBRIDGE: FINAL POSTGRESQL INTEGRITY TESTS (NON-DESTRUCTIVE)
-- Food Waste Redistribution and Resource Allocation System
-- Sruthi Vejju - PES1UG24CS472
-- Shubashitha Gowtham - PES1UG24CS450
--
-- Tested against the shared schema.sql and advanced_features.sql definitions.
-- This creates temporary test records inside ONE TRANSACTION and ROLLS THEM BACK.
-- It does not alter existing organization, user, donation, request, pickup or
-- allocation rows. PostgreSQL identity/sequence counters may advance.
--
-- RUN: Get-Content -Raw .\FoodBridge_Final_Database_Tests.sql | docker exec -i foodwaste-postgres psql -v ON_ERROR_STOP=1 -U foodwaste_user -d food_waste_db
--
-- Purpose: check positive allocation, views, semantic matching, validation,
-- immutability, role restrictions, and pickup uniqueness.
-- LIMITATION: this is a SINGLE-session test; it does NOT verify truly
-- concurrent requests from two database sessions, HTTP security, or MongoDB.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '25s';
SET LOCAL lock_timeout = '5s';

DO $tests$
DECLARE
    v_donor_id BIGINT;
    v_ngo_id BIGINT;
    v_donation_id BIGINT;
    v_request_id BIGINT;
    v_kg_request_id BIGINT;
    v_allocation_id BIGINT;
    v_available NUMERIC;
    v_remaining NUMERIC;
    v_score DOUBLE PRECISION;
    v_msg TEXT;
BEGIN
    -- Fixtures: independent of the user's actual donor and NGO records.
    INSERT INTO organizations(org_name, org_type, address, contact_person, contact_phone)
    VALUES ('QA ONLY - Donor', 'DONOR', 'Test address', 'QA', '0000000000')
    RETURNING org_id INTO v_donor_id;
    INSERT INTO organizations(org_name, org_type, address, contact_person, contact_phone)
    VALUES ('QA ONLY - NGO', 'NGO', 'Test address', 'QA', '0000000000')
    RETURNING org_id INTO v_ngo_id;

    -- Identical synthetic vectors permit an exact and predictable score test.
    -- Real semantic embeddings are tested separately in the application.
    INSERT INTO donations(donor_org_id, food_name, description, category,
                          total_qty, unit, expires_at, pickup_address, embedding)
    VALUES(v_donor_id, 'QA ONLY - Vegetable Rice', 'Cooked vegetable rice',
           'Cooked food', 10, 'servings', CURRENT_TIMESTAMP + INTERVAL '4 days',
           'QA location', ('[' || '1,' || repeat('0,',382) || '0]')::vector)
    RETURNING donation_id INTO v_donation_id;

    INSERT INTO ngo_requests(ngo_org_id, description, category,
                             requested_qty, unit, needed_by, delivery_address,
                             embedding)
    VALUES(v_ngo_id, 'Need cooked vegetable rice', 'Cooked food', 8,
           'servings', CURRENT_TIMESTAMP + INTERVAL '3 days', 'QA destination',
           ('[' || '1,' || repeat('0,',382) || '0]')::vector)
    RETURNING request_id INTO v_request_id;

    INSERT INTO ngo_requests(ngo_org_id, description, category,
                             requested_qty, unit, needed_by, delivery_address)
    VALUES(v_ngo_id, 'Need produce by the kilogram', 'Vegetables', 2,
           'kg', CURRENT_TIMESTAMP + INTERVAL '3 days', 'QA destination')
    RETURNING request_id INTO v_kg_request_id;

    RAISE NOTICE 'PASS 1/10: Test records created transactionally';

    v_allocation_id := reserve_food(v_donation_id, v_request_id, 6, 0.9500);
    IF v_allocation_id IS NULL THEN
       RAISE EXCEPTION 'FAIL: reserve_food did not return allocation_id';
    END IF;
    RAISE NOTICE 'PASS 2/10: Valid reservation created';

    SELECT available_qty INTO v_available
    FROM donation_availability WHERE donation_id = v_donation_id;
    SELECT remaining_qty INTO v_remaining
    FROM ngo_request_availability WHERE request_id = v_request_id;
    IF v_available IS DISTINCT FROM 4 OR v_remaining IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'FAIL: Availability expected donation=4, request=2, got %, %',
            v_available, v_remaining;
    END IF;
    RAISE NOTICE 'PASS 3/10: Availability views return correct quantities';

    SELECT cosine_similarity INTO v_score
    FROM find_matching_donations(v_request_id, 50)
    WHERE donation_id = v_donation_id;
    IF v_score IS NULL OR ABS(v_score - 1.0) > 0.00001 THEN
        RAISE EXCEPTION 'FAIL: pgvector exact-match expected similarity 1.0, got %', v_score;
    END IF;
    RAISE NOTICE 'PASS 4/10: pgvector semantic-ranking SQL returns a correct score';

    -- Negative test: cannot reserve 5 more from 10 with 6 already allocated.
    BEGIN
        PERFORM reserve_food(v_donation_id, v_request_id, 5, 0.9);
        RAISE EXCEPTION 'TEST_NOT_REJECTED';
    EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        IF v_msg = 'TEST_NOT_REJECTED' OR
           v_msg NOT LIKE '%exceeds remaining donation quantity%' THEN
            RAISE EXCEPTION 'FAIL: Expected donation-capacity rejection, got %',v_msg;
        END IF;
    END;
    RAISE NOTICE 'PASS 5/10: Donation over-allocation is rejected';

    -- Negative test: NGO has only 2 remaining; 3 would exceed request capacity.
    BEGIN
        PERFORM reserve_food(v_donation_id, v_request_id, 3, 0.9);
        RAISE EXCEPTION 'TEST_NOT_REJECTED';
    EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        IF v_msg = 'TEST_NOT_REJECTED' OR
           v_msg NOT LIKE '%exceeds remaining NGO request quantity%' THEN
            RAISE EXCEPTION 'FAIL: Expected NGO-capacity rejection, got %',v_msg;
        END IF;
    END;
    RAISE NOTICE 'PASS 6/10: NGO request over-allocation is rejected';

    -- Negative test: measurement units must be compatible.
    BEGIN
        PERFORM reserve_food(v_donation_id, v_kg_request_id, 1, 0.9);
        RAISE EXCEPTION 'TEST_NOT_REJECTED';
    EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        IF v_msg = 'TEST_NOT_REJECTED' OR
           v_msg NOT LIKE '%units must match%' THEN
            RAISE EXCEPTION 'FAIL: Expected unit rejection, got %',v_msg;
        END IF;
    END;
    RAISE NOTICE 'PASS 7/10: Incompatible kg/servings allocation is rejected';

    -- Negative test: prevent both parent shrinkage and unit mutation.
    BEGIN
        UPDATE donations SET total_qty = 5 WHERE donation_id = v_donation_id;
        RAISE EXCEPTION 'TEST_NOT_REJECTED';
    EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        IF v_msg = 'TEST_NOT_REJECTED' OR
           v_msg NOT LIKE '%cannot be lower than already allocated%' THEN
            RAISE EXCEPTION 'FAIL: Expected donation-shrink rejection, got %',v_msg;
        END IF;
    END;
    BEGIN
        UPDATE ngo_requests SET requested_qty = 5 WHERE request_id = v_request_id;
        RAISE EXCEPTION 'TEST_NOT_REJECTED';
    EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        IF v_msg = 'TEST_NOT_REJECTED' OR
           v_msg NOT LIKE '%cannot be lower than already allocated%' THEN
            RAISE EXCEPTION 'FAIL: Expected request-shrink rejection, got %',v_msg;
        END IF;
    END;
    RAISE NOTICE 'PASS 8/10: Donor/request quantities cannot shrink below allocated stock';

    -- Negative test: a donor-owned donation cannot point at an NGO.
    BEGIN
        INSERT INTO donations(donor_org_id,food_name,description,category,
                              total_qty,unit,expires_at,pickup_address)
        VALUES(v_ngo_id,'QA INVALID','Role check','Cooked food',1,
               'servings',CURRENT_TIMESTAMP + INTERVAL '2 days','QA');
        RAISE EXCEPTION 'TEST_NOT_REJECTED';
    EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        IF v_msg = 'TEST_NOT_REJECTED' OR
           v_msg NOT LIKE '%DONOR organization%' THEN
            RAISE EXCEPTION 'FAIL: Expected organization-role rejection, got %',v_msg;
        END IF;
    END;
    RAISE NOTICE 'PASS 9/10: NGO cannot act as donation owner';

    -- Positive pickup followed by negative duplicate, and collected protection.
    INSERT INTO pickups(allocation_id,scheduled_at,delivery_status)
    VALUES(v_allocation_id,CURRENT_TIMESTAMP + INTERVAL '2 hours','SCHEDULED');
    BEGIN
        INSERT INTO pickups(allocation_id,scheduled_at,delivery_status)
        VALUES(v_allocation_id,CURRENT_TIMESTAMP + INTERVAL '3 hours','SCHEDULED');
        RAISE EXCEPTION 'TEST_NOT_REJECTED';
    EXCEPTION WHEN unique_violation THEN
        NULL; -- Correct: allocations are one-to-zero/one with pickups.
    END;
    UPDATE allocations SET status = 'COLLECTED'
    WHERE allocation_id = v_allocation_id;
    BEGIN
        UPDATE allocations SET status = 'CANCELLED'
        WHERE allocation_id = v_allocation_id;
        RAISE EXCEPTION 'TEST_NOT_REJECTED';
    EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        IF v_msg = 'TEST_NOT_REJECTED' OR
           v_msg NOT LIKE '%collected allocation cannot be changed%' THEN
            RAISE EXCEPTION 'FAIL: Expected collected-allocation protection, got %',v_msg;
        END IF;
    END;
    RAISE NOTICE 'PASS 10/10: Duplicate pickup rejected and collected allocation protected';

    RAISE NOTICE 'ALL 10 DATABASE CHECKS PASSED - transaction will be rolled back';
END;
$tests$;

ROLLBACK;
\echo 'SUCCESS: All 10 tests passed. Test records rolled back.'
\echo 'NEXT: Test true two-session concurrency and API authorization separately.'
