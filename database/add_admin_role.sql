-- Run once against the existing FoodBridge PostgreSQL database.
BEGIN;
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'organizations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%org_type%'
  LOOP
    EXECUTE format('ALTER TABLE organizations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE organizations ADD CONSTRAINT organizations_org_type_check
CHECK (org_type IN ('DONOR', 'NGO', 'ADMIN'));
COMMIT;
