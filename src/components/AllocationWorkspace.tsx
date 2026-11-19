"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "DONOR" | "NGO";
type RequestRow = {
  request_id: string;
  description: string;
  category: string;
  remaining_qty: string;
  unit: string;
  status: string;
  needed_by: string;
};
type MatchRow = {
  donation_id: string;
  food_name: string;
  description: string;
  category: string;
  available_qty: string;
  max_reservable: string;
  unit: string;
  expires_at: string;
  donor_name: string;
  pickup_address: string;
  similarity_percent?: string | null;
};
type AllocationRow = {
  allocation_id: string;
  donation_id: string;
  request_id: string;
  allocated_qty: string;
  allocation_status: "RESERVED" | "COLLECTED" | "CANCELLED";
  allocated_at: string;
  food_name: string;
  category: string;
  unit: string;
  donor_name: string;
  ngo_name: string;
  pickup_address: string;
  expires_at: string;
  needed_by: string;
  pickup_id: string | null;
  scheduled_at: string | null;
  delivery_status: "SCHEDULED" | "PICKED_UP" | "DELIVERED" | "CANCELLED" | null;
  completed_at: string | null;
};

function showDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to retrieve data");
  return data as T;
}

async function sendJSON(path: string, method: "POST" | "PATCH", body: unknown): Promise<void> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
}

export default function AllocationWorkspace({ role }: { role: Role }) {
  const router = useRouter();
  const isNGO = role === "NGO";
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [requestId, setRequestId] = useState("");
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchingMethod, setMatchingMethod] = useState("category_and_unit");
  const [selectedDonation, setSelectedDonation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pickupTimes, setPickupTimes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const selectedRequest = requests.find((item) => item.request_id === requestId);
  const chosenDonation = matches.find((item) => item.donation_id === selectedDonation);
  const maxQty = chosenDonation ? Number(chosenDonation.max_reservable) : 0;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [allocationResponse, requestResponse] = await Promise.all([
          getJSON<{ allocations: AllocationRow[] }>("/api/allocations"),
          isNGO ? getJSON<{ requests: RequestRow[] }>("/api/requests") : Promise.resolve({ requests: [] }),
        ]);
        if (cancelled) return;
        setAllocations(allocationResponse.allocations);
        const available = requestResponse.requests.filter((r) =>
          r.status === "OPEN" && Number(r.remaining_qty) > 0 && new Date(r.needed_by).getTime() > Date.now()
        );
        setRequests(available);
        setRequestId((previous) => available.some((r) => r.request_id === previous) ? previous : (available[0]?.request_id ?? ""));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load workflow");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [isNGO, reload]);

  useEffect(() => {
    if (!isNGO || !requestId) {
      setMatches([]);
      setSelectedDonation("");
      setMatchingMethod("category_and_unit");
      return;
    }
    let cancelled = false;
    setLoadingMatches(true);
    void getJSON<{ matches: MatchRow[]; matchingMethod: string }>(`/api/allocations/matches?requestId=${encodeURIComponent(requestId)}`)
      .then((data) => {
        if (cancelled) return;
        setMatches(data.matches);
        setMatchingMethod(data.matchingMethod);
        setSelectedDonation((current) => data.matches.some((m) => m.donation_id === current) ? current : (data.matches[0]?.donation_id ?? ""));
      })
      .catch((cause) => {
        if (!cancelled) {
          setMatches([]);
          setSelectedDonation("");
          setError(cause instanceof Error ? cause.message : "Unable to find matches");
        }
      })
      .finally(() => { if (!cancelled) setLoadingMatches(false); });
    return () => { cancelled = true; };
  }, [requestId, isNGO, reload]);

  useEffect(() => {
    if (chosenDonation) setQuantity(String(Number(chosenDonation.max_reservable)));
    else setQuantity("");
  }, [selectedDonation, matches]);

  const success = useCallback((message: string) => {
    setNotice(message);
    setError("");
    setReload((n) => n + 1);
    router.refresh();
  }, [router]);

  async function reserve() {
    if (!requestId || !selectedDonation) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0 || qty > maxQty) {
        throw new Error(`Choose a quantity between 0 and ${maxQty}`);
      }
      await sendJSON("/api/allocations", "POST", {
        requestId, donationId: selectedDonation, quantity: qty,
      });
      success(`${qty} ${selectedRequest?.unit ?? "units"} reserved successfully. The donor can now schedule pickup.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reserve food");
    } finally { setBusy(false); }
  }

  async function schedule(allocationId: string) {
    const value = pickupTimes[allocationId];
    if (!value) { setError("Choose a pickup date and time first"); return; }
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) { setError("Enter a valid pickup date"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await sendJSON("/api/pickups", "POST", {
        allocationId, scheduledAt: when.toISOString(),
      });
      success("Pickup scheduled. The donor can mark it picked up at the scheduled time.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to schedule pickup");
    } finally { setBusy(false); }
  }

  async function updatePickup(pickupId: string, action: "PICKED_UP" | "DELIVERED") {
    setBusy(true); setError(""); setNotice("");
    try {
      await sendJSON(`/api/pickups/${encodeURIComponent(pickupId)}`, "PATCH", { action });
      success(action === "PICKED_UP" ? "Collection recorded. The NGO can now confirm delivery." : "Delivery confirmed successfully.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update pickup");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-7">
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">{error}</div>}
      {isNGO && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">1. Find food for your NGO request</h2>
          <p className="mt-2 text-sm text-slate-600">Eligible donations must match category and unit. Indexed matches are ranked by pgvector cosine similarity; unindexed records use a clearly labeled fallback.</p>
          {loading ? <p className="mt-5">Loading requests…</p> : requests.length === 0 ? (
            <p className="mt-5 text-slate-600">No open NGO requests with remaining quantity. <a href="/requests" className="font-semibold text-emerald-700 underline">Create a request</a> first.</p>
          ) : (
            <>
              <label className="mt-5 block text-sm font-semibold" htmlFor="request-selection">Select your NGO request</label>
              <select id="request-selection" className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3" value={requestId} onChange={(e) => { setRequestId(e.target.value); setError(""); }}>
                {requests.map((r) => <option key={r.request_id} value={r.request_id}>#{r.request_id} — {r.category}, {Number(r.remaining_qty)} {r.unit} remaining</option>)}
              </select>
              <h3 className="mt-6 text-base font-bold">Eligible donations</h3>
              <p className="mt-1 text-xs text-emerald-800">
                {matchingMethod === "pgvector_cosine" ? "Ranked using MiniLM text embeddings + PostgreSQL pgvector cosine similarity" : "Category/unit fallback — run the embedding backfill script to enable semantic rankings"}
              </p>
              {loadingMatches ? <p className="mt-3 text-slate-600">Finding available food…</p> : matches.length === 0 ? (
                <p className="mt-3 text-slate-600">No matching available donations for this category and unit. Check the donation list or create a compatible donation using a donor account.</p>
              ) : (
                <>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {matches.map((m) => (
                      <label key={m.donation_id} className={`cursor-pointer rounded-xl border p-4 ${m.donation_id === selectedDonation ? "border-emerald-600 bg-emerald-50" : "border-slate-200"}`}>
                        <span className="flex items-start gap-3">
                          <input type="radio" name="matched-donation" checked={m.donation_id === selectedDonation} onChange={() => setSelectedDonation(m.donation_id)} className="mt-1 accent-emerald-700" />
                          <span>
                            <strong>{m.food_name}</strong> <span className="text-xs text-slate-500">#{m.donation_id}</span>
                            <span className="mt-1 block text-sm">{m.donor_name}</span>
                            {m.similarity_percent != null && <span className="mt-1 block text-xs font-semibold text-emerald-700">Text similarity: {Number(m.similarity_percent).toFixed(1)}% (ranking score, not a probability)</span>}
                            <span className="mt-1 block text-sm text-emerald-800">Available: {Number(m.available_qty)} {m.unit}</span>
                            <span className="mt-1 block text-xs text-slate-500">Expires: {showDate(m.expires_at)}</span>
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap items-end gap-3">
                    <label className="block text-sm font-semibold">Quantity to reserve
                      <input type="number" min="0.01" max={maxQty} step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-2 block w-44 rounded-xl border border-slate-300 p-3" />
                    </label>
                    <span className="pb-3 text-sm text-slate-600">{selectedRequest?.unit} · max {maxQty}</span>
                    <button type="button" disabled={busy || !chosenDonation} onClick={() => void reserve()} className="rounded-xl bg-emerald-700 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{busy ? "Working…" : "Reserve food"}</button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">{isNGO ? "2. Your allocations and deliveries" : "Allocations and pickup management"}</h2>
        <p className="mt-2 text-sm text-slate-600">{isNGO ? "Once a donor schedules collection, you can follow its progress and confirm delivery." : "Reservations made by NGOs appear here. Schedule pickup before the food expires and before the NGO needs it."}</p>
        {loading ? <p className="mt-5">Loading allocations…</p> : allocations.length === 0 ? (
          <p className="mt-5 text-slate-600">No allocations yet.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {allocations.map((a) => (
              <article key={a.allocation_id} className="rounded-xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Allocation #{a.allocation_id} · {a.food_name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{a.donor_name} → {a.ngo_name}</p>
                    <p className="mt-1 text-sm">{Number(a.allocated_qty)} {a.unit} · Request #{a.request_id}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{a.allocation_status} {a.delivery_status ? `· ${a.delivery_status}` : "· Pickup not scheduled"}</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">Pickup address: {a.pickup_address}</p>
                <p className="mt-1 text-xs text-slate-500">Donation expires: {showDate(a.expires_at)} · NGO needs it: {showDate(a.needed_by)}</p>
                {a.pickup_id && <p className="mt-2 text-sm">Pickup scheduled: <strong>{showDate(a.scheduled_at)}</strong>{a.completed_at ? ` · Delivered: ${showDate(a.completed_at)}` : ""}</p>}

                {!isNGO && a.allocation_status === "RESERVED" && !a.pickup_id && (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <label className="block text-sm font-semibold">Pickup date and time
                      <input type="datetime-local" value={pickupTimes[a.allocation_id] ?? ""} onChange={(e) => setPickupTimes((old) => ({ ...old, [a.allocation_id]: e.target.value }))} className="mt-2 block rounded-xl border border-slate-300 p-3" />
                    </label>
                    <button type="button" disabled={busy} onClick={() => void schedule(a.allocation_id)} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Schedule pickup</button>
                  </div>
                )}
                {!isNGO && a.pickup_id && a.delivery_status === "SCHEDULED" && a.allocation_status === "RESERVED" && (
                  <button type="button" disabled={busy} onClick={() => void updatePickup(a.pickup_id!, "PICKED_UP")} className="mt-4 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Mark picked up</button>
                )}
                {isNGO && a.pickup_id && a.delivery_status === "PICKED_UP" && a.allocation_status === "COLLECTED" && (
                  <button type="button" disabled={busy} onClick={() => void updatePickup(a.pickup_id!, "DELIVERED")} className="mt-4 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Confirm delivered</button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
