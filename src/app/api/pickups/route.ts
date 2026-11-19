import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rejectCrossOriginPost } from "@/lib/api-helpers";
import { recordPickupEvent } from "@/lib/mongo-activity";
import { databaseRuleError, scheduleSchema } from "@/lib/workflow-validation";

export async function POST(request: Request) {
  const csrf = rejectCrossOriginPost(request);
  if (csrf) return csrf;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role !== "DONOR") {
      return NextResponse.json({ error: "Only the food donor can schedule pickup" }, { status: 403 });
    }
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
    const parsed = scheduleSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid pickup schedule" }, { status: 400 });
    const { allocationId, scheduledAt } = parsed.data;
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Choose a future pickup time" }, { status: 400 });
    }
    const result = await db.query<{ pickup_id: string; allocation_id: string }>(
      `INSERT INTO pickups (allocation_id, scheduled_at)
       SELECT a.allocation_id, $2::TIMESTAMPTZ
         FROM allocations a
         JOIN donations d ON d.donation_id = a.donation_id
         JOIN ngo_requests r ON r.request_id = a.request_id
        WHERE a.allocation_id = $1::BIGINT
          AND d.donor_org_id = $3::BIGINT
          AND a.status = 'RESERVED'
          AND $2::TIMESTAMPTZ > NOW()
          AND $2::TIMESTAMPTZ < d.expires_at
          AND $2::TIMESTAMPTZ <= r.needed_by
       RETURNING pickup_id, allocation_id`,
      [allocationId, scheduledAt, user.orgId],
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Cannot schedule this pickup: check allocation, ownership, expiry and needed-by time" }, { status: 409 });
    }
    const pickup = result.rows[0];
    // After successful SQL write, log an event in MongoDB. Database systems
    // have independent commits; do not misreport a successful pickup as failed
    // if the secondary audit database is unavailable.
    let mongoLogged = false;
    try {
      const organizations = await db.query<{ donor_org_id: string; ngo_org_id: string }>(
        `SELECT d.donor_org_id, r.ngo_org_id
           FROM allocations a
           JOIN donations d ON d.donation_id = a.donation_id
           JOIN ngo_requests r ON r.request_id = a.request_id
          WHERE a.allocation_id = $1`, [pickup.allocation_id]
      );
      const org = organizations.rows[0];
      if (org) {
        await recordPickupEvent({
          pickupId: pickup.pickup_id, allocationId: pickup.allocation_id,
          donorOrgId: org.donor_org_id, ngoOrgId: org.ngo_org_id,
          status: "SCHEDULED", actorUserId: user.userId,
        });
        mongoLogged = true;
      }
    } catch (mongoError) {
      console.error("Pickup saved to PostgreSQL but MongoDB event logging failed:", mongoError);
    }
    return NextResponse.json({
      ok: true, pickupId: pickup.pickup_id, mongoEventLogged: mongoLogged,
      ...(!mongoLogged ? { warning: "Pickup saved. Activity record will be recovered when MongoDB is available." } : {}),
    }, { status: 201 });
  } catch (error) {
    const expected = databaseRuleError(error);
    if (expected) return NextResponse.json({ error: expected }, { status: 409 });
    console.error("Pickup scheduling failed", error);
    return NextResponse.json({ error: "Unable to schedule pickup" }, { status: 500 });
  }
}
