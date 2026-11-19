import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AllocationWorkspace from "@/components/AllocationWorkspace";
import LogoutButton from "@/components/LogoutButton";

async function AllocationsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
          <Link href="/dashboard" className="text-xl font-bold text-emerald-800">FoodBridge</Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            <Link href="/dashboard" className="hover:text-emerald-700">Dashboard</Link>
            <Link href="/donations" className="hover:text-emerald-700">Donations</Link>
            <Link href="/requests" className="hover:text-emerald-700">NGO requests</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-7 px-5 py-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">{user.role} workflow</p>
          <h1 className="mt-2 text-3xl font-bold">Food allocation and pickup tracking</h1>
          <p className="mt-2 text-slate-600">{user.orgName} · Reserve food safely, schedule collection, and track delivery.</p>
        </div>
        <AllocationWorkspace role={user.role} />
      </div>
    </main>
  );
}

export default function AllocationsPage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50 p-10">Loading allocation workflow…</main>}><AllocationsContent /></Suspense>;
}
