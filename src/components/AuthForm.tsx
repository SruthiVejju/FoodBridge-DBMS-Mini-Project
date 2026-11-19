"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Mode = "register" | "login";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Something went wrong. Please try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Make sure the development server is running.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";
  const label = "block text-sm font-semibold text-slate-700 mb-1.5";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="text-sm font-semibold text-emerald-700 hover:underline">← FoodBridge home</Link>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">FoodBridge · Food Waste Redistribution</p>
          <h1 className="mt-2 text-3xl font-bold">{registering ? "Create an account" : "Welcome back"}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {registering ? "Register your donor organization or NGO to get started." : "Log in to your donor or NGO dashboard."}
          </p>

          <form className="mt-7 space-y-4" onSubmit={submit}>
            {registering && (
              <>
                <div>
                  <label className={label} htmlFor="orgType">Organization type</label>
                  <select id="orgType" name="orgType" className={field} defaultValue="DONOR" required>
                    <option value="DONOR">Food donor</option>
                    <option value="NGO">NGO / food recipient</option>
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="orgName">Organization name</label>
                  <input id="orgName" name="orgName" className={field} placeholder="e.g., Green Plate Kitchen" maxLength={150} required />
                </div>
                <div>
                  <label className={label} htmlFor="address">Organization address</label>
                  <textarea id="address" name="address" className={field} rows={2} placeholder="Full pickup / organization address" maxLength={1000} required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="contactPerson">Contact person</label>
                    <input id="contactPerson" name="contactPerson" className={field} maxLength={120} required />
                  </div>
                  <div>
                    <label className={label} htmlFor="contactPhone">Contact phone</label>
                    <input id="contactPhone" name="contactPhone" type="tel" className={field} maxLength={20} required />
                  </div>
                </div>
                <div>
                  <label className={label} htmlFor="fullName">Your full name</label>
                  <input id="fullName" name="fullName" autoComplete="name" className={field} maxLength={120} required />
                </div>
              </>
            )}
            <div>
              <label className={label} htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" className={field} placeholder="name@example.com" maxLength={255} required />
            </div>
            <div>
              <label className={label} htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} className={field} minLength={registering ? 8 : 1} required />
              {registering && <p className="mt-1 text-xs text-slate-500">Minimum 8 characters. Use a unique password.</p>}
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "Please wait…" : registering ? "Register and continue" : "Log in"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            {registering ? "Already registered? " : "New to FoodBridge? "}
            <Link href={registering ? "/login" : "/register"} className="font-semibold text-emerald-700 hover:underline">
              {registering ? "Log in" : "Create an account"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
