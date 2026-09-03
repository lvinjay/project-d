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
  reviews?: string[];
  collectionStats?: unknown;
  sourceMode?: string;
  reviewSourceUrl?: string;
  collectionMetadata?: unknown;
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

function normalizeEvidenceText(
  value: unknown,
) {
  return cleanText(
    value,
  )
    .replace(
      /<br\s*\/?>/gi,
      " ",
    )
    .replace(
      /&nbsp;/gi,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .slice(
      0,
      2500,
    );
}

function prepareReviews(
  value: unknown,
) {
  const sourceReviews =
    Array.isArray(
      value,
    )
      ? value
      : [];

  const reviews:
    string[] = [];

  const seen =
    new Set<string>();

  let nonEmptyReviewCount =
    0;

  for (
    const sourceReview of
    sourceReviews
  ) {
    const review =
      cleanText(
        sourceReview,
      );

    if (!review) {
      continue;
    }

    nonEmptyReviewCount++;

    const evidenceKey =
      normalizeEvidenceText(
        review,
      );

    if (
      !evidenceKey ||
      seen.has(
        evidenceKey,
      )
    ) {
      continue;
    }

    seen.add(
      evidenceKey,
    );

    reviews.push(
      review,
    );
  }

  return {
    reviews,
    receivedReviewCount:
      nonEmptyReviewCount,
    duplicateReviewCount:
      nonEmptyReviewCount -
      reviews.length,
  };
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
            "저장할 원시 리뷰가 없습니다.",
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

      if (!productName) {
        results.push({
          success: false,
          productId,
          productName,
          reason:
            "상품명이 없습니다.",
        });

        continue;
      }

      const {
        reviews,
        receivedReviewCount,
        duplicateReviewCount,
      } =
        prepareReviews(
          item.reviews,
        );

      if (
        reviews.length === 0
      ) {
        results.push({
          success: false,
          productId,
          productName,
          reason:
            "저장할 실제 리뷰 본문이 없습니다.",
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

      const savedAt =
        new Date()
          .toISOString();

      const sourceMode =
        cleanText(
          item.sourceMode,
        );

      const reviewSourceUrl =
        cleanText(
          item.reviewSourceUrl,
        );

      const {
        error: updateError,
      } =
        await supabase
          .from("products")
          .update({
            review_raw_data: {
              schemaVersion:
                1,

              reviews,

              collectionStats:
                item.collectionStats ??
                null,

              collectionMetadata:
                item.collectionMetadata ??
                null,

              sourceMode:
                sourceMode ||
                null,

              reviewSourceUrl:
                reviewSourceUrl ||
                null,

              receivedReviewCount,

              savedReviewCount:
                reviews.length,

              duplicateReviewCount,

              savedAt,
            },

            updated_at:
              savedAt,
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
        receivedReviewCount,
        savedReviewCount:
          reviews.length,
        duplicateReviewCount,
        reviewAnalysisPreserved:
          true,
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

      reviewAnalysisPreserved:
        true,

      results,
    });
  } catch (error) {
    console.error(
      "Save raw review batch error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "원시 리뷰 저장 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}
