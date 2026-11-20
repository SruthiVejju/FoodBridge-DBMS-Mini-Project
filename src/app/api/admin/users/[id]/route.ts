import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rejectCrossOriginPost } from "@/lib/api-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  // Verify origin on destructive operations, just as on existing POST routes.
  const csrfError = rejectCrossOriginPost(request);
  if (csrfError) return csrfError;

  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Log in required" }, { status: 401 });
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }
  if (id === admin.userId) {
    return NextResponse.json({ error: "You cannot remove your own account" }, { status: 403 });
  }

  try {
    // Only delete the login account, not the organization, donations, requests,
    // allocations, pickups or MongoDB records. ADMIN users are excluded.
    const result = await db.query<{ user_id: string }>(
      `DELETE FROM users u
        USING organizations o
        WHERE u.user_id = $1::BIGINT
          AND u.org_id = o.org_id
          AND o.org_type IN ('DONOR', 'NGO')
        RETURNING u.user_id`,
      [id]
    );
    if (!result.rowCount) {
      return NextResponse.json({ error: "User not found or protected" }, { status: 404 });
    }
    // getCurrentUser() reads users from the DB on each authenticated request,
    // so existing JWT cookies for this user will no longer authenticate.
    return NextResponse.json({ ok: true, removedUserId: result.rows[0].user_id });
  } catch (error) {
    console.error("Admin user removal failed", error);
    return NextResponse.json({ error: "Unable to remove user" }, { status: 500 });
  }
}
