import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

async function DashboardContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/admin");
  const donor = user.role === "DONOR";
  const summary = donor
    ? await db.query<{ total: string; open: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE status = 'AVAILABLE')::text AS open
           FROM donations WHERE donor_org_id = $1`, [user.orgId]
      )
    : await db.query<{ total: string; open: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE status = 'OPEN')::text AS open
           FROM ngo_requests WHERE ngo_org_id = $1`, [user.orgId]
      );
  const counts = summary.rows[0] ?? { total: "0", open: "0" };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5">
          <Link href="/" className="text-xl font-bold text-emerald-800">FoodBridge</Link>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-7 px-5 py-10">
        <div>
          <p className="mb-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{donor ? "DONOR" : "NGO"} DASHBOARD</p>
          <h1 className="text-3xl font-bold">Welcome, {user.fullName}</h1>
          <p className="mt-2 text-slate-600">{user.orgName} · {user.email}</p>
          <p className="mt-2 text-sm text-slate-500">Organization verification: {user.verificationStatus}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Your {donor ? "donations" : "requests"}</p>
            <p className="mt-2 text-4xl font-bold">{counts.total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{donor ? "Available donations" : "Open requests"}</p>
            <p className="mt-2 text-4xl font-bold text-emerald-700">{counts.open}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Your access level</p>
            <p className="mt-2 text-2xl font-bold">{donor ? "Food donor" : "NGO"}</p>
          </div>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">What would you like to do?</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={donor ? "/donations" : "/requests"}
              className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800">
              {donor ? "Create / view donations" : "Create / view NGO requests"}
            </Link>
            <Link href={donor ? "/requests" : "/donations"}
              className="rounded-xl border border-emerald-700 px-5 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-50">
              {donor ? "Browse NGO requirements" : "Browse available food"}
            </Link>
            <Link href="/allocations"
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-700">
              {donor ? "Schedule pickups / track allocations" : "Find food matches / reserve / track deliveries"}
            </Link>
            <Link href="/activity"
              className="rounded-xl border border-emerald-700 px-5 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-50">
              Pickup logs & food inspections (MongoDB)
            </Link>
          </div>
        </section>
        <p className="text-sm text-slate-600">Food allocations, semantic food matching, and MongoDB activity are available from the navigation above.</p>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50 p-10 text-slate-700">Loading your dashboard…</main>}><DashboardContent /></Suspense>;
}
