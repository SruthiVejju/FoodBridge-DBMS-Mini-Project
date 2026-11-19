import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { rejectCrossOriginPost } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { ensureMongoIndexes, getMongoDb } from "@/lib/mongodb";

const schema = z.object({
  donationId: z.string().regex(/^[1-9]\d*$/, "Select a donation"),
  condition: z.enum(["GOOD", "NEEDS_REVIEW", "REJECTED"]),
  packaging: z.enum(["SEALED", "UNSEALED", "OTHER"]),
  temperatureC: z.number().finite().min(-30).max(150).nullable().optional(),
  notes: z.string().trim().min(3).max(1000),
}).strict();

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    // An NGO can see inspection notes only for food allocated to its own requests.
    const sql = user.role === "DONOR"
      ? "SELECT donation_id FROM donations WHERE donor_org_id = $1 ORDER BY donation_id DESC LIMIT 500"
      : `SELECT DISTINCT d.donation_id FROM donations d
          JOIN allocations a ON a.donation_id = d.donation_id
          JOIN ngo_requests r ON r.request_id = a.request_id
         WHERE r.ngo_org_id = $1 ORDER BY d.donation_id DESC LIMIT 500`;
    const result = await db.query<{ donation_id: string }>(sql, [user.orgId]);
    const ids = result.rows.map((row) => row.donation_id);
    if (ids.length === 0) return NextResponse.json({ inspections: [] });
    await ensureMongoIndexes();
    const mongo = await getMongoDb();
    const docs = await mongo.collection("food_inspections")
      .find({ donation_id: { $in: ids } })
      .sort({ checked_at: -1 }).limit(100).toArray();
    return NextResponse.json({ inspections: docs.map((doc) => ({
      id: String(doc._id),
      donation_id: doc.donation_id,
      condition: doc.condition,
      packaging: doc.packaging,
      temperature_c: doc.temperature_c ?? null,
      notes: doc.notes,
      checked_at: doc.checked_at,
    })) });
  } catch (error) {
    console.error("Inspection list failed:", error);
    return NextResponse.json({ error: "Unable to load food inspections" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const csrf = rejectCrossOriginPost(request);
  if (csrf) return csrf;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role !== "DONOR") return NextResponse.json({ error: "Only donors can record inspections" }, { status: 403 });
    let input: unknown;
    try { input = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = schema.safeParse(input);
    if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid inspection" }, { status: 400 });
    const v = result.data;
    const ownership = await db.query(
      "SELECT 1 FROM donations WHERE donation_id = $1::BIGINT AND donor_org_id = $2::BIGINT",
      [v.donationId, user.orgId],
    );
    if (!ownership.rowCount) return NextResponse.json({ error: "Donation not found or not yours" }, { status: 404 });
    await ensureMongoIndexes();
    const mongo = await getMongoDb();
    const inserted = await mongo.collection("food_inspections").insertOne({
      donation_id: v.donationId,
      donor_org_id: user.orgId,
      inspector_user_id: user.userId,
      condition: v.condition,
      packaging: v.packaging,
      ...(v.temperatureC != null ? { temperature_c: v.temperatureC } : {}),
      notes: v.notes,
      checked_at: new Date(),
    });
    return NextResponse.json({ ok: true, id: String(inserted.insertedId) }, { status: 201 });
  } catch (error) {
    console.error("Inspection creation failed:", error);
    return NextResponse.json({ error: "Unable to save inspection" }, { status: 503 });
  }
}
