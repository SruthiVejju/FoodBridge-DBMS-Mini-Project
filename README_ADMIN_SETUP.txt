FoodBridge admin role + user removal patch - apply to your EXISTING food-waste-web folder.

FIRST-TIME ADMIN SETUP:
1. Extract/copy this archive's database/, src/ and scripts/ folders into your existing food-waste-web folder, merging folders.
2. Run: node scripts/apply-admin-patch.cjs
   (updates auth role, dashboard redirect, future fresh-install SQL; can be rerun safely).
3. Run SQL migration against your existing Docker PostgreSQL database:
   docker cp database/add_admin_role.sql foodwaste-postgres:/tmp/add_admin_role.sql
   docker exec foodwaste-postgres psql -U foodwaste_user -d food_waste_db -v ON_ERROR_STOP=1 -f /tmp/add_admin_role.sql
4. Create ADMIN login in PowerShell (password never saved to a source file):
   $env:ADMIN_EMAIL = Read-Host "Admin email"
   $secret = Read-Host "Admin password (min 8 characters)" -AsSecureString
   $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
   node scripts/create-admin.cjs
   Remove-Item Env:ADMIN_EMAIL,Env:ADMIN_PASSWORD
5. Restart server: npm.cmd run dev
6. Sign in as ADMIN and visit http://localhost:3000/admin.

IF YOU ALREADY INSTALLED THE EARLIER ADMIN PATCH:
1. Extract this UPDATED ZIP into food-waste-web, overwriting old admin component/page.
2. No extra SQL migration is needed for the Remove user feature.
3. Restart Next.js. You can re-run node scripts/apply-admin-patch.cjs (safe) if desired.

ADMIN FEATURES:
- Verify or reject donor and NGO organizations.
- List donor and NGO user accounts with names, emails, organization and role.
- Click Remove user; type that user's email to confirm permanent deletion.
- Delete only the users row; organization and food/allocation/pickup history is kept.
- Admin users are not listed and cannot be removed through this endpoint.
- Removed users lose access on their next authenticated request, including if already logged in.

SAFETY:
- This is permanent account deletion. Make a backup before testing; use a disposable demo user.
- Public registration does NOT allow ADMIN accounts.
- Keep .env.local, passwords and database dumps out of GitHub.
- This ZIP contains application source only: it doesn't alter your running database until you execute setup steps.
