-- Food Waste Redistribution and Resource Allocation System
-- Team Member 1: Sruthi Vejju - PES1UG24CS472
-- Team Member 2: Shubashitha Gowtham - PES1UG24CS450
-- PostgreSQL 16+ with pgvector extension installed.
-- This is the authoritative table/column naming for BOTH diagrams.
-- MongoDB collections are documented separately, not relational tables.

BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE organizations (
    org_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    org_name VARCHAR(150) NOT NULL,
    org_type VARCHAR(10) NOT NULL CHECK (org_type IN ('DONOR','NGO')),
    address TEXT NOT NULL,
    contact_person VARCHAR(120) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    verification_status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    org_id BIGINT NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_org_id FOREIGN KEY (org_id) REFERENCES organizations(org_id)
);

CREATE TABLE donations (
    donation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donor_org_id BIGINT NOT NULL,
    food_name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(60) NOT NULL,
    total_qty NUMERIC(12,2) NOT NULL CHECK (total_qty > 0),
    unit VARCHAR(15) NOT NULL CHECK (unit IN ('kg','servings')),
    prepared_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    pickup_address TEXT NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','CLOSED','EXPIRED','CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    embedding VECTOR(384),
    CONSTRAINT fk_donations_donor_org_id FOREIGN KEY (donor_org_id) REFERENCES organizations(org_id),
    CONSTRAINT ck_donations_time CHECK (prepared_at IS NULL OR expires_at > prepared_at)
);

CREATE TABLE ngo_requests (
    request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ngo_org_id BIGINT NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(60) NOT NULL,
    requested_qty NUMERIC(12,2) NOT NULL CHECK (requested_qty > 0),
    unit VARCHAR(15) NOT NULL CHECK (unit IN ('kg','servings')),
    needed_by TIMESTAMPTZ NOT NULL,
    delivery_address TEXT NOT NULL,
    priority VARCHAR(8) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
    status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FULFILLED','CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    embedding VECTOR(384),
    CONSTRAINT fk_ngo_requests_ngo_org_id FOREIGN KEY (ngo_org_id) REFERENCES organizations(org_id)
);

CREATE TABLE allocations (
    allocation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    donation_id BIGINT NOT NULL,
    request_id BIGINT NOT NULL,
    allocated_qty NUMERIC(12,2) NOT NULL CHECK (allocated_qty > 0),
    match_score NUMERIC(5,4) CHECK (match_score BETWEEN 0 AND 1),
    status VARCHAR(12) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','COLLECTED','CANCELLED')),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_allocations_donation_id FOREIGN KEY (donation_id) REFERENCES donations(donation_id),
    CONSTRAINT fk_allocations_request_id FOREIGN KEY (request_id) REFERENCES ngo_requests(request_id)
);

CREATE TABLE pickups (
    pickup_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    allocation_id BIGINT NOT NULL UNIQUE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    collected_by VARCHAR(120),
    vehicle_no VARCHAR(30),
    delivery_status VARCHAR(14) NOT NULL DEFAULT 'SCHEDULED' CHECK (delivery_status IN ('SCHEDULED','PICKED_UP','DELIVERED','CANCELLED')),
    completed_at TIMESTAMPTZ,
    CONSTRAINT fk_pickups_allocation_id FOREIGN KEY (allocation_id) REFERENCES allocations(allocation_id),
    CONSTRAINT ck_pickup_time CHECK (completed_at IS NULL OR completed_at >= scheduled_at)
);

-- Operational indexes for availability and pickup workflows.
CREATE INDEX idx_donations_org_status_expiry ON donations(donor_org_id, status, expires_at);
CREATE INDEX idx_requests_org_status_needed ON ngo_requests(ngo_org_id, status, needed_by);
CREATE INDEX idx_allocations_donation_status ON allocations(donation_id, status);
CREATE INDEX idx_allocations_request_status ON allocations(request_id, status);
-- Vector similarity indexes (pgvector cosine distance).
CREATE INDEX idx_donations_embedding ON donations USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_requests_embedding ON ngo_requests USING hnsw (embedding vector_cosine_ops);

COMMIT;
