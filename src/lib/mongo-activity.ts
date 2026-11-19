import { db } from "@/lib/db";
import { ensureMongoIndexes, getMongoDb } from "@/lib/mongodb";
import type { CurrentUser } from "@/lib/auth";

export type PickupStatus = "SCHEDULED" | "PICKED_UP" | "DELIVERED" | "CANCELLED";

export type PickupEventInput = {
  pickupId: string;
  allocationId: string;
  donorOrgId: string;
  ngoOrgId: string;
  status: PickupStatus;
  actorUserId?: string;
};

// The same pickup/status pair is idempotent, including retries and recovery.
// Cross-database writes are not atomically committed together; PostgreSQL remains
// the source of truth and the activity endpoint can recover a status snapshot.
export async function recordPickupEvent(input: PickupEventInput): Promise<void> {
  await ensureMongoIndexes();
  const mongo = await getMongoDb();
  const time = new Date();
  await mongo.collection("pickup_activity").updateOne(
    { event_key: `pickup:${input.pickupId}:${input.status}` },
    { $setOnInsert: {
      event_key: `pickup:${input.pickupId}:${input.status}`,
      pickup_id: input.pickupId,
      allocation_id: input.allocationId,
      donor_org_id: input.donorOrgId,
      ngo_org_id: input.ngoOrgId,
      status: input.status,
      actor_user_id: input.actorUserId ?? null,
      source: "workflow",
      event_at: time,
      observed_at: time,
    } },
    { upsert: true },
  );
}

// For pickups created before the MongoDB module, or updates that occurred while
// MongoDB was unavailable, recover the PRESENT SQL state only. We do not fabricate
// the true time or actor of a historical event we did not observe.
export async function recoverPickupSnapshots(user: CurrentUser): Promise<void> {
  const ownerColumn = user.role === "DONOR" ? "d.donor_org_id" : "r.ngo_org_id";
  const rows = await db.query<{
    pickup_id: string; allocation_id: string; donor_org_id: string;
    ngo_org_id: string; delivery_status: PickupStatus;
  }>(
    `SELECT p.pickup_id, p.allocation_id, p.delivery_status,
            d.donor_org_id, r.ngo_org_id
       FROM pickups p
       JOIN allocations a ON a.allocation_id = p.allocation_id
       JOIN donations d ON d.donation_id = a.donation_id
       JOIN ngo_requests r ON r.request_id = a.request_id
      WHERE ${ownerColumn} = $1
      ORDER BY p.pickup_id DESC LIMIT 200`,
    [user.orgId],
  );
  if (rows.rows.length === 0) return;
  await ensureMongoIndexes();
  const mongo = await getMongoDb();
  const observed = new Date();
  await mongo.collection("pickup_activity").bulkWrite(
    rows.rows.map((row) => ({
      updateOne: {
        filter: { event_key: `pickup:${row.pickup_id}:${row.delivery_status}` },
        update: { $setOnInsert: {
          event_key: `pickup:${row.pickup_id}:${row.delivery_status}`,
          pickup_id: row.pickup_id,
          allocation_id: row.allocation_id,
          donor_org_id: row.donor_org_id,
          ngo_org_id: row.ngo_org_id,
          status: row.delivery_status,
          actor_user_id: null,
          source: "recovered_snapshot",
          event_at: null,
          observed_at: observed,
        } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}
