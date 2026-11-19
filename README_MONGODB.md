# FoodBridge — MongoDB Pickup Activity and Food Inspections

**Project:** Food Waste Redistribution and Resource Allocation System  
**Team:** Sruthi Vejju (PES1UG24CS472), Shubashitha Gowtham (PES1UG24CS450)

## What this module adds

- `/activity` — authenticated MongoDB activity and food inspection page, linked from the dashboard.
- `pickup_activity` — logs new pickup scheduling, collection, and delivery events as flexible MongoDB documents.
- `food_inspections` — donor-written inspection observations, with condition, packaging, optional temperature and notes.
- NGOs can read inspection notes only for donations actually allocated to their organization.
- Existing pickup records are shown as **recovered current-status snapshots**, not invented past events. This is useful for the pickup you already scheduled before installing this module.
- MongoDB document indexes on event key, organization IDs, and donation ID.

## Assumptions

1. Already running: Docker PostgreSQL `foodwaste-postgres` and MongoDB `foodwaste-mongo`.
2. PostgreSQL `schema.sql` and `advanced_features.sql` have been executed.
3. The earlier authentication, donations/requests, allocation/pickup and semantic-matching ZIP modules are already installed.
4. The `mongodb` npm package is installed in your Next.js project.
5. `.env.local` includes the **application user's**, not MongoDB administrator's, connection credentials:

```
MONGODB_HOST=127.0.0.1
MONGODB_PORT=27018
MONGODB_USER=foodwaste_app
MONGODB_PASSWORD="YOUR_APP_PASSWORD"
MONGODB_DB=food_waste_logs
MONGODB_AUTH_DB=food_waste_logs
```

**Never upload `.env.local` to GitHub.**

## Install on Windows

From inside `food-waste-web` (the directory with `package.json`):

```powershell
Expand-Archive -LiteralPath "$HOME\Downloads\FoodBridge_MongoDB_Integration.zip" -DestinationPath . -Force
```

If the ZIP was saved elsewhere, use that full path in `-LiteralPath`.

This **replaces** these three existing files:

- `src/app/api/pickups/route.ts`
- `src/app/api/pickups/[id]/route.ts`
- `src/app/dashboard/page.tsx`

It **adds** six files:

- `src/lib/mongodb.ts`
- `src/lib/mongo-activity.ts`
- `src/app/api/activity/pickups/route.ts`
- `src/app/api/inspections/route.ts`
- `src/app/activity/page.tsx`
- `src/components/MongoWorkspace.tsx`

It does **not** change any SQL tables, `.env.local`, auth files, or semantic matching files.

Restart Next.js (`Ctrl+C` in the existing dev server, then `npm.cmd run dev`) and visit:

`http://localhost:3000/activity`

**First check:** In your donor or NGO account, the `/activity` page should display the pickup you previously scheduled. Because that pickup existed before this module, it is labeled **Recovered status snapshot**.

**Second check:** Log in as donor, select one of your donations on `/activity`, enter inspection details, and select **Save inspection to MongoDB**. The new record should appear under Food inspection records.

**Third check:** Schedule a new pickup using `/allocations`, and return to `/activity`. The new event should be labeled **Recorded event** (source: `workflow`).

## Database design and consistency

- PostgreSQL is the source of truth for donors, requests, allocations, and pickup status. MongoDB holds flexible activity and inspection documents.
- PostgreSQL and MongoDB **do not share one atomic transaction**. A valid PostgreSQL pickup action remains successful even if MongoDB logging fails. In that case the API returns `mongoEventLogged: false` and a warning (the existing UI may not surface the warning). Opening `/activity` later recovers the **current SQL status only**. It cannot reconstruct the original event time or complete event history.
- For a production deployment, implement a durable transactional outbox or change stream for stronger guarantees. The approach here is an explicitly disclosed mini-project demo strategy; do not claim an atomic cross-database transaction.
- Records in `pickup_activity` use unique `event_key`, and are indexed for efficient organization-scoped activity lookup.
- Inspections are observational notes, not professional food safety approvals. They do not override expiry or reservation eligibility rules.

## Demo talking points

- Why MongoDB? Activity logs and inspections have flexible document fields, such as optional temperature and free-text observations.
- Why PostgreSQL? Quantities, foreign keys, status transitions and allocation concurrency need structured transactional integrity.
- How are they linked? MongoDB documents hold PostgreSQL IDs (`pickup_id`, `allocation_id`, `donation_id`) as **strings**. These are references at the application layer, not cross-database foreign-key constraints.
- Why indexes? `event_key` unique for idempotency; organization/date index for activity; donation/date index for inspections.

## Known limitations

- No cross-database foreign keys or distributed transaction.
- Current history recovery is a state snapshot, not a complete backfilled historical timeline.
- `food_inspections` does not automatically block unsafe food; it only records observations.
- End-to-end tests must still be performed on both team members' machines.
