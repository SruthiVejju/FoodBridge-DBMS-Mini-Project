import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rejectCrossOriginPost } from "@/lib/api-helpers";
import { recordPickupEvent, type PickupStatus } from "@/lib/mongo-activity";
import { databaseRuleError, pickupActionSchema } from "@/lib/workflow-validation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const csrf = rejectCrossOriginPost(request);
  if (csrf) return csrf;
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return NextResponse.json({ error: "Invalid pickup ID" }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = pickupActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid pickup action" }, { status: 400 });

  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    const client = await db.connect();
    let loggedEvent: {
      pickupId: string; allocationId: string; donorOrgId: string; ngoOrgId: string;
      status: PickupStatus; actorUserId: string;
    } | null = null;
    try {
      await client.query("BEGIN");
      const found = await client.query<{
        pickup_id: string; allocation_id: string; delivery_status: string;
        scheduled_at: Date; donor_org_id: string; ngo_org_id: string; allocation_status: string;
      }>(
        `SELECT p.pickup_id, p.allocation_id, p.delivery_status, p.scheduled_at,
                d.donor_org_id, r.ngo_org_id, a.status AS allocation_status
           FROM pickups p
           JOIN allocations a ON a.allocation_id = p.allocation_id
           JOIN donations d ON d.donation_id = a.donation_id
           JOIN ngo_requests r ON r.request_id = a.request_id
          WHERE p.pickup_id = $1
          FOR UPDATE OF p, a`, [id]
      );
      const pickup = found.rows[0];
      if (!pickup) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Pickup not found" }, { status: 404 });
      }
      if (parsed.data.action === "PICKED_UP") {
        if (user.role !== "DONOR" || pickup.donor_org_id !== user.orgId) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Only the owning donor can mark food as picked up" }, { status: 403 });
        }
        if (pickup.delivery_status !== "SCHEDULED" || pickup.allocation_status !== "RESERVED") {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Pickup is not awaiting collection" }, { status: 409 });
        }
        if (new Date(pickup.scheduled_at).getTime() > Date.now()) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "The scheduled pickup time has not arrived yet" }, { status: 409 });
        }
        await client.query("UPDATE pickups SET delivery_status = 'PICKED_UP' WHERE pickup_id = $1", [id]);
        await client.query("UPDATE allocations SET status = 'COLLECTED' WHERE allocation_id = $1", [pickup.allocation_id]);
      } else {
        if (user.role !== "NGO" || pickup.ngo_org_id !== user.orgId) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Only the receiving NGO can confirm delivery" }, { status: 403 });
        }
        if (pickup.delivery_status !== "PICKED_UP" || pickup.allocation_status !== "COLLECTED") {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Food must be picked up before delivery is confirmed" }, { status: 409 });
        }
        await client.query("UPDATE pickups SET delivery_status = 'DELIVERED', completed_at = NOW() WHERE pickup_id = $1", [id]);
      }
      await client.query("COMMIT");
      loggedEvent = {
        pickupId: pickup.pickup_id,
        allocationId: pickup.allocation_id,
        donorOrgId: pickup.donor_org_id,
        ngoOrgId: pickup.ngo_org_id,
        status: parsed.data.action,
        actorUserId: user.userId,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    let mongoLogged = false;
    try {
      if (loggedEvent) {
        await recordPickupEvent(loggedEvent);
        mongoLogged = true;
      }
    } catch (mongoError) {
      console.error("Pickup status committed in PostgreSQL but MongoDB event logging failed:", mongoError);
    }
    return NextResponse.json({
      ok: true, status: parsed.data.action, mongoEventLogged: mongoLogged,
      ...(!mongoLogged ? { warning: "Pickup updated; activity snapshot will recover when MongoDB is online." } : {}),
    });
  } catch (error) {
    const expected = databaseRuleError(error);
    if (expected) return NextResponse.json({ error: expected }, { status: 409 });
    console.error("Pickup status update failed", error);
    return NextResponse.json({ error: "Unable to update pickup" }, { status: 500 });
  }
}
