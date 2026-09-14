import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({
    success: false,
    retired: true,
    dbWrite: false,
    message: "제품 pool 정리 endpoint는 폐기되었습니다. 리뷰 근거와 점수 보호를 위해 정리 작업을 실행하지 않습니다.",
  }, { status: 410 });
}
