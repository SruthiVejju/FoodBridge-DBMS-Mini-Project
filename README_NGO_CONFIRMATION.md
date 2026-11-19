# FoodBridge — NGO Condition Confirmation Module

**Project:** Food Waste Redistribution and Resource Allocation System  
**Team:** Sruthi Vejju (PES1UG24CS472) · Shubashitha Gowtham (PES1UG24CS450)

## What's included

- `src/app/api/ngo-condition-confirmations/route.ts` — NGO-only GET/POST endpoints. Every record is authorized against PostgreSQL allocation ownership.
- `src/components/NGOConditionConfirmation.tsx` — shows donor's most recent declaration and allows the receiving NGO to add a condition observation **only after collection**.
- `src/app/activity/page.tsx` — adds the new section to the NGO Activity page; donors retain their existing activity screen.

All other files remain unchanged. No SQL migration, table changes, or extra npm packages are required. The MongoDB application user must retain `readWrite` permissions in `food_waste_logs`.

## Installation

Inside `food-waste-web` (same directory as `package.json`):

```powershell
Expand-Archive -LiteralPath "$HOME\Downloads\FoodBridge_NGO_Condition_Confirmation.zip" -DestinationPath . -Force
```

The package **replaces only** `src/app/activity/page.tsx`. It does not replace `.env.local`, the MongoDB connection library, donor inspections, or pickup APIs. Restart Next.js if needed, then sign in as Helping Hands NGO and open `http://localhost:3000/activity`.

## What to expect *now*

The NGO can **review the donor declaration immediately**, but its confirmation form will be unavailable while pickup is `SCHEDULED`. The reserved pickup for Allocation #6 is scheduled for **20 November 2026, 10:00 AM**, so don't claim pickup has occurred before collection.

Once food is actually collected: donor marks it `PICKED_UP` on `/allocations`; then NGO visits `/activity`, chooses whether the food matches the donor's declaration, and writes observations. The confirmation is saved to a new MongoDB collection, `ngo_condition_confirmations`. A unique index on `allocation_id` allows only one such record per allocation. It does **not** automatically change delivery status in PostgreSQL; that remains a separate NGO action on `/allocations`.

## DBMS explanations

PostgreSQL manages allocations, ownership, pickup state and transactional integrity. MongoDB stores flexible, timestamped donor observations and NGO comparisons. Application-level IDs link the records. There is no distributed transaction between PostgreSQL and MongoDB, and no claim of third-party inspection or food safety certification.

## Limitations and future work

- One NGO observation per allocation; editing or disputing an earlier submission would require a new append-only history mechanism.
- The donor declaration shown on screen is the *latest* note for that donation. The NGO's saved confirmation snapshots that donor note so later donor edits won't rewrite what the NGO saw at confirmation time.
- Unsafe findings are recorded for review; they **do not automatically cancel an allocation, quarantine food, or notify an administrator**. Do not treat them as a food-safety control.
- The generated files have been checked for TypeScript syntax, but full end-to-end testing must happen in your running app with your databases.
