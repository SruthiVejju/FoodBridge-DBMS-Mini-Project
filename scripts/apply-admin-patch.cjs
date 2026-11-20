// Patch existing FoodBridge role type, dashboard routing, and future fresh-install SQL.
const fs = require('fs');
function patch(path, from, to, marker) {
  const original = fs.readFileSync(path, 'utf8');
  if (original.includes(marker)) { console.log('Already patched:', path); return; }
  if (!original.includes(from)) throw new Error(`Expected text not found in ${path}; edit manually`);
  fs.writeFileSync(path, original.replace(from, to), 'utf8');
  console.log('Updated:', path);
}
patch('src/lib/auth.ts',
  'export type UserRole = "DONOR" | "NGO";',
  'export type UserRole = "DONOR" | "NGO" | "ADMIN";',
  'export type UserRole = "DONOR" | "NGO" | "ADMIN";');
patch('src/app/dashboard/page.tsx',
  'if (!user) redirect("/login");',
  'if (!user) redirect("/login");\n  if (user.role === "ADMIN") redirect("/admin");',
  'if (user.role === "ADMIN") redirect("/admin");');
patch('database/schema_3nf.sql',
  "CHECK (org_type IN ('DONOR','NGO'))",
  "CHECK (org_type IN ('DONOR','NGO','ADMIN'))",
  "CHECK (org_type IN ('DONOR','NGO','ADMIN'))");
console.log('Admin code patch completed. Now run the database migration.');
