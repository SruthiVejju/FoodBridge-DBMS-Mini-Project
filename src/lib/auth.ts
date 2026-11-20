import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";

export type UserRole = "DONOR" | "NGO" | "ADMIN";
export type CurrentUser = {
  userId: string;
  orgId: string;
  fullName: string;
  email: string;
  role: UserRole;
  orgName: string;
  verificationStatus: string;
};

const COOKIE_NAME = "fw_session";
const COOKIE_AGE = 60 * 60 * 24 * 7; // 7 days

function signingKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a long random value in .env.local");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(signingKey());
}

export const sessionCookieOptions = {
  name: COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_AGE,
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub || !/^\d+$/.test(payload.sub)) return null;
    userId = payload.sub;
  } catch {
    return null;
  }

  // Read the current role and organization from the database rather than
  // relying on role information embedded in a potentially stale token.
  const result = await db.query<{
    user_id: string;
    org_id: string;
    full_name: string;
    email: string;
    role: UserRole;
    org_name: string;
    verification_status: string;
  }>(
    `SELECT u.user_id, u.org_id, u.full_name, u.email, o.org_type AS role,
            o.org_name, o.verification_status
       FROM users u
       JOIN organizations o ON o.org_id = u.org_id
      WHERE u.user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    orgId: row.org_id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    orgName: row.org_name,
    verificationStatus: row.verification_status,
  };
}
