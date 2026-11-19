import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rejectCrossOriginPost } from "@/lib/api-helpers";
import { databaseRuleError, reserveSchema } from "@/lib/workflow-validation";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });

    const ownerColumn = user.role === "DONOR" ? "d.donor_org_id" : "r.ngo_org_id";
    const result = await db.query(
      `SELECT a.allocation_id, a.donation_id, a.request_id, a.allocated_qty,
              a.match_score, a.status AS allocation_status, a.allocated_at,
              d.food_name, d.category, d.unit, d.pickup_address, d.expires_at,
              r.description AS request_description, r.needed_by,
              donor.org_name AS donor_name, ngo.org_name AS ngo_name,
              p.pickup_id, p.scheduled_at, p.delivery_status,
              p.collected_by, p.vehicle_no, p.completed_at
         FROM allocations a
         JOIN donations d ON d.donation_id = a.donation_id
         JOIN ngo_requests r ON r.request_id = a.request_id
         JOIN organizations donor ON donor.org_id = d.donor_org_id
         JOIN organizations ngo ON ngo.org_id = r.ngo_org_id
         LEFT JOIN pickups p ON p.allocation_id = a.allocation_id
        WHERE ${ownerColumn} = $1
        ORDER BY a.allocated_at DESC, a.allocation_id DESC
        LIMIT 100`,
      [user.orgId]
    );
    return NextResponse.json({ allocations: result.rows });
  } catch (error) {
    console.error("Allocation list failed", error);
    return NextResponse.json({ error: "Unable to load allocations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const csrf = rejectCrossOriginPost(request);
  if (csrf) return csrf;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role !== "NGO") {
      return NextResponse.json({ error: "Only NGOs can reserve food" }, { status: 403 });
    }
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
    const parsed = reserveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid reservation" }, { status: 400 });
    }
    const { requestId, donationId, quantity } = parsed.data;

    // Important: check request ownership and food eligibility on the SERVER,
    // rather than trusting the browser's selectable match list.
    const eligibility = await db.query<{ eligible: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM ngo_requests r
         JOIN donations d ON d.donation_id = $2::BIGINT
         WHERE r.request_id = $1::BIGINT
           AND r.ngo_org_id = $3::BIGINT
           AND r.status = 'OPEN' AND r.needed_by > NOW()
           AND d.status = 'AVAILABLE' AND d.expires_at > NOW()
           AND LOWER(BTRIM(r.category)) = LOWER(BTRIM(d.category))
           AND r.unit = d.unit
       ) AS eligible`,
      [requestId, donationId, user.orgId]
    );
    if (!eligibility.rows[0]?.eligible) {
      return NextResponse.json({ error: "Request or donation is unavailable, incompatible, or not yours" }, { status: 409 });
    }

    // reserve_food() invokes the capacity trigger. It locks parent rows,
    // enforces both quantities, and rejects competing over-reservations.
    // Store a real semantic score when both records have model embeddings.
    // This score ranks eligible matches; it does not bypass capacity checks.
    const scored = await db.query<{ score: string | null }>(
      `SELECT CASE WHEN d.embedding IS NOT NULL AND r.embedding IS NOT NULL
                   THEN ROUND(GREATEST(0, LEAST(1,
                         1 - (d.embedding <=> r.embedding)))::NUMERIC, 4)
                   ELSE NULL END AS score
         FROM donations d CROSS JOIN ngo_requests r
        WHERE d.donation_id = $1 AND r.request_id = $2`,
      [donationId, requestId]
    );
    const matchScore = scored.rows[0]?.score ?? null;

    const saved = await db.query<{ allocation_id: string }>(
      `SELECT reserve_food($1::BIGINT, $2::BIGINT, $3::NUMERIC, $4::NUMERIC)
              AS allocation_id`,
      [donationId, requestId, quantity, matchScore]
    );
    return NextResponse.json({ ok: true, allocationId: saved.rows[0].allocation_id }, { status: 201 });
  } catch (error) {
    const expected = databaseRuleError(error);
    if (expected) return NextResponse.json({ error: expected }, { status: 409 });
    console.error("Reservation failed", error);
    return NextResponse.json({ error: "Unable to reserve food" }, { status: 500 });
  }
}
