
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await db.query(`
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        (SELECT COUNT(*)
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE') AS table_count,
        (SELECT extversion
         FROM pg_extension
         WHERE extname = 'vector') AS pgvector_version
    `);

    return NextResponse.json({
      status: "connected",
      ...result.rows[0],
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    return NextResponse.json(
      { status: "error", message: "Database connection failed" },
      { status: 500 }
    );
  }
}
