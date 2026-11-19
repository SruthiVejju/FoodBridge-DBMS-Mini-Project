import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { loginSchema } from "@/lib/auth-validation";
import { rejectCrossOriginPost } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const csrfError = rejectCrossOriginPost(request);
  if (csrfError) return csrfError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password" }, { status: 400 });
  }

  try {
    const result = await db.query<{ user_id: string; password_hash: string }>(
      "SELECT user_id, password_hash FROM users WHERE email = $1",
      [parsed.data.email]
    );
    const user = result.rows[0];
    const valid = user && (await bcrypt.compare(parsed.data.password, user.password_hash));
    if (!valid) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }

    await db.query("UPDATE users SET last_login_at = NOW() WHERE user_id = $1", [user.user_id]);
    const response = NextResponse.json({ ok: true, redirectTo: "/dashboard" });
    response.cookies.set({ ...sessionCookieOptions, value: await createSessionToken(user.user_id) });
    return response;
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Unable to log in right now" }, { status: 500 });
  }
}
