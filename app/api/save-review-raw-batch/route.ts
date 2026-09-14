import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  auditProductionReviewNumbering,
  createProductionPipelineFingerprint,
} from "../../../lib/project-d-review-production-pipeline";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const REVIEW_BATCH_SIZE =
  50;

const MAX_REVIEW_COUNT =
  1000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReviewCollectionStats = {
  total: number;
  ranking: number;
  latest: number;
  lowScore: number;
};

type DynamicCriterion = {
  key?: string;
  label?: string;
  shortDescription?: string;
  helpText?: string;
  sourceType?: string;
};

type SaveItem = {
  dbProductId?: string;
  originProductNo?: string | number;
  productName?: string;
  reviews?: unknown[];
  collectionStats?: unknown;
  sourceMode?: string;
  reviewSourceUrl?: string;
  collectionMetadata?: unknown;
  inputFingerprint?: string;
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

function asRecord(
  value: unknown,
) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeCollectionStats(
  value: unknown,
  fallbackTotal: number,
): ReviewCollectionStats {
  const row =
    asRecord(value) ??
    {};

  const safeCount = (
    raw: unknown,
  ) => {
    const parsed =
      Number(raw);

    return (
      Number.isFinite(
        parsed,
      ) &&
      parsed >= 0
    )
      ? Math.floor(
          parsed,
        )
      : 0;
  };

  const ranking =
    safeCount(
      row.ranking,
    );

  const latest =
    safeCount(
      row.latest,
    );

  const lowScore =
    safeCount(
      row.lowScore,
    );

  const reportedTotal =
    safeCount(
      row.total,
    );

  return {
    total:
      reportedTotal > 0
        ? reportedTotal
        : fallbackTotal,

    ranking,
    latest,
    lowScore,
  };
}

function normalizeCriteria(
  value: unknown,
) {
  return Array.isArray(value)
    ? (
        value as DynamicCriterion[]
      )
        .map(
          (
            criterion,
          ) => ({
            key:
              typeof criterion.key ===
                "string"
                ? criterion.key.trim()
                : "",

            label:
              typeof criterion.label ===
                "string"
                ? criterion.label.trim()
                : "",

            shortDescription:
              typeof criterion.shortDescription ===
                "string"
                ? criterion.shortDescription.trim()
                : "",

            helpText:
              typeof criterion.helpText ===
                "string"
                ? criterion.helpText.trim()
                : "",

            sourceType:
              typeof criterion.sourceType ===
                "string"
                ? criterion.sourceType.trim()
                : "",
          }),
        )
        .filter(
          (
            criterion,
          ) =>
            criterion.key &&
            criterion.label,
        )
        .slice(
          0,
          8,
        )
    : [];
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

    const {
      data: profile,
      error: profileError,
    } =
      await supabase
        .from(
          "category_profiles",
        )
        .select(
          "criteria",
        )
        .eq(
          "category",
          category,
        )
        .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    const dynamicCriteria =
      normalizeCriteria(
        profile?.criteria,
      );

    const uniqueCriterionKeys =
      new Set(
        dynamicCriteria.map(
          criterion =>
            criterion.key,
        ),
      );

    if (
      dynamicCriteria.length !== 5 ||
      uniqueCriterionKeys.size !== 5
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "원시 리뷰 저장에는 현재 카테고리의 정확한 5개 구매기준이 필요합니다.",
        },
        {
          status: 409,
        },
      );
    }

    const results = [];

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

      const requestedInputFingerprint =
        cleanText(
          item.inputFingerprint,
        );

      if (
        !UUID_PATTERN.test(
          dbProductId,
        ) ||
        !productName ||
        !Number.isSafeInteger(
          originProductNo,
        ) ||
        originProductNo <= 0 ||
        !/^[a-f0-9]{64}$/.test(
          requestedInputFingerprint,
        )
      ) {
        results.push({
          success: false,
          dbProductId,
          originProductNo,
          productName,
          reason:
            "UUID·원상품 번호·상품명·분석 fingerprint가 모두 필요합니다.",
        });

        continue;
      }

      const rawReviews:
        unknown[] =
        Array.isArray(
          item.reviews,
        )
          ? item.reviews
          : [];

      const numberingAudit =
        auditProductionReviewNumbering(
          rawReviews,
        );

      if (
        !numberingAudit.compatible ||
        rawReviews.length === 0 ||
        rawReviews.length >
          MAX_REVIEW_COUNT
      ) {
        results.push({
          success: false,
          dbProductId,
          originProductNo,
          productName,
          reason:
            "분석 당시와 동일한 물리적 리뷰 corpus를 저장할 수 없습니다.",
          numberingAudit,
        });

        continue;
      }

      const collectionStats =
        normalizeCollectionStats(
          item.collectionStats,
          rawReviews.length,
        );

      const analysisDbProductId =
        `request-body:${originProductNo}`;

      const inputFingerprint =
        createProductionPipelineFingerprint({
          category,
          productName,
          dbProductId:
            analysisDbProductId,
          originProductNo,
          rawReviews,
          collectionStats,
          criteria:
            dynamicCriteria,
          reviewBatchSize:
            REVIEW_BATCH_SIZE,
        });

      if (
        inputFingerprint !==
        requestedInputFingerprint
      ) {
        results.push({
          success: false,
          dbProductId,
          originProductNo,
          productName,
          inputFingerprint,
          reason:
            "저장하려는 raw corpus가 승인·분석된 input fingerprint와 일치하지 않습니다.",
        });

        continue;
      }

      const {
        data: matches,
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
            "id",
            dbProductId,
          )
          .eq(
            "category",
            category,
          )
          .eq(
            "origin_product_no",
            originProductNo,
          )
          .eq(
            "product_name",
            productName,
          )
          .limit(
            2,
          );

      if (matchError) {
        throw matchError;
      }

      if (
        !Array.isArray(
          matches,
        ) ||
        matches.length !==
          1
      ) {
        results.push({
          success: false,
          dbProductId,
          originProductNo,
          productName,
          reason:
            "UUID·카테고리·원상품 번호·상품명이 정확히 일치하는 단일 DB 제품을 찾지 못했습니다.",
        });

        continue;
      }

      const matched =
        matches[0];

      const savedAnalysis =
        asRecord(
          matched.review_analysis,
        );

      const savedAnalysisFingerprint =
        cleanText(
          savedAnalysis
            ?.inputFingerprint,
        );

      const savedAnalysisReviewCount =
        Number(
          savedAnalysis
            ?.reviewCount,
        );

      if (
        savedAnalysisFingerprint !==
          inputFingerprint ||
        !Number.isSafeInteger(
          savedAnalysisReviewCount,
        ) ||
        savedAnalysisReviewCount !==
          rawReviews.length
      ) {
        results.push({
          success: false,
          dbProductId,
          originProductNo,
          productName,
          reason:
            "DB의 저장된 리뷰 분석과 raw corpus fingerprint/count가 일치하지 않습니다.",
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
        data: updated,
        error: updateError,
      } =
        await supabase
          .from(
            "products",
          )
          .update({
            review_raw_data: {
              schemaVersion:
                2,

              category,

              dbProductId,

              originProductNo,

              productName,

              inputFingerprint,

              pipelineVersion:
                cleanText(
                  savedAnalysis
                    ?.pipelineVersion,
                ) ||
                null,

              reviews:
                rawReviews,

              collectionStats,

              collectionMetadata:
                item.collectionMetadata ??
                null,

              sourceMode:
                sourceMode ||
                null,

              reviewSourceUrl:
                reviewSourceUrl ||
                null,

              receivedReviewCount:
                rawReviews.length,

              savedReviewCount:
                rawReviews.length,

              corpusTransform:
                "none",

              exactCorpusPersisted:
                true,

              savedAt,
            },

            updated_at:
              savedAt,
          })
          .eq(
            "id",
            dbProductId,
          )
          .eq(
            "category",
            category,
          )
          .eq(
            "origin_product_no",
            originProductNo,
          )
          .eq(
            "product_name",
            productName,
          )
          .select(
            "id",
          );

      if (updateError) {
        throw updateError;
      }

      if (
        !Array.isArray(
          updated,
        ) ||
        updated.length !==
          1 ||
        cleanText(
          updated[0]?.id,
        ) !== dbProductId
      ) {
        throw new Error(
          "원시 리뷰 저장 중 제품 identity가 변경되어 쓰기를 확정하지 못했습니다.",
        );
      }

      results.push({
        success: true,
        dbProductId,
        originProductNo,
        productName,
        inputFingerprint,
        receivedReviewCount:
          rawReviews.length,
        savedReviewCount:
          rawReviews.length,
        exactCorpusPersisted:
          true,
        rawCorpusPersisted:
          true,
        reviewAnalysisPreserved:
          true,
      });
    }

    const successCount =
      results.filter(
        (
          item,
        ) =>
          item.success,
      ).length;

    const allSucceeded =
      successCount ===
      products.length;

    return NextResponse.json({
      success:
        allSucceeded,

      category,

      requestedCount:
        products.length,

      successCount,

      failureCount:
        products.length -
        successCount,

      reviewAnalysisPreserved:
        true,

      rawCorpusPersisted:
        allSucceeded,

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
