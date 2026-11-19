"use client";

import { useCallback, useEffect, useState } from "react";

type Declaration = { condition: string; packaging: string; notes: string; checkedAt: string | null };
type Confirmation = { finding: string; notes: string; recordedAt: string | null };
type Item = {
  allocation_id: string;
  pickup_id: string | null;
  pickup_status: string | null;
  donation_id: string;
  food_name: string;
  donor_name: string;
  donorDeclaration: Declaration | null;
  ngoConfirmation: Confirmation | null;
};

type ResponseData = { allocations?: Item[]; error?: string };

function time(value: string | null) {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
}

export default function NGOConditionConfirmation() {
  const [records, setRecords] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [finding, setFinding] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/ngo-condition-confirmations", { cache: "no-store" });
      const data = (await response.json()) as ResponseData;
      if (!response.ok) throw new Error(data.error ?? "Unable to load confirmations");
      setRecords(data.allocations ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load confirmations");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(allocationId: string) {
    setSaving(allocationId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ngo-condition-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocationId,
          finding: finding[allocationId] ?? "AS_DECLARED",
          notes: notes[allocationId] ?? "",
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to save confirmation");
      setNotice(data.message ?? "NGO observation saved");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save confirmation");
    } finally { setSaving(null); }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">NGO food-condition confirmation</h2>
        <button type="button" onClick={() => void refresh()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Refresh</button>
      </div>
      <p className="mt-2 text-sm text-slate-600">Compare the donor's self-reported condition with what you actually observe after collection. These are observations, not food-safety certificates. This form does not automatically confirm delivery.</p>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {loading ? <p className="mt-5 text-slate-500">Loading allocations…</p> : records.length === 0 ? <p className="mt-5 text-slate-500">No allocations for your NGO yet.</p> : (
        <div className="mt-5 space-y-5">
          {records.map((item) => {
            const canConfirm = item.pickup_status === "PICKED_UP" || item.pickup_status === "DELIVERED";
            return (
              <article key={item.allocation_id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">Allocation #{item.allocation_id} · {item.food_name}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{item.pickup_status?.replaceAll("_", " ") ?? "PICKUP NOT SCHEDULED"}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">Donor: {item.donor_name} · Donation #{item.donation_id}</p>
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-semibold">Donor's latest declaration</p>
                  {item.donorDeclaration ? <>
                    <p className="mt-1">Condition: {item.donorDeclaration.condition} · Packaging: {item.donorDeclaration.packaging}</p>
                    <p className="mt-1 whitespace-pre-wrap">{item.donorDeclaration.notes}</p>
                    <p className="mt-1 text-xs text-slate-500">Declared: {time(item.donorDeclaration.checkedAt)}</p>
                  </> : <p className="mt-1 text-slate-500">No donor condition declaration available.</p>}
                </div>
                {item.ngoConfirmation ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                    <p className="font-semibold">NGO observation recorded: {item.ngoConfirmation.finding.replaceAll("_", " ")}</p>
                    <p className="mt-1 whitespace-pre-wrap">{item.ngoConfirmation.notes}</p>
                    <p className="mt-1 text-xs text-slate-500">Recorded: {time(item.ngoConfirmation.recordedAt)}</p>
                  </div>
                ) : !canConfirm ? (
                  <p className="mt-3 text-sm text-amber-800">Confirmation becomes available after the donor marks the food as picked up. Do not mark pickup early just to test this form.</p>
                ) : (
                  <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(item.allocation_id); }}>
                    <label className="block text-sm font-semibold">Your observation compared with the donor declaration
                      <select className="mt-1 w-full rounded-lg border border-slate-300 p-3" value={finding[item.allocation_id] ?? "AS_DECLARED"} onChange={(e) => setFinding((old) => ({ ...old, [item.allocation_id]: e.target.value }))}>
                        <option value="AS_DECLARED">Matches donor declaration</option>
                        <option value="DIFFERENT">Condition is different</option>
                        <option value="UNSAFE">Food condition is not acceptable</option>
                      </select>
                    </label>
                    <label className="block text-sm font-semibold">What you observed
                      <textarea required minLength={5} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 p-3" value={notes[item.allocation_id] ?? ""} onChange={(e) => setNotes((old) => ({ ...old, [item.allocation_id]: e.target.value }))} placeholder="Describe the packaging, visible damage and anything different from the declaration" />
                    </label>
                    <button type="submit" disabled={saving !== null} className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving === item.allocation_id ? "Saving…" : "Record NGO condition observation"}</button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
