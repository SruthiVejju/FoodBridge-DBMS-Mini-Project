import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth";
import { rejectCrossOriginPost } from "@/lib/api-helpers";

export async function POST(request: Request) {
  const csrfError = rejectCrossOriginPost(request);
  if (csrfError) return csrfError;
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...sessionCookieOptions, value: "", maxAge: 0 });
  return response;
}
