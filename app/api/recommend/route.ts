import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: false, retired: true, paidApiCalls: 0, dbWrites: 0,
    message: "Legacy recommendation is retired. Continue at /advisor.",
  }, { status: 410 });
}
