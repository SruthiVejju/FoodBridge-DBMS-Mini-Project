"use client";

import { useEffect, useState } from "react";

type Role = "DONOR" | "NGO";
type EventItem = {
  id: string;
  pickup_id: string;
  allocation_id: string;
  status: string;
  source: "workflow" | "recovered_snapshot";
  event_at: string | null;
  observed_at: string;
};
type Inspection = {
  id: string;
  donation_id: string;
  condition: string;
  packaging: string;
  temperature_c: number | null;
  notes: string;
  checked_at: string;
};
type Donation = { donation_id: string; food_name: string };

async function requestJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...options });
  let payload: Record<string, unknown>;
  try { payload = await response.json(); }
  catch { throw new Error(`Server returned an invalid response (${response.status})`); }
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
  return payload as T;
}

function dateText(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Unknown";
}

export default function MongoWorkspace({ role }: { role: Role }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [donationId, setDonationId] = useState("");
  const [condition, setCondition] = useState("GOOD");
  const [packaging, setPackaging] = useState("SEALED");
  const [temp, setTemp] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [activity, inspectionData, donationData] = await Promise.all([
          requestJSON<{ events: EventItem[] }>("/api/activity/pickups"),
          requestJSON<{ inspections: Inspection[] }>("/api/inspections"),
          role === "DONOR" ? requestJSON<{ donations: Donation[] }>("/api/donations") : Promise.resolve({ donations: [] }),
        ]);
        if (!active) return;
        setEvents(activity.events);
        setInspections(inspectionData.inspections);
        setDonations(donationData.donations);
        setDonationId((current) => donationData.donations.some((d) => d.donation_id === current)
          ? current : (donationData.donations[0]?.donation_id ?? ""));
        setError("");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to fetch MongoDB records");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [role, refresh]);

  async function submitInspection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!donationId) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await requestJSON("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donationId, condition, packaging,
          temperatureC: temp.trim() ? Number(temp) : null,
          notes,
        }),
      });
      setNotice("Inspection note saved to MongoDB.");
      setTemp(""); setNotes("");
      setRefresh((n) => n + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save inspection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-7">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Pickup activity history (MongoDB)</h2>
          <button onClick={() => setRefresh((n) => n + 1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Refresh</button>
        </div>
        <p className="mt-2 text-sm text-slate-600">New pickup actions are logged as events. Older pickups appear as recovered SQL status snapshots, not invented historical events.</p>
        {loading ? <p className="mt-4">Loading…</p> : events.length === 0 ? <p className="mt-4 text-slate-500">No pickup activity for your organization yet.</p> : (
          <div className="mt-4 space-y-3">
            {events.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">Pickup #{item.pickup_id} · {item.status.replaceAll("_", " ")}</p>
                  <span className="text-xs text-slate-500">{item.source === "workflow" ? "Recorded event" : "Recovered status snapshot"}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">Allocation #{item.allocation_id}</p>
                <p className="mt-1 text-xs text-slate-500">{item.event_at ? `Event at: ${dateText(item.event_at)}` : `Status observed at: ${dateText(item.observed_at)} (original event time unknown)`}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {role === "DONOR" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Add a food inspection note</h2>
          <p className="mt-2 text-sm text-slate-600">These flexible documents record observations. They are not a food-safety certification.</p>
          <form onSubmit={submitInspection} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Your donation
              <select required value={donationId} onChange={(e) => setDonationId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3">
                {donations.length === 0 && <option value="">No donations available</option>}
                {donations.map((d) => <option value={d.donation_id} key={d.donation_id}>#{d.donation_id} · {d.food_name}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">Observed condition
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3">
                <option value="GOOD">Good</option><option value="NEEDS_REVIEW">Needs review</option><option value="REJECTED">Rejected</option>
              </select>
            </label>
            <label className="text-sm font-semibold">Packaging
              <select value={packaging} onChange={(e) => setPackaging(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3">
                <option value="SEALED">Sealed</option><option value="UNSEALED">Unsealed</option><option value="OTHER">Other</option>
              </select>
            </label>
            <label className="text-sm font-semibold">Temperature in °C (optional)
              <input type="number" min={-30} max={150} step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3" placeholder="e.g. 5.0" />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">Inspection observations
              <textarea rows={3} required minLength={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-3" placeholder="For example, packaging sealed, no visible spillage" />
            </label>
            <button type="submit" disabled={saving || !donationId} className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-2">{saving ? "Saving…" : "Save inspection to MongoDB"}</button>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Food inspection records</h2>
        <p className="mt-2 text-sm text-slate-600">{role === "DONOR" ? "Inspections on your donations" : "Inspections for food allocated to your NGO"}</p>
        {loading ? <p className="mt-4">Loading…</p> : inspections.length === 0 ? <p className="mt-4 text-slate-500">No inspection notes found.</p> : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {inspections.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-semibold">Donation #{item.donation_id} · {item.condition.replaceAll("_", " ")}</p>
                <p className="mt-1 text-sm text-slate-600">Packaging: {item.packaging} {item.temperature_c === null ? "" : `· ${item.temperature_c}°C`}</p>
                <p className="mt-2 text-sm whitespace-pre-wrap">{item.notes}</p>
                <p className="mt-2 text-xs text-slate-500">{dateText(item.checked_at)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
