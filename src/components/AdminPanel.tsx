"use client";

import { useState } from "react";
import LogoutButton from "@/components/LogoutButton";

type Org = {
  org_id: string;
  org_name: string;
  org_type: string;
  verification_status: "PENDING" | "VERIFIED" | "REJECTED";
};

type ManagedUser = {
  user_id: string;
  full_name: string;
  email: string;
  org_name: string;
  org_type: "DONOR" | "NGO";
};

export default function AdminPanel({
  fullName,
  organizations,
  users,
}: {
  fullName: string;
  organizations: Org[];
  users: ManagedUser[];
}) {
  const [rows, setRows] = useState(organizations);
  const [accounts, setAccounts] = useState(users);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function updateStatus(orgId: string, status: "VERIFIED" | "REJECTED") {
    setBusyId(`org:${orgId}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Update failed");
      setRows((previous) => previous.map((org) =>
        org.org_id === orgId ? { ...org, verification_status: status } : org
      ));
      setMessage("Organization verification updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(account: ManagedUser) {
    // Explicit confirmation before a permanent deletion.
    const confirmation = window.prompt(
      `Delete the login account for ${account.full_name} (${account.email})?\n` +
      `The organization and its donations, requests and history remain.\n` +
      `Type the account email to confirm:`
    );
    if (confirmation !== account.email) return;

    setBusyId(`user:${account.user_id}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${account.user_id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to remove user");
      setAccounts((previous) => previous.filter((item) => item.user_id !== account.user_id));
      setMessage(`Removed user account ${account.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove user");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-emerald-800">FoodBridge Admin Dashboard</h1>
            <p className="text-sm text-slate-600">Welcome, {fullName} · Verify organizations and manage accounts</p>
          </div>
          <LogoutButton />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-900">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-emerald-100 p-3 text-emerald-900">{message}</p>}

        <section className="space-y-2">
          <h2 className="text-xl font-bold">Organization verification</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-100 text-slate-700"><tr>
                <th className="p-3">Organization</th><th className="p-3">Type</th>
                <th className="p-3">Verification</th><th className="p-3">Action</th>
              </tr></thead>
              <tbody>{rows.map((org) => (
                <tr key={org.org_id} className="border-b last:border-0">
                  <td className="p-3 font-semibold">{org.org_name}</td>
                  <td className="p-3">{org.org_type}</td>
                  <td className="p-3">{org.verification_status}</td>
                  <td className="flex gap-2 p-3">
                    <button disabled={busyId !== null} onClick={() => updateStatus(org.org_id, "VERIFIED")}
                      className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-50">Verify</button>
                    <button disabled={busyId !== null} onClick={() => updateStatus(org.org_id, "REJECTED")}
                      className="rounded bg-rose-700 px-3 py-2 text-white disabled:opacity-50">Reject</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length === 0 && <p className="p-5">No donor or NGO organizations yet.</p>}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">Manage users</h2>
          <p className="text-sm text-slate-600">Remove donor/NGO login accounts. Organizations and historical food records are preserved. Administrator accounts are protected.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-100 text-slate-700"><tr>
                <th className="p-3">User</th><th className="p-3">Email</th>
                <th className="p-3">Organization</th><th className="p-3">Role</th><th className="p-3">Action</th>
              </tr></thead>
              <tbody>{accounts.map((account) => (
                <tr key={account.user_id} className="border-b last:border-0">
                  <td className="p-3 font-semibold">{account.full_name}</td>
                  <td className="p-3">{account.email}</td>
                  <td className="p-3">{account.org_name}</td>
                  <td className="p-3">{account.org_type}</td>
                  <td className="p-3">
                    <button disabled={busyId !== null} onClick={() => removeUser(account)}
                      className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-50">
                      {busyId === `user:${account.user_id}` ? "Removing..." : "Remove user"}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
            {accounts.length === 0 && <p className="p-5">No donor or NGO user accounts found.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
