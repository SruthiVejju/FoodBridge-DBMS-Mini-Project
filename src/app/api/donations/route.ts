import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rejectCrossOriginPost, errorMessage } from "@/lib/api-helpers";
import { donationSchema } from "@/lib/food-validation";
import { createEmbedding, donationText } from "@/lib/semantic-embeddings";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role === "DONOR") {
      const result = await db.query(
        `SELECT d.donation_id, d.food_name, d.description, d.category,
                d.total_qty, da.available_qty, d.unit, d.prepared_at,
                d.expires_at, d.pickup_address, d.status, d.created_at
           FROM donations d
           JOIN donation_availability da ON da.donation_id = d.donation_id
          WHERE d.donor_org_id = $1
          ORDER BY d.created_at DESC, d.donation_id DESC LIMIT 100`,
        [user.orgId]
      );
      return NextResponse.json({ donations: result.rows });
    }

    const result = await db.query(
      `SELECT d.donation_id, d.food_name, d.description, d.category,
              da.available_qty, d.unit, d.expires_at, o.org_name AS donor_name
         FROM donations d
         JOIN donation_availability da ON da.donation_id = d.donation_id
         JOIN organizations o ON o.org_id = d.donor_org_id
        WHERE d.status = 'AVAILABLE' AND d.expires_at > NOW() AND da.available_qty > 0
        ORDER BY d.expires_at ASC, d.donation_id DESC LIMIT 100`
    );
    return NextResponse.json({ donations: result.rows });
  } catch (error) {
    console.error("Donation list failed:", error);
    return NextResponse.json({ error: "Unable to retrieve donations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const csrfError = rejectCrossOriginPost(request);
  if (csrfError) return csrfError;

  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role !== "DONOR") {
      return NextResponse.json({ error: "Only food donors can create donations" }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

    const parsed = donationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid donation" }, { status: 400 });
    }
    const data = parsed.data;
    const expiry = new Date(data.expiresAt);
    if (expiry.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Expiry must be in the future" }, { status: 400 });
    }
    if (data.preparedAt && expiry.getTime() <= new Date(data.preparedAt).getTime()) {
      return NextResponse.json({ error: "Expiry must be after preparation" }, { status: 400 });
    }

    let embedding: string | null = null;
    try {
      embedding = await createEmbedding(donationText(data.foodName, data.category, data.description));
    } catch (error) {
      // Preserve the donation even if the model is temporarily unavailable.
      // The backfill script can index these records later.
      console.error("Donation embedding unavailable; record will be backfilled:", error);
    }

    const result = await db.query<{ donation_id: string }>(
      `INSERT INTO donations
          (donor_org_id, food_name, description, category, total_qty, unit,
           prepared_at, expires_at, pickup_address, embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector(384))
       RETURNING donation_id`,
      [user.orgId, data.foodName, data.description, data.category,
        data.totalQty, data.unit, data.preparedAt, data.expiresAt, data.pickupAddress, embedding]
    );
    return NextResponse.json({ ok: true, donationId: result.rows[0].donation_id, semanticIndexed: embedding !== null }, { status: 201 });
  } catch (error) {
    console.error("Donation creation failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
