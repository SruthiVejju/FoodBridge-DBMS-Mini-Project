import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import AdminPanel from "@/components/AdminPanel";

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

async function AdminContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [organizationsResult, usersResult] = await Promise.all([
    db.query<Org>(
      `SELECT org_id, org_name, org_type, verification_status
       FROM organizations WHERE org_type IN ('DONOR', 'NGO')
       ORDER BY org_id DESC LIMIT 100`
    ),
    db.query<ManagedUser>(
      `SELECT u.user_id, u.full_name, u.email, o.org_name, o.org_type
       FROM users u JOIN organizations o ON u.org_id = o.org_id
       WHERE o.org_type IN ('DONOR', 'NGO')
       ORDER BY u.user_id DESC LIMIT 200`
    ),
  ]);

  return <AdminPanel fullName={user.fullName}
                     organizations={organizationsResult.rows}
                     users={usersResult.rows} />;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<main className="p-10">Loading administration…</main>}>
      <AdminContent />
    </Suspense>
  );
}
