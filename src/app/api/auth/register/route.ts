import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/auth-validation";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { errorMessage, rejectCrossOriginPost } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const csrfError = rejectCrossOriginPost(request);
  if (csrfError) return csrfError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid registration details" },
      { status: 400 }
    );
  }

  const input = parsed.data;
  if (Buffer.byteLength(input.password, "utf8") > 72) {
    return NextResponse.json({ error: "Password must be at most 72 UTF-8 bytes" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const client = await db.connect();
  let userId = "";
  try {
    await client.query("BEGIN");
    const organization = await client.query<{ org_id: string }>(
      `INSERT INTO organizations
         (org_name, org_type, address, contact_person, contact_phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING org_id`,
      [input.orgName, input.orgType, input.address, input.contactPerson, input.contactPhone]
    );
    const organizationId = organization.rows[0].org_id;
    const user = await client.query<{ user_id: string }>(
      `INSERT INTO users (org_id, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id`,
      [organizationId, input.fullName, input.email, passwordHash]
    );
    userId = user.rows[0].user_id;
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    const isDuplicate = Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
    if (!isDuplicate) console.error("Registration failed", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: isDuplicate ? 409 : 500 });
  } finally {
    client.release();
  }

  const response = NextResponse.json({ ok: true, redirectTo: "/dashboard" }, { status: 201 });
  response.cookies.set({ ...sessionCookieOptions, value: await createSessionToken(userId) });
  return response;
}
