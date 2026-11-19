import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import MongoWorkspace from "@/components/MongoWorkspace";
import NGOConditionConfirmation from "@/components/NGOConditionConfirmation";

async function ActivityContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
          <Link href="/dashboard" className="text-xl font-bold text-emerald-800">FoodBridge</Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            <Link href="/dashboard" className="hover:text-emerald-700">Dashboard</Link>
            <Link href="/allocations" className="hover:text-emerald-700">Allocations</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 px-5 py-10">
        <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">{user.role} · {user.orgName}</p>
        <h1 className="text-3xl font-bold">Pickup Activity & Food Inspections</h1>
        <p className="text-slate-600">Flexible MongoDB documents linked to PostgreSQL donations and pickups. Your organization sees only records it is authorized to access.</p>
        <MongoWorkspace role={user.role} />
        {user.role === "NGO" && <NGOConditionConfirmation />}
      </div>
    </main>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-10 text-slate-700">Loading MongoDB activity…</main>}>
      <ActivityContent />
    </Suspense>
  );
}
