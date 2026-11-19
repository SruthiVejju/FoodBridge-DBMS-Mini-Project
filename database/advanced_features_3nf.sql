-- ============================================================================
-- FOOD WASTE REDISTRIBUTION AND RESOURCE ALLOCATION SYSTEM
-- Team Member 1: Sruthi Vejju          - PES1UG24CS472
-- Team Member 2: Shubashitha Gowtham  - PES1UG24CS450
-- Advanced PostgreSQL Features (PostgreSQL 17 + pgvector)
-- ============================================================================
-- PREREQUISITE: Run schema.sql FIRST in food_waste_db.
-- This script adds functions, triggers and views to the EXISTING six tables.
-- It does not add/remove columns, so the ER/schema diagram entities stay the same.
-- Safe to re-run: existing triggers are dropped and re-created.
-- Run the whole script as one transaction, stopping on the first error.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 1. AVAILABILITY VIEWS: available stock is derived, never stored redundantly.
--    Both RESERVED and COLLECTED allocations consume quantity.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW donation_availability AS
SELECT d.donation_id,
       d.donor_org_id,
       d.food_name,
       d.category,
       d.total_qty,
       d.unit,
       d.status,
       d.expires_at,
       d.total_qty - COALESCE(a.used_qty, 0) AS available_qty
FROM donations AS d
LEFT JOIN (
    SELECT donation_id, SUM(allocated_qty) AS used_qty
    FROM allocations
    WHERE status IN ('RESERVED', 'COLLECTED')
    GROUP BY donation_id
) AS a ON a.donation_id = d.donation_id;

CREATE OR REPLACE VIEW ngo_request_availability AS
SELECT r.request_id,
       r.ngo_org_id,
       r.category,
       r.requested_qty,
       r.unit,
       r.status,
       r.needed_by,
       r.requested_qty - COALESCE(a.used_qty, 0) AS remaining_qty
FROM ngo_requests AS r
LEFT JOIN (
    SELECT request_id, SUM(allocated_qty) AS used_qty
    FROM allocations
    WHERE status IN ('RESERVED', 'COLLECTED')
    GROUP BY request_id
) AS a ON a.request_id = r.request_id;

-- Summary for an NGO dashboard. JOIN, GROUP BY, aggregate functions.
CREATE OR REPLACE VIEW ngo_allocation_summary AS
SELECT o.org_id AS ngo_org_id,
       o.org_name AS ngo_name,
       r.unit,
       COUNT(DISTINCT r.request_id) AS request_count,
       COUNT(a.allocation_id) FILTER
           (WHERE a.status IN ('RESERVED', 'COLLECTED')) AS active_allocations,
       COALESCE(SUM(a.allocated_qty) FILTER
           (WHERE a.status IN ('RESERVED', 'COLLECTED')), 0) AS total_allocated_qty
FROM organizations AS o
JOIN ngo_requests AS r ON r.ngo_org_id = o.org_id
LEFT JOIN allocations AS a ON a.request_id = r.request_id
WHERE o.org_type = 'NGO'
GROUP BY o.org_id, o.org_name, r.unit;

-- ---------------------------------------------------------------------------
-- 2. ORGANIZATION TYPE INTEGRITY: donor/NGO foreign keys must match their type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_organization_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_org_type VARCHAR(10);
BEGIN
    IF TG_TABLE_NAME = 'donations' THEN
        SELECT org_type INTO v_org_type
        FROM organizations WHERE org_id = NEW.donor_org_id;
        IF v_org_type IS DISTINCT FROM 'DONOR' THEN
            RAISE EXCEPTION 'donor_org_id must reference a DONOR organization';
        END IF;
    ELSIF TG_TABLE_NAME = 'ngo_requests' THEN
        SELECT org_type INTO v_org_type
        FROM organizations WHERE org_id = NEW.ngo_org_id;
        IF v_org_type IS DISTINCT FROM 'NGO' THEN
            RAISE EXCEPTION 'ngo_org_id must reference an NGO organization';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_donations_org_type ON donations;
CREATE TRIGGER trg_donations_org_type
BEFORE INSERT OR UPDATE OF donor_org_id ON donations
FOR EACH ROW EXECUTE FUNCTION enforce_organization_roles();

DROP TRIGGER IF EXISTS trg_requests_org_type ON ngo_requests;
CREATE TRIGGER trg_requests_org_type
BEFORE INSERT OR UPDATE OF ngo_org_id ON ngo_requests
FOR EACH ROW EXECUTE FUNCTION enforce_organization_roles();

CREATE OR REPLACE FUNCTION prevent_organization_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.org_type IS DISTINCT FROM OLD.org_type THEN
        RAISE EXCEPTION 'Organization type cannot be changed after creation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_type_immutable ON organizations;
CREATE TRIGGER trg_org_type_immutable
BEFORE UPDATE OF org_type ON organizations
FOR EACH ROW EXECUTE FUNCTION prevent_organization_type_change();

-- ---------------------------------------------------------------------------
-- 3. CONCURRENCY-SAFE ALLOCATIONS.
--    Lock parent DONATION then NGO_REQUEST in a consistent order.
--    Two competing allocations to the same donation cannot over-reserve stock.
--    READ COMMITTED is the intended isolation level for the demo/application.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_allocation_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_donation donations%ROWTYPE;
    v_request ngo_requests%ROWTYPE;
    v_donation_used NUMERIC(12,2);
    v_request_used NUMERIC(12,2);
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.donation_id IS DISTINCT FROM OLD.donation_id
           OR NEW.request_id IS DISTINCT FROM OLD.request_id THEN
            RAISE EXCEPTION 'Allocation donation_id/request_id cannot be changed';
        END IF;
        IF OLD.status = 'COLLECTED' AND
           (NEW.status IS DISTINCT FROM 'COLLECTED'
            OR NEW.allocated_qty IS DISTINCT FROM OLD.allocated_qty) THEN
            RAISE EXCEPTION 'A collected allocation cannot be changed or cancelled';
        END IF;
    END IF;

    -- Parent locks serialize allocations and quantity changes.
    SELECT * INTO v_donation
    FROM donations
    WHERE donation_id = NEW.donation_id
    FOR UPDATE;

    SELECT * INTO v_request
    FROM ngo_requests
    WHERE request_id = NEW.request_id
    FOR UPDATE;

    IF v_donation.donation_id IS NULL OR v_request.request_id IS NULL THEN
        RAISE EXCEPTION 'Donation or NGO request does not exist';
    END IF;

    IF v_donation.unit <> v_request.unit THEN
        RAISE EXCEPTION 'Donation and NGO request units must match';
    END IF;

    IF NEW.status IN ('RESERVED', 'COLLECTED') THEN
        IF TG_OP = 'INSERT' THEN
            IF v_donation.status <> 'AVAILABLE'
               OR v_donation.expires_at <= CURRENT_TIMESTAMP THEN
                RAISE EXCEPTION 'Donation is unavailable or expired';
            END IF;
            IF v_request.status <> 'OPEN'
               OR v_request.needed_by <= CURRENT_TIMESTAMP THEN
                RAISE EXCEPTION 'NGO request is closed or overdue';
            END IF;
        ELSIF OLD.status = 'CANCELLED' THEN
            IF v_donation.status <> 'AVAILABLE'
               OR v_donation.expires_at <= CURRENT_TIMESTAMP THEN
                RAISE EXCEPTION 'Donation is unavailable or expired';
            END IF;
            IF v_request.status <> 'OPEN'
               OR v_request.needed_by <= CURRENT_TIMESTAMP THEN
                RAISE EXCEPTION 'NGO request is closed or overdue';
            END IF;
        END IF;

        SELECT COALESCE(SUM(allocated_qty), 0)
        INTO v_donation_used
        FROM allocations
        WHERE donation_id = NEW.donation_id
          AND status IN ('RESERVED', 'COLLECTED')
          AND allocation_id IS DISTINCT FROM NEW.allocation_id;

        SELECT COALESCE(SUM(allocated_qty), 0)
        INTO v_request_used
        FROM allocations
        WHERE request_id = NEW.request_id
          AND status IN ('RESERVED', 'COLLECTED')
          AND allocation_id IS DISTINCT FROM NEW.allocation_id;

        IF v_donation_used + NEW.allocated_qty > v_donation.total_qty THEN
            RAISE EXCEPTION 'Allocation exceeds remaining donation quantity';
        END IF;
        IF v_request_used + NEW.allocated_qty > v_request.requested_qty THEN
            RAISE EXCEPTION 'Allocation exceeds remaining NGO request quantity';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_allocation_capacity ON allocations;
CREATE TRIGGER trg_allocation_capacity
BEFORE INSERT OR UPDATE ON allocations
FOR EACH ROW EXECUTE FUNCTION enforce_allocation_limits();

-- ---------------------------------------------------------------------------
-- 4. PARENT UPDATE SAFETY: do not shrink stock below existing reservations,
--    and do not change the measurement unit after active allocations exist.
--    Parent row UPDATE itself takes a lock, coordinated with section 3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_allocated_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_used_qty NUMERIC(12,2);
BEGIN
    IF TG_TABLE_NAME = 'donations' THEN
        SELECT COALESCE(SUM(allocated_qty), 0) INTO v_used_qty
        FROM allocations
        WHERE donation_id = NEW.donation_id
          AND status IN ('RESERVED', 'COLLECTED');

        IF NEW.total_qty < v_used_qty THEN
            RAISE EXCEPTION
                'Donation total_qty cannot be lower than already allocated quantity (%)',
                v_used_qty;
        END IF;
        IF NEW.unit IS DISTINCT FROM OLD.unit AND v_used_qty > 0 THEN
            RAISE EXCEPTION 'Cannot change donation unit while allocations exist';
        END IF;

    ELSIF TG_TABLE_NAME = 'ngo_requests' THEN
        SELECT COALESCE(SUM(allocated_qty), 0) INTO v_used_qty
        FROM allocations
        WHERE request_id = NEW.request_id
          AND status IN ('RESERVED', 'COLLECTED');

        IF NEW.requested_qty < v_used_qty THEN
            RAISE EXCEPTION
                'NGO requested_qty cannot be lower than already allocated quantity (%)',
                v_used_qty;
        END IF;
        IF NEW.unit IS DISTINCT FROM OLD.unit AND v_used_qty > 0 THEN
            RAISE EXCEPTION 'Cannot change request unit while allocations exist';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_donation_qty ON donations;
CREATE TRIGGER trg_protect_donation_qty
BEFORE UPDATE OF total_qty, unit ON donations
FOR EACH ROW EXECUTE FUNCTION protect_allocated_quantity();

DROP TRIGGER IF EXISTS trg_protect_request_qty ON ngo_requests;
CREATE TRIGGER trg_protect_request_qty
BEFORE UPDATE OF requested_qty, unit ON ngo_requests
FOR EACH ROW EXECUTE FUNCTION protect_allocated_quantity();

-- ---------------------------------------------------------------------------
-- 5. STORED FUNCTION: reserve food. A function call is atomic as one statement.
--    The capacity trigger above performs the synchronized final validation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reserve_food(
    p_donation_id BIGINT,
    p_request_id BIGINT,
    p_quantity NUMERIC,
    p_match_score NUMERIC DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_allocation_id BIGINT;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Allocation quantity must be positive';
    END IF;
    IF p_match_score IS NOT NULL AND (p_match_score < 0 OR p_match_score > 1) THEN
        RAISE EXCEPTION 'Match score must be between 0 and 1';
    END IF;

    INSERT INTO allocations (donation_id, request_id, allocated_qty,
                             match_score, status)
    VALUES (p_donation_id, p_request_id, p_quantity,
            p_match_score, 'RESERVED')
    RETURNING allocation_id INTO v_allocation_id;

    RETURN v_allocation_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. VECTOR MATCHING FUNCTION: return top candidate donations for a request.
--    Requires real 384-dimensional embeddings in BOTH involved rows.
--    This does NOT generate embeddings; Next.js/API will do that later.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_matching_donations(
    p_request_id BIGINT,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    donation_id BIGINT,
    food_name VARCHAR(150),
    available_qty NUMERIC,
    unit VARCHAR(15),
    cosine_similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
    SELECT d.donation_id,
           d.food_name,
           da.available_qty,
           d.unit,
           1 - (d.embedding <=> r.embedding) AS cosine_similarity
    FROM ngo_requests AS r
    CROSS JOIN donations AS d
    JOIN donation_availability AS da ON da.donation_id = d.donation_id
    JOIN ngo_request_availability AS ra ON ra.request_id = r.request_id
    WHERE r.request_id = p_request_id
      AND r.status = 'OPEN'
      AND r.needed_by > CURRENT_TIMESTAMP
      AND ra.remaining_qty > 0
      AND r.embedding IS NOT NULL
      AND d.embedding IS NOT NULL
      AND d.status = 'AVAILABLE'
      AND d.expires_at > CURRENT_TIMESTAMP
      AND da.available_qty > 0
      AND d.unit = r.unit
    ORDER BY d.embedding <=> r.embedding, d.donation_id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 50));
$$;

COMMIT;

-- ============================================================================
-- QUICK DEMO QUERIES (run separately AFTER sample data has been inserted):
-- SELECT * FROM donation_availability ORDER BY donation_id;
-- SELECT * FROM ngo_request_availability ORDER BY request_id;
-- SELECT * FROM ngo_allocation_summary ORDER BY ngo_org_id;
-- SELECT reserve_food(1, 1, 5.00, 0.9000);
-- SELECT * FROM find_matching_donations(1, 5);
--
-- EXAMPLE REPORTING QUERY (unit-safe grouped totals):
-- SELECT o.org_name, d.unit, SUM(a.allocated_qty) AS allocated_total
-- FROM allocations a
-- JOIN ngo_requests r ON r.request_id = a.request_id
-- JOIN organizations o ON o.org_id = r.ngo_org_id
-- JOIN donations d ON d.donation_id = a.donation_id
-- WHERE a.status IN ('RESERVED','COLLECTED')
-- GROUP BY o.org_name, d.unit
-- HAVING SUM(a.allocated_qty) > 0
-- ORDER BY allocated_total DESC;
--
-- Do not run the sample reserve_food call until IDs 1/1 are real, compatible,
-- not expired, and have enough available quantities.
-- ============================================================================
