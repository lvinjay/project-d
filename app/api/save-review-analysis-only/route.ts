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
  dbProductId?: string;
  originProductNo?:
    | string
    | number;
  productName?: string;
  expectedReviewAnalysis?: unknown;
  analysis?: unknown;
};

type SaveRequest = {
  category?: string;
  products?: SaveItem[];
  dryRun?: boolean;
};

function cleanText(
  value: unknown,
) {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
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

function stableStringify(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return (
      JSON.stringify(
        value,
      ) ?? "null"
    );
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(
        (item) =>
          stableStringify(
            item,
          ),
      )
      .join(",")}]`;
  }

  const row =
    value as Record<
      string,
      unknown
    >;

  return `{${Object
    .keys(row)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(
          key,
        )}:${stableStringify(
          row[key],
        )}`,
    )
    .join(",")}}`;
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
      (
        await request.json()
      ) as SaveRequest;

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

    const dryRun =
      body.dryRun ===
      true;

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
      products.length ===
      0
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

    const results: Array<
      Record<
        string,
        unknown
      >
    > = [];

    for (
      const item of
      products
    ) {
      const dbProductId =
        cleanText(
          item.dbProductId,
        );

      const productName =
        cleanText(
          item.productName,
        );

      const originProductNo =
        Number(
          item.originProductNo,
        );

      const analysis =
        asRecord(
          item.analysis,
        );

      const hasExpectedReviewAnalysis =
        Object.prototype
          .hasOwnProperty.call(
            item,
            "expectedReviewAnalysis",
          );

      const expectedReviewAnalysis =
        item.expectedReviewAnalysis ===
          null
          ? null
          : asRecord(
              item.expectedReviewAnalysis,
            );

      if (!dbProductId) {
        results.push({
          success: false,
          dbProductId,
          originProductNo:
            Number.isFinite(
              originProductNo,
            )
              ? originProductNo
              : null,
          productName,
          reason:
            "DB product ID가 없습니다.",
        });

        continue;
      }

      if (
        !Number.isSafeInteger(
          originProductNo,
        ) ||
        originProductNo <=
          0
      ) {
        results.push({
          success: false,
          dbProductId,
          originProductNo:
            null,
          productName,
          reason:
            "유효한 originProductNo가 없습니다.",
        });

        continue;
      }

      if (!analysis) {
        results.push({
          success: false,
          dbProductId,
          originProductNo,
          productName,
          reason:
            "저장할 분석 결과가 없습니다.",
        });

        continue;
      }

      if (
        !hasExpectedReviewAnalysis ||
        (
          item.expectedReviewAnalysis !==
            null &&
          !expectedReviewAnalysis
        )
      ) {
        results.push({
          success: false,
          dbProductId,
          originProductNo,
          productName,
          casConflict: true,
          reason:
            "분석 시작 시점의 expectedReviewAnalysis가 없어 안전한 CAS 저장을 수행할 수 없습니다.",
        });

        continue;
      }

      const {
        data: matched,
        error: matchError,
      } =
        await supabase
          .from(
            "products",
          )
          .select(
            "id, product_name, origin_product_no, review_analysis",
          )
          .eq(
            "category",
            category,
          )
          .eq(
            "id",
            dbProductId,
          )
          .eq(
            "origin_product_no",
            originProductNo,
          )
          .limit(
            1,
          )
          .maybeSingle();

      if (matchError) {
        throw matchError;
      }

      if (!matched) {
        results.push({
          success: false,
          dbProductId,
          originProductNo,
          productName,
          reason:
            "DB에서 category + dbProductId + originProductNo가 일치하는 제품을 찾지 못했습니다.",
        });

        continue;
      }

      const matchedProductName =
        cleanText(
          matched.product_name,
        );

      if (
        productName &&
        matchedProductName &&
        productName !==
          matchedProductName
      ) {
        results.push({
          success: false,
          dbProductId,
          originProductNo,
          productName,
          matchedProductName,
          reason:
            "상품명이 DB 제품명과 일치하지 않습니다.",
        });

        continue;
      }

      const currentReviewAnalysis =
        matched.review_analysis ??
        null;

      const casMatches =
        stableStringify(
          currentReviewAnalysis,
        ) ===
        stableStringify(
          expectedReviewAnalysis,
        );

      if (!casMatches) {
        results.push({
          success: false,
          dryRun,
          dbWrite: false,
          dbProductId:
            matched.id,
          originProductNo:
            Number(
              matched.origin_product_no,
            ),
          productName:
            matchedProductName,
          casConflict: true,
          reason:
            "리뷰 분석 시작 이후 DB review_analysis가 변경되어 stale 결과 저장을 거부했습니다.",
        });

        continue;
      }

      if (dryRun) {
        results.push({
          success: true,
          dryRun: true,
          dbWrite: false,
          dbProductId:
            matched.id,
          originProductNo:
            Number(
              matched.origin_product_no,
            ),
          productName:
            matchedProductName,
          reviewAnalysisWouldUpdate:
            true,
          reviewRawDataTouched:
            false,
          casVerified:
            true,
        });

        continue;
      }

      const updatedAt =
        new Date()
          .toISOString();

      const {
        data: rpcData,
        error: rpcError,
      } =
        await supabase.rpc(
          "project_d_save_review_analysis_cas_v1",
          {
            p_category:
              category,

            p_product_id:
              matched.id,

            p_origin_product_no:
              originProductNo,

            p_product_name:
              matchedProductName,

            p_expected_review_analysis:
              expectedReviewAnalysis,

            p_next_review_analysis:
              analysis,

            p_updated_at:
              updatedAt,
          },
        );

      if (rpcError) {
        const rpcMessage =
          cleanText(
            rpcError.message,
          );

        if (
          rpcMessage.includes(
            "PROJECT_D_REVIEW_CAS_CONFLICT",
          ) ||
          rpcMessage.includes(
            "PROJECT_D_REVIEW_IDENTITY_CONFLICT",
          )
        ) {
          results.push({
            success: false,
            dryRun: false,
            dbWrite: false,
            dbProductId:
              matched.id,
            originProductNo,
            productName:
              matchedProductName,
            casConflict: true,
            reason:
              "리뷰 분석 저장 직전에 DB 상태가 변경되어 stale 결과 저장을 거부했습니다.",
          });

          continue;
        }

        throw rpcError;
      }

      const rpcResult =
        asRecord(
          rpcData,
        );

      if (
        !rpcResult ||
        rpcResult.success !==
          true ||
        cleanText(
          rpcResult.dbProductId,
        ) !== matched.id
      ) {
        throw new Error(
          "리뷰 분석 CAS RPC 저장 결과를 검증하지 못했습니다.",
        );
      }

      results.push({
        success: true,
        dryRun: false,
        dbWrite: true,
        dbProductId:
          matched.id,
        originProductNo,
        productName:
          matchedProductName,
        reviewAnalysisUpdated:
          true,
        reviewRawDataTouched:
          false,
        casVerified:
          true,
        scoreCacheInvalidated:
          true,
        updatedAt,
      });
    }

    const successCount =
      results.filter(
        (item) =>
          item.success ===
          true,
      ).length;

    const failureCount =
      products.length -
      successCount;

    return NextResponse.json({
      success:
        successCount ===
        products.length,

      category,

      dryRun,

      requestedCount:
        products.length,

      successCount,

      failureCount,

      dbWriteCount:
        dryRun
          ? 0
          : results.filter(
              (item) =>
                item.dbWrite ===
                true,
            ).length,

      reviewRawDataTouched:
        false,

      results,
    });
  } catch (error) {
    console.error(
      "Save review analysis only error:",
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
