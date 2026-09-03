import {
  createHash,
} from "node:crypto";

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

function cleanText(
  value: unknown,
) {
  return typeof value ===
    "string"
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

function canonicalize(
  value: unknown,
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    typeof value ===
      "object"
  ) {
    const record =
      value as
        Record<
          string,
          unknown
        >;

    const result:
      Record<
        string,
        unknown
      > = {};

    for (
      const key of
      Object.keys(
        record,
      ).sort()
    ) {
      result[key] =
        canonicalize(
          record[key],
        );
    }

    return result;
  }

  return value;
}

function fingerprint(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const serialized =
    JSON.stringify(
      canonicalize(
        value,
      ),
    );

  return createHash(
    "sha256",
  )
    .update(
      serialized,
      "utf8",
    )
    .digest(
      "hex",
    );
}

function asRecord(
  value: unknown,
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  )
    ? value as
        Record<
          string,
          unknown
        >
    : null;
}

export async function GET(
  request: Request,
) {
  try {
    const url =
      new URL(
        request.url,
      );

    const category =
      cleanText(
        url.searchParams.get(
          "category",
        ),
      );

    const productName =
      cleanText(
        url.searchParams.get(
          "productName",
        ),
      );

    const originProductNoText =
      cleanText(
        url.searchParams.get(
          "originProductNo",
        ),
      );

    const originProductNo =
      Number(
        originProductNoText,
      );

    const hasOriginProductNo =
      Number.isSafeInteger(
        originProductNo,
      ) &&
      originProductNo >
        0;

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
      !hasOriginProductNo &&
      !productName
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "originProductNo 또는 productName이 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    const supabase =
      getSupabase();

    let query =
      supabase
        .from(
          "products",
        )
        .select(
          [
            "id",
            "product_name",
            "origin_product_no",
            "review_analysis",
            "review_raw_data",
            "updated_at",
          ].join(
            ",",
          ),
        )
        .eq(
          "category",
          category,
        );

    if (
      hasOriginProductNo
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
        .limit(
          1,
        )
        .maybeSingle();

    if (matchError) {
      throw matchError;
    }

    if (!matched) {
      return NextResponse.json(
        {
          success: false,
          message:
            "DB에서 해당 제품을 찾지 못했습니다.",
        },
        {
          status: 404,
        },
      );
    }

    const rawData =
      asRecord(
        matched.review_raw_data,
      );

    const rawReviews =
      rawData &&
      Array.isArray(
        rawData.reviews,
      )
        ? rawData.reviews
        : [];

    const rawSavedReviewCount =
      rawData &&
      Number.isFinite(
        Number(
          rawData.savedReviewCount,
        ),
      )
        ? Number(
            rawData.savedReviewCount,
          )
        : null;

    const rawReceivedReviewCount =
      rawData &&
      Number.isFinite(
        Number(
          rawData.receivedReviewCount,
        ),
      )
        ? Number(
            rawData.receivedReviewCount,
          )
        : null;

    const rawDuplicateReviewCount =
      rawData &&
      Number.isFinite(
        Number(
          rawData.duplicateReviewCount,
        ),
      )
        ? Number(
            rawData.duplicateReviewCount,
          )
        : null;

    return NextResponse.json({
      success: true,

      category,

      dbProductId:
        matched.id,

      productName:
        matched.product_name,

      originProductNo:
        matched.origin_product_no,

      reviewAnalysisPresent:
        matched.review_analysis !==
          null &&
        matched.review_analysis !==
          undefined,

      reviewAnalysisSha256:
        fingerprint(
          matched.review_analysis,
        ),

      reviewRawDataPresent:
        matched.review_raw_data !==
          null &&
        matched.review_raw_data !==
          undefined,

      reviewRawDataSha256:
        fingerprint(
          matched.review_raw_data,
        ),

      rawReviewCount:
        rawReviews.length,

      rawSavedReviewCount,

      rawReceivedReviewCount,

      rawDuplicateReviewCount,

      rawSourceMode:
        rawData
          ? cleanText(
              rawData.sourceMode,
            ) ||
            null
          : null,

      rawReviewSourceUrl:
        rawData
          ? cleanText(
              rawData.reviewSourceUrl,
            ) ||
            null
          : null,

      rawSavedAt:
        rawData
          ? cleanText(
              rawData.savedAt,
            ) ||
            null
          : null,

      updatedAt:
        matched.updated_at,

      readOnly:
        true,
    });
  } catch (error) {
    console.error(
      "Review storage status error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "리뷰 저장 상태 조회 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}
