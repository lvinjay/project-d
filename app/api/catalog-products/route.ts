import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductDetailAnalysis = {
  price?: unknown;
  representativeImageUrl?: unknown;
};

export async function GET(request: Request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const query = (
      searchParams.get("q") ?? ""
    )
      .trim()
      .toLowerCase();

    const category = (
      searchParams.get("category") ?? ""
    ).trim();

    const analyzedOnly =
      searchParams.get("analyzedOnly") ===
      "true";

    const { data, error } =
      await supabase
        .from("products")
        .select(
          `
            id,
            category,
            product_name,
            source_url,
            review_analysis,
            product_detail_analysis,
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

    const products =
      (data ?? [])
        .filter((product) => {
          if (
            analyzedOnly &&
            !product.review_analysis
          ) {
            return false;
          }

          if (
            category &&
            product.category.trim() !==
              category
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
        })
        .map((product) => {
          const detail =
            product.product_detail_analysis &&
            typeof product.product_detail_analysis ===
              "object" &&
            !Array.isArray(
              product.product_detail_analysis,
            )
              ? (product.product_detail_analysis as ProductDetailAnalysis)
              : {};

          const price =
            typeof detail.price ===
            "string"
              ? detail.price.trim()
              : typeof detail.price ===
                    "number"
                ? String(detail.price)
                : "";

          const representativeImageUrl =
            typeof detail.representativeImageUrl ===
            "string"
              ? detail.representativeImageUrl.trim()
              : "";

          return {
            id: product.id,
            category: product.category,
            productName:
              product.product_name,
            sourceUrl:
              product.source_url,
            price,
            representativeImageUrl,
            analyzed:
              Boolean(
                product.review_analysis,
              ),
          };
        });

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
