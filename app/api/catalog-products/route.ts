import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const query = (
      searchParams.get("q") ?? ""
    )
      .trim()
      .toLowerCase();

    const analyzedOnly =
      searchParams.get("analyzedOnly") === "true";

    const { data, error } = await supabase
      .from("products")
      .select(
        `
          id,
          category,
          product_name,
          source_url,
          review_analysis,
          created_at,
          updated_at
        `,
      )
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    const products = (data ?? []).filter(
      (product) => {
        if (
          analyzedOnly &&
          !product.review_analysis
        ) {
          return false;
        }

        if (!query) {
          return true;
        }

        return (
          product.product_name
            .toLowerCase()
            .includes(query) ||
          product.category
            .toLowerCase()
            .includes(query)
        );
      },
    );

    return NextResponse.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error(
      "Catalog products API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        count: 0,
        products: [],
        message:
          error instanceof Error
            ? error.message
            : "제품 목록을 불러오지 못했습니다.",
      },
      { status: 500 },
    );
  }
}