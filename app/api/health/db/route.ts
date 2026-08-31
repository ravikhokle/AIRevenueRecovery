import { NextResponse } from "next/server";

import { DatabaseConnectionError, pingDatabase } from "@/lib/db";

export async function GET() {
  try {
    const result = await pingDatabase();

    return NextResponse.json({
      status: "ok",
      database: result.database,
    });
  } catch (error) {
    const message =
      error instanceof DatabaseConnectionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Database connection failed";

    return NextResponse.json(
      {
        status: "error",
        message,
      },
      { status: 503 },
    );
  }
}
