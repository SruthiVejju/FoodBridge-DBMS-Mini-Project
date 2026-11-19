"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const inputClass = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const labelClass = "block text-sm font-semibold text-slate-700";

export default function NGORequestForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(""); setSuccess("");
    const data = new FormData(form);
    const deadline = new Date(String(data.get("neededBy")));
    if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      setError("Needed-by date must be in the future."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/requests", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({
          description: String(data.get("description") ?? ""),
          category: String(data.get("category") ?? ""),
          requestedQty: Number(data.get("requestedQty")),
          unit: String(data.get("unit") ?? "servings"),
          neededBy: deadline.toISOString(),
          deliveryAddress: String(data.get("deliveryAddress") ?? ""),
          priority: String(data.get("priority") ?? "MEDIUM"),
        }),
      });
      const result: { error?: string; requestId?: string } = await response.json();
      if (!response.ok) { setError(result.error ?? "Unable to submit request"); return; }
      form.reset();
      setSuccess(`NGO request #${result.requestId ?? ""} submitted successfully.`);
      router.refresh();
    } catch { setError("Request failed. Check your Next.js server and try again."); }
    finally { setBusy(false); }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className={labelClass}>Describe what food you need
        <textarea name="description" className={inputClass} rows={2} maxLength={2000}
          placeholder="e.g. Warm vegetarian meals for a community shelter" required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Category
          <select name="category" className={inputClass} defaultValue="Cooked food">
            <option>Cooked food</option><option>Fruits</option><option>Vegetables</option>
            <option>Bakery</option><option>Dry groceries</option><option>Dairy</option><option>Other</option>
          </select>
        </label>
        <label className={labelClass}>Priority
          <select name="priority" className={inputClass} defaultValue="MEDIUM">
            <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Quantity required
          <input type="number" name="requestedQty" className={inputClass} min="0.01" max="1000000" step="0.01" required />
        </label>
        <label className={labelClass}>Unit
          <select name="unit" className={inputClass} defaultValue="servings">
            <option value="servings">Servings</option><option value="kg">Kilograms (kg)</option>
          </select>
        </label>
      </div>
      <label className={labelClass}>Needed by
        <input type="datetime-local" name="neededBy" className={inputClass} required />
      </label>
      <label className={labelClass}>Delivery address
        <textarea name="deliveryAddress" className={inputClass} rows={2} maxLength={1000} required />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
      <button disabled={busy} type="submit" className="rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
        {busy ? "Submitting request…" : "Submit food request"}
      </button>
    </form>
  );
}
