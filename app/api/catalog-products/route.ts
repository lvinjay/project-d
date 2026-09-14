import { UUID_PATTERN } from "../../../lib/project-d-selected-five-manifest";
﻿import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductDetailAnalysis = {
  price?: unknown;

  finalPrice?: unknown;

  marketListedPrice?: unknown;

  imageUrl?: unknown;

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

    const scoped = searchParams.has("productIds");
    const productIds = (searchParams.get("productIds") ?? "").split(",");
    if (scoped && (!category || productIds.length < 1 || productIds.length > 5 ||
        productIds.some(id => !UUID_PATTERN.test(id)) || new Set(productIds.map(id => id.toLowerCase())).size !== productIds.length)) {
      return NextResponse.json({ success: false, message: "1~5개의 고유 UUID와 category가 필요합니다." }, { status: 400 });
    }
    let productsQuery = supabase
        .from("products")
        .select(
          `
            id,
            category,
            origin_product_no,
            product_name,
            source_url,
            review_analysis,
            product_detail_analysis,
            created_at,
            updated_at
          `,
        );
    if (scoped) productsQuery = productsQuery.eq("category", category).in("id", productIds);
    const { data, error } = await productsQuery.order("created_at", {
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

          const priceObject =
            detail.price &&
            typeof detail.price ===
              "object" &&
            !Array.isArray(
              detail.price,
            )
              ? (
                  detail.price as Record<
                    string,
                    unknown
                  >
                )
              : {};

          const rawPrice =
            priceObject.finalPrice ??
            detail.finalPrice ??
            detail.price ??
            detail.marketListedPrice ??
            "";

          const price =
            typeof rawPrice ===
            "string"
              ? rawPrice.trim()
              : typeof rawPrice ===
                    "number"
                ? String(rawPrice)
                : "";

          const rawImageUrl =
            detail.representativeImageUrl ??
            detail.imageUrl ??
            "";

          const representativeImageUrl =
            typeof rawImageUrl ===
            "string"
              ? rawImageUrl.trim()
              : "";

          return {
            id: product.id,
            originProductNo: Number(product.origin_product_no),
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

    if (scoped && (products.length !== productIds.length || productIds.some(id => products.filter(p => p.id === id).length !== 1))) {
      return NextResponse.json({ success: false, products: [], count: 0, message: "요청한 UUID 전체의 카테고리·분석 상태가 일치하지 않습니다." }, { status: 409 });
    }
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

