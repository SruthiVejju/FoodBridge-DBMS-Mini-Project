import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import DonationForm from "@/components/DonationForm";
import LogoutButton from "@/components/LogoutButton";

type DonationRow = {
  donation_id: string;
  food_name: string;
  description: string;
  category: string;
  total_qty?: string;
  available_qty: string;
  unit: string;
  expires_at: Date;
  status?: string;
  donor_name?: string;
};

function dateText(date: Date) {
  return new Date(date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

async function DonationsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const donor = user.role === "DONOR";
  const result = donor
    ? await db.query<DonationRow>(
        `SELECT d.donation_id, d.food_name, d.description, d.category,
                d.total_qty, a.available_qty, d.unit, d.expires_at, d.status
           FROM donations d
           JOIN donation_availability a ON a.donation_id = d.donation_id
          WHERE d.donor_org_id = $1
          ORDER BY d.created_at DESC, d.donation_id DESC LIMIT 100`,
        [user.orgId]
      )
    : await db.query<DonationRow>(
        `SELECT d.donation_id, d.food_name, d.description, d.category,
                a.available_qty, d.unit, d.expires_at, o.org_name AS donor_name
           FROM donations d
           JOIN donation_availability a ON a.donation_id = d.donation_id
           JOIN organizations o ON o.org_id = d.donor_org_id
          WHERE d.status = 'AVAILABLE' AND d.expires_at > NOW() AND a.available_qty > 0
          ORDER BY d.expires_at ASC, d.donation_id DESC LIMIT 100`
      );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
          <Link href="/dashboard" className="text-xl font-bold text-emerald-800">FoodBridge</Link>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/dashboard" className="hover:text-emerald-700">Dashboard</Link>
            <Link href="/requests" className="hover:text-emerald-700">NGO requests</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-7 px-5 py-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">{donor ? "Donor workspace" : "NGO discovery"}</p>
          <h1 className="mt-2 text-3xl font-bold">{donor ? "Manage your donations" : "Available food donations"}</h1>
          <p className="mt-2 text-slate-600">{donor
            ? "List fresh surplus food and monitor remaining quantities."
            : "Browse currently available food. Allocation and pickup booking will be added in the next module."}</p>
        </div>
        {donor && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-bold">Publish a donation</h2>
            <DonationForm />
          </section>
        )}
        <section>
          <h2 className="mb-4 text-xl font-bold">{donor ? "Your listed donations" : "Food available from donors"}</h2>
          {result.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-slate-600">No donations to show yet.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {result.rows.map((row) => (
                <article key={row.donation_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{row.category}</p>
                      <h3 className="mt-1 text-lg font-bold">{row.food_name}</h3>
                    </div>
                    {row.status && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{row.status}</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{row.description}</p>
                  {row.donor_name && <p className="mt-3 text-sm">Donor: <strong>{row.donor_name}</strong></p>}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    {row.total_qty != null && <span>Total: <strong>{Number(row.total_qty)} {row.unit}</strong></span>}
                    <span>Remaining: <strong className="text-emerald-700">{Number(row.available_qty)} {row.unit}</strong></span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Expires: {dateText(row.expires_at)}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function DonationsPage() {
  return <Suspense fallback={<div className="p-10 text-slate-700">Loading donations…</div>}><DonationsContent /></Suspense>;
}
