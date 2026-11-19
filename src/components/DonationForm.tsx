"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const inputClass = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const labelClass = "block text-sm font-semibold text-slate-700";

function toIso(value: FormDataEntryValue | null): string | null {
  if (!value || !String(value).trim()) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export default function DonationForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setSuccess("");
    const data = new FormData(form);
    const expiresAt = toIso(data.get("expiresAt"));
    const preparedAt = toIso(data.get("preparedAt"));
    if (!expiresAt) { setError("Enter a valid expiry date and time."); return; }
    if (Date.parse(expiresAt) <= Date.now()) { setError("Expiry must be in the future."); return; }
    if (data.get("preparedAt") && !preparedAt) { setError("Enter a valid preparation time."); return; }

    setBusy(true);
    try {
      const response = await fetch("/api/donations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          foodName: String(data.get("foodName") ?? ""),
          description: String(data.get("description") ?? ""),
          category: String(data.get("category") ?? ""),
          totalQty: Number(data.get("totalQty")),
          unit: String(data.get("unit") ?? "kg"),
          preparedAt,
          expiresAt,
          pickupAddress: String(data.get("pickupAddress") ?? ""),
        }),
      });
      const result: { error?: string; donationId?: string } = await response.json();
      if (!response.ok) { setError(result.error ?? "Unable to create donation"); return; }
      form.reset();
      setSuccess(`Donation #${result.donationId ?? ""} created successfully.`);
      router.refresh();
    } catch {
      setError("Request failed. Check your Next.js server and try again.");
    } finally { setBusy(false); }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Food name
          <input className={inputClass} name="foodName" maxLength={150} placeholder="e.g. Vegetable biryani" required />
        </label>
        <label className={labelClass}>Category
          <select className={inputClass} name="category" required defaultValue="Cooked food">
            <option>Cooked food</option><option>Fruits</option><option>Vegetables</option>
            <option>Bakery</option><option>Dry groceries</option><option>Dairy</option><option>Other</option>
          </select>
        </label>
      </div>
      <label className={labelClass}>Food description
        <textarea className={inputClass} name="description" rows={2} maxLength={2000}
          placeholder="What kind of food is it? Include ingredients or packaging details." required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Total quantity
          <input className={inputClass} name="totalQty" type="number" min="0.01" step="0.01" max="1000000" placeholder="20" required />
        </label>
        <label className={labelClass}>Unit
          <select className={inputClass} name="unit" defaultValue="servings">
            <option value="servings">Servings</option><option value="kg">Kilograms (kg)</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Prepared at (optional)
          <input className={inputClass} name="preparedAt" type="datetime-local" />
        </label>
        <label className={labelClass}>Expires at
          <input className={inputClass} name="expiresAt" type="datetime-local" required />
        </label>
      </div>
      <label className={labelClass}>Pickup address
        <textarea className={inputClass} name="pickupAddress" rows={2} maxLength={1000}
          placeholder="Where should the NGO collect this food?" required />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
      <button type="submit" disabled={busy} className="rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
        {busy ? "Creating donation…" : "Publish donation"}
      </button>
      <p className="text-xs text-slate-500">Only list food that is safe to redistribute. Expired donations cannot be allocated.</p>
    </form>
  );
}
