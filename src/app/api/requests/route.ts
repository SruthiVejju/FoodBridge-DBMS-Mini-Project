import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rejectCrossOriginPost, errorMessage } from "@/lib/api-helpers";
import { ngoRequestSchema } from "@/lib/food-validation";
import { createEmbedding, ngoRequestText } from "@/lib/semantic-embeddings";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role === "NGO") {
      const result = await db.query(
        `SELECT r.request_id, r.description, r.category, r.requested_qty,
                a.remaining_qty, r.unit, r.needed_by, r.delivery_address,
                r.priority, r.status, r.created_at
           FROM ngo_requests r
           JOIN ngo_request_availability a ON a.request_id = r.request_id
          WHERE r.ngo_org_id = $1
          ORDER BY r.created_at DESC, r.request_id DESC LIMIT 100`,
        [user.orgId]
      );
      return NextResponse.json({ requests: result.rows });
    }
    // Donors can see general needs without recipients' delivery addresses.
    const result = await db.query(
      `SELECT r.request_id, r.description, r.category, a.remaining_qty,
              r.unit, r.needed_by, r.priority, o.org_name AS ngo_name
         FROM ngo_requests r
         JOIN ngo_request_availability a ON a.request_id = r.request_id
         JOIN organizations o ON o.org_id = r.ngo_org_id
        WHERE r.status = 'OPEN' AND r.needed_by > NOW() AND a.remaining_qty > 0
        ORDER BY r.needed_by ASC, r.request_id DESC LIMIT 100`
    );
    return NextResponse.json({ requests: result.rows });
  } catch (error) {
    console.error("NGO request list failed:", error);
    return NextResponse.json({ error: "Unable to retrieve requests" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const csrfError = rejectCrossOriginPost(request);
  if (csrfError) return csrfError;

  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (user.role !== "NGO") {
      return NextResponse.json({ error: "Only NGOs can submit food requests" }, { status: 403 });
    }

    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

    const parsed = ngoRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid food request" }, { status: 400 });
    }
    const data = parsed.data;
    if (new Date(data.neededBy).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Needed-by date must be in the future" }, { status: 400 });
    }

    let embedding: string | null = null;
    try {
      embedding = await createEmbedding(ngoRequestText(data.category, data.description));
    } catch (error) {
      console.error("Request embedding unavailable; record will be backfilled:", error);
    }

    const result = await db.query<{ request_id: string }>(
      `INSERT INTO ngo_requests
         (ngo_org_id, description, category, requested_qty, unit,
          needed_by, delivery_address, priority, embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector(384))
       RETURNING request_id`,
      [user.orgId, data.description, data.category, data.requestedQty,
        data.unit, data.neededBy, data.deliveryAddress, data.priority, embedding]
    );
    return NextResponse.json({ ok: true, requestId: result.rows[0].request_id, semanticIndexed: embedding !== null }, { status: 201 });
  } catch (error) {
    console.error("NGO request creation failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
