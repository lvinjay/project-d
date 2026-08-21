import {
  NextResponse,
} from "next/server";

import {
  supabase,
} from "../../../lib/supabase";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET() {
  try {
    const {
      data,
      error,
    } =
      await supabase
        .from("products")
        .select(
          "id, product_name, category, review_analysis, product_detail_analysis",
        )
        .eq(
          "category",
          "로봇청소기",
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        );

    if (error) {
      throw error;
    }

    const products =
      data ?? [];

    return NextResponse.json({
      success: true,

      count:
        products.length,

      products:
        products.map(
          (product) => ({
            id:
              product.id,

            productName:
              product.product_name,

            hasReviewAnalysis:
              Boolean(
                product.review_analysis,
              ),

            hasProductDetailAnalysis:
              Boolean(
                product.product_detail_analysis,
              ),
          }),
        ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "제품 조회 실패",
      },
      {
        status: 500,
      },
    );
  }
}
