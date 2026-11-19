import { NextResponse } from "next/server";

/** Blocks cross-site form or fetch POSTs that include a mismatched Origin. */
export function rejectCrossOriginPost(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (origin && origin !== expected) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }
  return null;
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "23505") return "An account with this email already exists";
    if (error.code === "23514" || error.code === "23503") return "Invalid organization or user details";
  }
  return "Unexpected server error. Please try again";
}
