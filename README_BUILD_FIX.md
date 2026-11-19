# FoodBridge — Next.js 16 production build warning fix

This patch addresses the three GET API routes that logged `HANGING_PROMISE_REJECTION` while Next.js 16 with Cache Components attempted to prerender them.

## What changed
- `src/app/api/auth/me/route.ts`
- `src/app/api/activity/pickups/route.ts`
- `src/app/api/allocations/matches/route.ts`

Each GET handler now runs `await connection()` **before** its `try/catch`. This instructs Next.js to defer the handler until an actual incoming request, instead of catching a prerender interruption and logging it as an application error.

No database schema, secrets, session cryptography, SQL queries, MongoDB calls or UI have been changed.

## Install (from food-waste-web root in PowerShell)
`Expand-Archive -LiteralPath "$HOME\Downloads\FoodBridge_Nextjs16_Build_Fix.zip" -DestinationPath . -Force`

## Verify
`npm.cmd run build`

Expected: successful compile/types and no `HANGING_PROMISE_REJECTION` logs for these three routes. Afterwards, test `/api/auth/me`, `/allocations`, `/activity` while signed in and signed out.

This patch was derived from the project code files in the previously shared module ZIPs. If you manually modified those three exact API routes since installing the modules, compare changes before overwriting.

Reference: https://nextjs.org/docs/app/api-reference/functions/connection
