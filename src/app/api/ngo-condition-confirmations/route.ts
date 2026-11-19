import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { rejectCrossOriginPost } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { getMongoDb } from "@/lib/mongodb";

// PostgreSQL owns allocations and pickup states. MongoDB stores a separate,
// append-only NGO observation. An observation does NOT change delivery status.
const confirmationSchema = z.object({
  allocationId: z.string().regex(/^[1-9]\d*$/, "Select a valid allocation"),
  finding: z.enum(["AS_DECLARED", "DIFFERENT", "UNSAFE"]),
  notes: z.string().trim().min(5).max(1000),
}).strict();

type AllocationRow = {
  allocation_id: string;
  pickup_id: string | null;
  pickup_status: string | null;
  donation_id: string;
  food_name: string;
  donor_name: string;
};

async function allocationsForNgo(orgId: string) {
  return db.query<AllocationRow>(
    `SELECT a.allocation_id, p.pickup_id, p.delivery_status AS pickup_status,
            d.donation_id, d.food_name, org.org_name AS donor_name
       FROM allocations a
       JOIN ngo_requests r ON r.request_id = a.request_id
       JOIN donations d ON d.donation_id = a.donation_id
       JOIN organizations org ON org.org_id = d.donor_org_id
       LEFT JOIN pickups p ON p.allocation_id = a.allocation_id
      WHERE r.ngo_org_id = $1::BIGINT AND a.status <> 'CANCELLED'
      ORDER BY a.allocated_at DESC, a.allocation_id DESC
      LIMIT 100`,
    [orgId],
  );
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role !== "NGO") return NextResponse.json({ error: "Only NGO users can view these confirmations" }, { status: 403 });
    const allocations = (await allocationsForNgo(user.orgId)).rows;
    if (allocations.length === 0) return NextResponse.json({ allocations: [] });
    const mongo = await getMongoDb();
    const donationIds = [...new Set(allocations.map((a) => a.donation_id))];
    const [declarations, confirmations] = await Promise.all([
      mongo.collection("food_inspections")
        .find({ donation_id: { $in: donationIds } })
        .sort({ checked_at: -1 }).limit(500).toArray(),
      mongo.collection("ngo_condition_confirmations")
        .find({ allocation_id: { $in: allocations.map((a) => a.allocation_id) } })
        .limit(100).toArray(),
    ]);
    const latestDeclaration = new Map<string, (typeof declarations)[number]>();
    for (const declaration of declarations) {
      const id = String(declaration.donation_id);
      if (!latestDeclaration.has(id)) latestDeclaration.set(id, declaration);
    }
    const confirmationByAllocation = new Map(confirmations.map((c) => [String(c.allocation_id), c]));
    return NextResponse.json({ allocations: allocations.map((a) => {
      const donor = latestDeclaration.get(a.donation_id);
      const ngo = confirmationByAllocation.get(a.allocation_id);
      return {
        ...a,
        donorDeclaration: donor ? {
          condition: String(donor.condition ?? "UNKNOWN"),
          packaging: String(donor.packaging ?? "UNKNOWN"),
          notes: String(donor.notes ?? ""),
          checkedAt: donor.checked_at ?? null,
        } : null,
        ngoConfirmation: ngo ? {
          finding: String(ngo.finding),
          notes: String(ngo.notes ?? ""),
          recordedAt: ngo.recorded_at ?? null,
        } : null,
      };
    }) });
  } catch (error) {
    console.error("NGO condition confirmations list failed:", error);
    return NextResponse.json({ error: "Unable to load NGO confirmation records" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const csrf = rejectCrossOriginPost(request);
  if (csrf) return csrf;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role !== "NGO") return NextResponse.json({ error: "Only NGOs can confirm received food condition" }, { status: 403 });
    let payload: unknown;
    try { payload = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
    const parsed = confirmationSchema.safeParse(payload);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid confirmation" }, { status: 400 });
    const { allocationId, finding, notes } = parsed.data;
    const eligible = await db.query<{
      allocation_id: string; pickup_id: string; donation_id: string;
    }>(
      `SELECT a.allocation_id, p.pickup_id, d.donation_id
         FROM allocations a
         JOIN ngo_requests r ON r.request_id = a.request_id
         JOIN donations d ON d.donation_id = a.donation_id
         JOIN pickups p ON p.allocation_id = a.allocation_id
        WHERE a.allocation_id = $1::BIGINT
          AND r.ngo_org_id = $2::BIGINT
          AND a.status = 'COLLECTED'
          AND p.delivery_status IN ('PICKED_UP', 'DELIVERED')`,
      [allocationId, user.orgId],
    );
    const a = eligible.rows[0];
    if (!a) {
      return NextResponse.json({
        error: "Confirmation is available only after the donor marks this pickup as collected",
      }, { status: 409 });
    }
    const mongo = await getMongoDb();
    const declarations = await mongo.collection("food_inspections")
      .find({ donation_id: a.donation_id })
      .sort({ checked_at: -1 }).limit(1).toArray();
    const declaration = declarations[0];
    await mongo.collection("ngo_condition_confirmations")
      .createIndex({ allocation_id: 1 }, { unique: true });
    // One immutable assessment per allocation: later edits would otherwise
    // overwrite the audit evidence. Never claim this is food safety approval.
    await mongo.collection("ngo_condition_confirmations").insertOne({
      allocation_id: a.allocation_id,
      pickup_id: a.pickup_id,
      donation_id: a.donation_id,
      ngo_org_id: user.orgId,
      ngo_user_id: user.userId,
      finding,
      notes,
      donor_declaration_snapshot: declaration ? {
        inspection_id: String(declaration._id),
        condition: declaration.condition ?? null,
        packaging: declaration.packaging ?? null,
        notes: declaration.notes ?? null,
        checked_at: declaration.checked_at ?? null,
      } : null,
      recorded_at: new Date(),
    });
    return NextResponse.json({ ok: true, message: "NGO observation saved to MongoDB" }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "This allocation already has a condition confirmation" }, { status: 409 });
    }
    console.error("NGO condition confirmation failed:", error);
    return NextResponse.json({ error: "Unable to save NGO condition confirmation" }, { status: 503 });
  }
}
