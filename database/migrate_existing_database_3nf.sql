-- FOODBRIDGE: EXISTING DATABASE 3NF MIGRATION
-- Project: Food Waste Redistribution and Resource Allocation System
-- Sruthi Vejju - PES1UG24CS472
-- Shubashitha Gowtham - PES1UG24CS450
-- Run once AFTER making a backup and while the Next.js server is stopped.
-- Safe to retry: refuses mismatched role data and uses IF EXISTS for column.
-- Does not remove accounts, passwords, donation/allocation/pickup records.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '15s';

-- Make sure the old values are consistent before dropping the redundant column.
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='role'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM users u JOIN organizations o ON o.org_id = u.org_id
      WHERE u.role IS DISTINCT FROM o.org_type
    ) THEN
      RAISE EXCEPTION 'Migration blocked: users.role differs from organizations.org_type; review manually';
    END IF;
  END IF;
END;
$check$;

-- This trigger depends on the old users.role column.
DROP TRIGGER IF EXISTS trg_users_org_type ON users;
ALTER TABLE users DROP COLUMN IF EXISTS role;

-- Organization type is now the single source of truth for the app's donor/NGO role.
-- Keep donation and request role protection, while removing users.role references.
CREATE OR REPLACE FUNCTION enforce_organization_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $body$
DECLARE v_org_type VARCHAR(10);
BEGIN
  IF TG_TABLE_NAME = 'donations' THEN
    SELECT org_type INTO v_org_type FROM organizations WHERE org_id = NEW.donor_org_id;
    IF v_org_type IS DISTINCT FROM 'DONOR' THEN
      RAISE EXCEPTION 'donor_org_id must reference a DONOR organization';
    END IF;
  ELSIF TG_TABLE_NAME = 'ngo_requests' THEN
    SELECT org_type INTO v_org_type FROM organizations WHERE org_id = NEW.ngo_org_id;
    IF v_org_type IS DISTINCT FROM 'NGO' THEN
      RAISE EXCEPTION 'ngo_org_id must reference an NGO organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$body$;

-- Verify structure and integrity before committing.
DO $verify$
DECLARE v_cols INTEGER; v_fks INTEGER; v_pks INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name IN
    ('organizations','users','donations','ngo_requests','allocations','pickups');
  SELECT COUNT(*) INTO v_fks FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace AND contype='f'
    AND conrelid IN ('organizations'::regclass,'users'::regclass,
      'donations'::regclass,'ngo_requests'::regclass,
      'allocations'::regclass,'pickups'::regclass);
  SELECT COUNT(*) INTO v_pks FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace AND contype='p'
    AND conrelid IN ('organizations'::regclass,'users'::regclass,
      'donations'::regclass,'ngo_requests'::regclass,
      'allocations'::regclass,'pickups'::regclass);
  IF v_cols <> 54 OR v_fks <> 6 OR v_pks <> 6 THEN
    RAISE EXCEPTION 'Post-migration structure incorrect: columns=%, FKs=%, PKs=%',v_cols,v_fks,v_pks;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'users'::regclass AND tgname = 'trg_users_org_type' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Obsolete users.role trigger still exists';
  END IF;
  RAISE NOTICE '3NF MIGRATION VERIFIED: 6 tables, 54 columns, 6 PKs, 6 FKs';
END;
$verify$;
COMMIT;
