# FoodBridge 3NF Finalization — Apply this package to your WORKING project

Project: Food Waste Redistribution and Resource Allocation System

Team: Sruthi Vejju (PES1UG24CS472); Shubashitha Gowtham (PES1UG24CS450)

## Important order

1. **STOP** Next.js (`Ctrl+C` in the `npm.cmd run dev` terminal). Do not run the server during migration.
2. Confirm you have saved the PostgreSQL backup `food_waste_backup.dump` outside `food-waste-web`.
3. Extract this ZIP into the ROOT of `food-waste-web` with `Expand-Archive ... -DestinationPath . -Force`.
4. From the `food-waste-web` PowerShell terminal, run **exactly once**:

   `Get-Content -Raw .\database\migrate_existing_database_3nf.sql | docker exec -i foodwaste-postgres psql -v ON_ERROR_STOP=1 -U foodwaste_user -d food_waste_db`

   Expected: `NOTICE: 3NF MIGRATION VERIFIED: 6 tables, 54 columns, 6 PKs, 6 FKs` followed by `COMMIT`.
   If you see `ERROR` or no `COMMIT`, stop and share the output; PostgreSQL rolls back the migration.
5. Restart the website: `npm.cmd run dev`.
6. Test existing donor and NGO login, registration for a **new** test user, `/dashboard`, `/api/health`, `/donations`, `/requests`, `/allocations`, `/activity`.
7. Run `npm.cmd run build` after stopping dev server; verify clean build.
8. Print ONLY the new PDFs in `diagrams/` AFTER the application and database checks pass. Old 55-column PDFs are outdated.

## What changed
- Database `users.role` is removed (it duplicated `organizations.org_type`).
- `src/lib/auth.ts` now selects `o.org_type AS role`, retaining the SAME `CurrentUser.role` interface used by pages and APIs.
- Registration inserts into `users` WITHOUT the removed column.
- The old `trg_users_org_type` trigger is removed. Donor-only/NGO-only constraints remain on donations and requests.
- Database has 6 tables, 54 attributes, six primary keys, six foreign keys. No stored accounts, allocations or pickup rows are deleted.
- No MongoDB collections or data are modified.

## Supplied files
- `database/migrate_existing_database_3nf.sql` - run only for an existing database.
- `database/schema_3nf.sql` - complete schema for clean future installs, **DO NOT run on your existing database**.
- `database/advanced_features_3nf.sql` - advanced functions for clean future installs, **DO NOT run now**.
- `database/sample_data_and_tests_3nf.sql` - updated example data for new environments, **DO NOT rerun on existing demo data**.
- `database/FoodBridge_Final_Database_Tests.sql` - separate non-destructive tests, if needed later.
- `diagrams/ER_Diagram_Exact_3NF.pdf` and `diagrams/Relational_Schema_Exact_3NF.pdf` are current print candidates, not proof of execution.

## Note on 3NF
The role duplication was a definite transitive functional dependency: users.user_id -> users.org_id -> organizations.org_type (the same value was stored in users.role). By deriving role from organization, that known redundancy is removed. A strict proof of 3NF for every table still requires validating all real-world functional dependencies and business assumptions.

## Safety
Do not upload `.env.local`, password hashes, database backups, or secrets to GitHub. The migration is transactional and does not delete accounts or donations.
