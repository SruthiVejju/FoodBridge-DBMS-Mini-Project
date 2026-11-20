import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rejectCrossOriginPost } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const csrf = rejectCrossOriginPost(request);
  if (csrf) return csrf;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in required" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { orgId, status } = body as { orgId?: unknown; status?: unknown };
  if (typeof orgId !== "string" || !/^[1-9]\d*$/.test(orgId) ||
      (status !== "VERIFIED" && status !== "REJECTED")) {
    return NextResponse.json({ error: "Invalid organization or status" }, { status: 400 });
  }
  try {
    const result = await db.query(
      `UPDATE organizations SET verification_status = $1
       WHERE org_id = $2::BIGINT AND org_type IN ('DONOR', 'NGO')
       RETURNING org_id`, [status, orgId]
    );
    if (!result.rowCount) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Admin verification update failed", err);
    return NextResponse.json({ error: "Unable to update organization" }, { status: 500 });
  }
}
