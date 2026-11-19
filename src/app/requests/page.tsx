import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import NGORequestForm from "@/components/NGORequestForm";
import LogoutButton from "@/components/LogoutButton";

type RequestRow = {
  request_id: string;
  description: string;
  category: string;
  requested_qty?: string;
  remaining_qty: string;
  unit: string;
  needed_by: Date;
  priority: string;
  status?: string;
  ngo_name?: string;
};

function dateText(date: Date) {
  return new Date(date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

async function RequestsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ngo = user.role === "NGO";
  const result = ngo
    ? await db.query<RequestRow>(
        `SELECT r.request_id, r.description, r.category, r.requested_qty,
                a.remaining_qty, r.unit, r.needed_by, r.priority, r.status
           FROM ngo_requests r
           JOIN ngo_request_availability a ON a.request_id = r.request_id
          WHERE r.ngo_org_id = $1
          ORDER BY r.created_at DESC, r.request_id DESC LIMIT 100`,
        [user.orgId]
      )
    : await db.query<RequestRow>(
        `SELECT r.request_id, r.description, r.category, a.remaining_qty,
                r.unit, r.needed_by, r.priority, o.org_name AS ngo_name
           FROM ngo_requests r
           JOIN ngo_request_availability a ON a.request_id = r.request_id
           JOIN organizations o ON o.org_id = r.ngo_org_id
          WHERE r.status = 'OPEN' AND r.needed_by > NOW() AND a.remaining_qty > 0
          ORDER BY r.needed_by ASC, r.request_id DESC LIMIT 100`
      );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
          <Link href="/dashboard" className="text-xl font-bold text-emerald-800">FoodBridge</Link>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/dashboard" className="hover:text-emerald-700">Dashboard</Link>
            <Link href="/donations" className="hover:text-emerald-700">Donations</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-7 px-5 py-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">{ngo ? "NGO workspace" : "Donor discovery"}</p>
          <h1 className="mt-2 text-3xl font-bold">{ngo ? "Manage food requests" : "Food needed by NGOs"}</h1>
          <p className="mt-2 text-slate-600">{ngo
            ? "Submit your food requirements and monitor remaining quantities."
            : "See open food requirements. Automatic matching and allocation are coming in the next module."}</p>
        </div>
        {ngo && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-bold">Create a food request</h2>
            <NGORequestForm />
          </section>
        )}
        <section>
          <h2 className="mb-4 text-xl font-bold">{ngo ? "Your NGO requests" : "Open NGO requirements"}</h2>
          {result.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-600">No requests to show yet.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {result.rows.map((row) => (
                <article key={row.request_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{row.category}</p>
                      <h3 className="mt-1 text-lg font-bold">Request #{row.request_id}</h3>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{row.priority}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{row.description}</p>
                  {row.ngo_name && <p className="mt-3 text-sm">NGO: <strong>{row.ngo_name}</strong></p>}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    {row.requested_qty != null && <span>Requested: <strong>{Number(row.requested_qty)} {row.unit}</strong></span>}
                    <span>Remaining: <strong className="text-emerald-700">{Number(row.remaining_qty)} {row.unit}</strong></span>
                    {row.status && <span>Status: {row.status}</span>}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Needed by: {dateText(row.needed_by)}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function RequestsPage() {
  return <Suspense fallback={<div className="p-10 text-slate-700">Loading NGO requests…</div>}><RequestsContent /></Suspense>;
}
