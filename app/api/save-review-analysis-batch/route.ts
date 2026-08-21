import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type SaveItem = {
  productId?: string;
  productName?: string;
  analysis?: unknown;
  reviews?: string[];
  collectionStats?: unknown;
};

type SaveRequest = {
  category?: string;
  products?: SaveItem[];
};

function cleanText(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function getSupabase() {
  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.",
    );
  }

  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as
        SaveRequest;

    const category =
      cleanText(
        body.category,
      );

    const products =
      Array.isArray(
        body.products,
      )
        ? body.products
        : [];

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message:
            "카테고리가 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      products.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "저장할 리뷰 분석 결과가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      getSupabase();

    const results = [];

    for (
      const item of
      products
    ) {
      const productId =
        cleanText(
          item.productId,
        );

      const productName =
        cleanText(
          item.productName,
        );

      const originProductNo =
        Number(
          productId,
        );

      if (
        !productName ||
        !item.analysis
      ) {
        results.push({
          success: false,
          productId,
          productName,
          reason:
            "상품명 또는 분석 결과가 없습니다.",
        });

        continue;
      }

      let query =
        supabase
          .from("products")
          .select(
            "id, product_name, origin_product_no",
          )
          .eq(
            "category",
            category,
          );

      if (
        Number.isSafeInteger(
          originProductNo,
        ) &&
        originProductNo > 0
      ) {
        query =
          query.eq(
            "origin_product_no",
            originProductNo,
          );
      } else {
        query =
          query.eq(
            "product_name",
            productName,
          );
      }

      const {
        data: matched,
        error: matchError,
      } =
        await query
          .limit(1)
          .maybeSingle();

      if (matchError) {
        throw matchError;
      }

      if (!matched) {
        results.push({
          success: false,
          productId,
          productName,
          reason:
            "DB에서 해당 제품을 찾지 못했습니다.",
        });

        continue;
      }

      const reviews =
        Array.isArray(
          item.reviews,
        )
          ? item.reviews
              .map(
                (review) =>
                  cleanText(
                    review,
                  ),
              )
              .filter(Boolean)
          : [];

      const {
        error: updateError,
      } =
        await supabase
          .from("products")
          .update({
            review_analysis:
              item.analysis,

            review_raw_data: {
              reviews,
              collectionStats:
                item.collectionStats ??
                null,
              savedAt:
                new Date()
                  .toISOString(),
            },

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            matched.id,
          );

      if (updateError) {
        throw updateError;
      }

      results.push({
        success: true,
        productId,
        productName,
        dbProductId:
          matched.id,
      });
    }

    const successCount =
      results.filter(
        (item) =>
          item.success,
      ).length;

    return NextResponse.json({
      success:
        successCount ===
        products.length,

      category,

      requestedCount:
        products.length,

      successCount,

      failureCount:
        products.length -
        successCount,

      results,
    });
  } catch (error) {
    console.error(
      "Save review analysis batch error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "리뷰 분석 결과 저장 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}
