import { NextResponse, connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  // Request-specific authentication must not run during static prerendering.
  await connection();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });
    return NextResponse.json({ authenticated: true, user });
  } catch (error) {
    console.error("Session lookup failed", error);
    return NextResponse.json({ error: "Session lookup failed" }, { status: 500 });
  }
}
