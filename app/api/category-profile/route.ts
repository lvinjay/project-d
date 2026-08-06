import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = (searchParams.get("category") ?? "").trim();

    if (!category) {
      return NextResponse.json(
        { success: false, message: "category가 필요합니다." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("category_profiles")
      .select(
        "id, category, title, introduction, criteria, use_cases, candidate_limit, updated_at",
      )
      .eq("category", category)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          message: "아직 준비되지 않은 카테고리입니다.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, profile: data });
  } catch (error) {
    console.error("Category profile API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "카테고리 구매 가이드를 불러오지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
