# FoodBridge: Donation + NGO Request Management Module

Built for **Food Waste Redistribution and Resource Allocation System**
- Sruthi Vejju — PES1UG24CS472
- Shubashitha Gowtham — PES1UG24CS450

## What this module includes
- POST/GET `/api/donations` with donor-only creation and role-limited listing.
- POST/GET `/api/requests` with NGO-only creation and role-limited listing.
- `/donations`: donor donation form and own donation list, or NGO view of available donations.
- `/requests`: NGO request form and own request list, or donor view of open NGO requirements.
- Updated `/dashboard` with links and PostgreSQL-based counts.
- Server-side input validation using installed `zod`, session authentication, parameterized SQL, and quantity views from your existing `advanced_features.sql`.

## Install
1. Your working folder should be `food-waste-web`, containing `package.json`.
2. Back up `src/app/dashboard/page.tsx` if you want to keep its previous version.
3. Extract this ZIP into the `food-waste-web` folder, allowing replacement of `src/app/dashboard/page.tsx`.
4. Do not replace `.env.local`, `src/lib/db.ts`, or existing authentication files. They are not in this ZIP.
5. Make sure Docker is running and Next.js can access PostgreSQL (try `/api/health`).
6. Run `npm.cmd run dev` from inside `food-waste-web` (stop an already-running server first if needed).

## Test the donor role
1. Log in to your existing FreshBite donor account.
2. Open `/dashboard` and click **Create / view donations**.
3. Enter any safe sample food, e.g. `Vegetable biryani`, 15 servings, an expiry a few hours in the future, and a pickup location.
4. Click **Publish donation**. A success message with a donation ID should appear, and the new card should appear in the list.
5. Refresh `/dashboard`. Your donation count should increase.

## Test the NGO role
1. Log out. Register an NGO using a different email if you don't already have one.
2. From the NGO dashboard open **Create / view NGO requests**.
3. Enter food requirement details, a future needed-by date and a delivery address; submit.
4. Open `/donations` to browse donor food that is available and unexpired.
5. Return to the donor account and open `/requests` to see open NGO requirements.

## Notes
- Both roles are enforced on the server, not just by hiding UI buttons.
- Data is saved in existing `donations` and `ngo_requests` SQL tables; no DB migration needed.
- Food quantities are stored as `NUMERIC(12,2)` and dates as `TIMESTAMPTZ`.
- The current schema allows `PENDING` organizations to post items (helpful for demos). Add an admin review workflow before deployment.
- No real embeddings are generated in this module. Your `VECTOR(384)` database fields are left `NULL` for new rows, so they won't appear in pgvector similarity matches yet.
- Allocation, pickup workflows, update/delete operations, and concurrency tests will be delivered separately. This is not the whole finished application.
- Your previous sample data may have expired; that's normal, and new future-dated records will demonstrate current availability.
