# Food Waste Redistribution — Stage 6 Authentication Pack

Team Member 1: Sruthi Vejju — PES1UG24CS472  
Team Member 2: Shubashitha Gowtham — PES1UG24CS450

## Compatibility

- Existing `food-waste-web` Next.js 16 App Router project
- Already-created `src/lib/db.ts`, `src/app/api/health/route.ts`, and PostgreSQL tables
- Installed packages: `pg`, `bcryptjs`, `jose`, `zod`, TypeScript and Tailwind
- `.env.local` with the working DB credentials and **one** `SESSION_SECRET`

## Install

1. Extract/copy the `src/` folder from this ZIP **into the root of your existing `food-waste-web` folder**, merging with your existing `src/` directory.
2. This pack replaces the default starter `src/app/page.tsx` and `src/app/layout.tsx`. It adds new files under `src/components`, `src/lib`, `src/app/api/auth`, `src/app/login`, `src/app/register`, and `src/app/dashboard`.
3. It **does not** include or replace `src/lib/db.ts`, `src/app/api/health/route.ts`, your database scripts, `package.json`, `.env.local`, or `globals.css`.
4. Confirm `.env.local` still has `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SESSION_SECRET` and **never commit it**.
5. Restart `npm.cmd run dev` in `food-waste-web`.
6. Visit http://localhost:3000/register, register a **new** donor or NGO account. The supplied sample seed users may not have usable passwords for login.
7. After registering, you should reach `/dashboard`. Test logout then login with the same email/password.

## Implementation

- Registration inserts `organizations` + `users` in a **single SQL transaction** and derives `users.role` from `organizations.org_type`.
- Passwords are hashed with bcrypt (cost 12).
- JWT sessions use `jose` with HS256, stored in 7-day HttpOnly, SameSite=Lax cookies; Secure flag applies in production HTTPS.
- Session check reads the current user and organization from PostgreSQL; database queries remain server-side.
- Login updates `users.last_login_at`.
- Dashboard reads the current organization's count of donations or NGO requests.
- Errors, missing credentials, invalid login, duplicate email, and invalid fields are handled.

## Demo limitations / future work

- This is an **authentication + basic dashboard module**, not the complete website. Donation management, NGO request CRUD, matching/allocation/pickups, MongoDB, and full admin approval are still upcoming.
- Organizations start with `verification_status = 'PENDING'`. The pack displays this status but does not yet enforce approval before transactions.
- For deployment beyond a local course demo, add login rate limiting / lockouts, email verification, password reset, secure account-recovery flow, production monitoring, token revocation and a robust CSRF strategy for all state-changing routes. Do not expose the dev server publicly.
- The local project has known npm development-dependency audit warnings to resolve before submission.

## Post-install quick checks

- `npm.cmd run dev`
- Visit http://localhost:3000/register
- Visit http://localhost:3000/api/auth/me when logged out: `{"authenticated":false}` with HTTP 401
- Register a fresh donor: redirects to `/dashboard` and displays donor role
- Log out: `/dashboard` should redirect to `/login` when accessed again
- Log back in: correct password works, wrong password is rejected

## Important note

These files have been reviewed against the provided SQL structure. Their integration with your exact local Next.js installation needs to be verified through the above runtime checks. Do not consider the full application done yet.
