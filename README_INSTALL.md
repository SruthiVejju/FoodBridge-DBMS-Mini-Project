# FoodBridge — Allocation & Pickup Module

## What this adds

- `/allocations`: role-aware page linked from the dashboard.
- NGOs can select their existing request, view eligible donations (same category and unit, positive available quantity), and reserve food.
- Donors see NGO reservations against their donations, schedule one pickup per allocation, and mark collected.
- NGOs confirm delivery after pickup.
- The backend uses the existing `reserve_food()` PostgreSQL function and the `enforce_allocation_limits` trigger (from `advanced_features.sql`). No schema changes required.
- API uses authenticated role/organization checks and parameterized SQL queries.

**Matching is currently deterministic, NOT semantic or AI-based.** Real pgvector embeddings/matching will be added in the next module. Existing synthetic demo vectors do not represent real food semantics.

## Prerequisites

1. PostgreSQL Docker container `foodwaste-postgres` is running.
2. You have already run `schema.sql`, `advanced_features.sql`, and the sample tests.
3. Existing Next.js app has the earlier Authentication and Donations/Requests modules installed.
4. Dependencies `pg`, `zod`, `jose`, `bcryptjs` already installed. No additional packages needed.

## Installation (Windows PowerShell)

From `food-waste-web` after downloading the ZIP into Downloads:

```powershell
Expand-Archive -LiteralPath "$HOME\Downloads\Food_Waste_Allocation_Pickup_Module.zip" -DestinationPath . -Force
```

The ZIP adds new API routes, UI and validation file, and **replaces `src/app/dashboard/page.tsx` only** to add the new navigation link. No `.env.local`, `db.ts`, tables or existing API files are changed.

Restart `npm.cmd run dev` if it was already running, then open:

`http://localhost:3000/allocations`

## Quick end-to-end demo

1. Sign in as Helping Hands NGO, open `/allocations`.
2. Select the 10-serving cooked-food request you created. Find Vegetable Biryani (15 servings) in the eligible matches.
3. Reserve `10` servings. Expect a new reservation and 5 servings remaining for the donor's biryani.
4. Log out; sign in as FreshBite Restaurant donor; open `/allocations`.
5. Schedule pickup for a future time **before both** the food's expiry time and the NGO's needed-by time.
6. At/after scheduled time, select **Mark picked up**.
7. Log out; sign in as Helping Hands NGO; select **Confirm delivered**.

### Important timing note

Your prior demo donation had expiry Nov 23, 2026, 5pm. You may need to use a new future-dated donation and a new future-dated NGO request if those dates have passed by the time you test, or if the needed-by window is too short. Schedule pickups after the current local time but before both deadlines.

## Database safety

- Do **not** run schema.sql again; it contains CREATE TABLE statements.
- Do **not** rerun the seed-data script; it may reject duplicate demo records.
- Do **not** delete the data volume.
- A successful reservation uses an atomic stored function call; the trigger validates availability and row-locks parent records to guard against competing allocation requests.
- Pickups are limited to one per allocation by `UNIQUE (allocation_id)`.

## Files

- `src/app/allocations/page.tsx`
- `src/components/AllocationWorkspace.tsx`
- `src/lib/workflow-validation.ts`
- `src/app/api/allocations/route.ts`
- `src/app/api/allocations/matches/route.ts`
- `src/app/api/pickups/route.ts`
- `src/app/api/pickups/[id]/route.ts`
- `src/app/dashboard/page.tsx` (updated navigation)

## Limitations for later stages

- Test module; no separate admin/verification interface.
- No MongoDB event logging yet.
- No real embeddings yet, so `match_score` remains NULL for new allocations.
- No automated expiry cleanup; expired donations simply stop being eligible.
- End-to-end and concurrent-session testing still need to be run on your machine.
