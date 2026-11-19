import { NextResponse, connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Existing authorization and SQL-level eligibility are unchanged.
// Semantic scores only rank candidates that are already eligible to reserve.
export async function GET(request: Request) {
  // Request-specific authentication must not run during static prerendering.
  await connection();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role !== "NGO") {
      return NextResponse.json({ error: "Only NGOs can view matches" }, { status: 403 });
    }

    const requestId = new URL(request.url).searchParams.get("requestId");
    if (!requestId || !/^[1-9]\d*$/.test(requestId)) {
      return NextResponse.json({ error: "Select a valid NGO request" }, { status: 400 });
    }

    const req = await db.query<{
      request_id: string;
      remaining_qty: string;
      unit: string;
      indexed: boolean;
    }>(
      `SELECT r.request_id, ra.remaining_qty, r.unit,
              (r.embedding IS NOT NULL) AS indexed
         FROM ngo_requests r
         JOIN ngo_request_availability ra ON ra.request_id = r.request_id
        WHERE r.request_id = $1 AND r.ngo_org_id = $2
          AND r.status = 'OPEN' AND r.needed_by > NOW()
          AND ra.remaining_qty > 0`,
      [requestId, user.orgId]
    );
    if (req.rowCount === 0) {
      return NextResponse.json(
        { error: "This request is unavailable, complete, or overdue", matches: [] },
        { status: 409 }
      );
    }

    const baseJoins = `
       FROM ngo_requests r
       JOIN ngo_request_availability ra ON ra.request_id = r.request_id
       JOIN donations d
         ON LOWER(BTRIM(d.category)) = LOWER(BTRIM(r.category))
        AND d.unit = r.unit
       JOIN donation_availability da ON da.donation_id = d.donation_id
       JOIN organizations o ON o.org_id = d.donor_org_id
      WHERE r.request_id = $1 AND r.ngo_org_id = $2
        AND r.status = 'OPEN' AND r.needed_by > NOW()
        AND d.status = 'AVAILABLE' AND d.expires_at > NOW()
        AND da.available_qty > 0 AND ra.remaining_qty > 0`;

    // All indexed candidates are ranked by cosine distance. Using the same
    // model for both sides makes their embeddings comparable.
    if (req.rows[0].indexed) {
      const indexed = await db.query(
        `SELECT d.donation_id, d.food_name, d.description, d.category,
                da.available_qty, d.unit, d.expires_at, d.pickup_address,
                o.org_name AS donor_name,
                LEAST(da.available_qty, ra.remaining_qty) AS max_reservable,
                ROUND(GREATEST(0, LEAST(100,
                  (100 * (1 - (d.embedding <=> r.embedding)))::NUMERIC)), 1)
                  AS similarity_percent
          ${baseJoins}
           AND d.embedding IS NOT NULL AND r.embedding IS NOT NULL
         ORDER BY d.embedding <=> r.embedding ASC, d.expires_at ASC
         LIMIT 30`,
        [requestId, user.orgId]
      );
      if (indexed.rows.length > 0) {
        return NextResponse.json({
          request: req.rows[0],
          matches: indexed.rows,
          matchingMethod: "pgvector_cosine",
        });
      }
    }

    // Honest fallback when embeddings have not yet been generated. We never
    // label these category/unit results as AI or semantic matches.
    const fallback = await db.query(
      `SELECT d.donation_id, d.food_name, d.description, d.category,
              da.available_qty, d.unit, d.expires_at, d.pickup_address,
              o.org_name AS donor_name,
              LEAST(da.available_qty, ra.remaining_qty) AS max_reservable,
              NULL::NUMERIC AS similarity_percent
       ${baseJoins}
       ORDER BY d.expires_at ASC, da.available_qty DESC
       LIMIT 30`,
      [requestId, user.orgId]
    );
    return NextResponse.json({
      request: req.rows[0],
      matches: fallback.rows,
      matchingMethod: "category_and_unit",
    });
  } catch (error) {
    console.error("Food similarity lookup failed", error);
    return NextResponse.json({ error: "Unable to find eligible donations" }, { status: 500 });
  }
}
