import { NextResponse, connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureMongoIndexes, getMongoDb } from "@/lib/mongodb";
import { recoverPickupSnapshots } from "@/lib/mongo-activity";

export async function GET() {
  // Request-specific authentication must not run during static prerendering.
  await connection();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    await recoverPickupSnapshots(user);
    await ensureMongoIndexes();
    const mongo = await getMongoDb();
    const ownerField = user.role === "DONOR" ? "donor_org_id" : "ngo_org_id";
    const items = await mongo.collection("pickup_activity")
      .find({ [ownerField]: user.orgId })
      .sort({ observed_at: -1, _id: -1 }).limit(100).toArray();
    return NextResponse.json({ events: items.map((doc) => ({
      id: String(doc._id),
      pickup_id: doc.pickup_id,
      allocation_id: doc.allocation_id,
      status: doc.status,
      source: doc.source,
      event_at: doc.event_at ?? null,
      observed_at: doc.observed_at,
    })) });
  } catch (error) {
    console.error("Pickup activity lookup failed:", error);
    return NextResponse.json({ error: "Unable to load MongoDB pickup activity. Check MongoDB connection." }, { status: 503 });
  }
}
