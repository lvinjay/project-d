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

type CleanupRequest = {
  category?: unknown;
  keepProductIds?: unknown;
  dryRun?: unknown;
};

type ProductRow = {
  id: string;
  category: string;
  product_name: string;
  review_analysis: unknown;
  review_raw_data: unknown;
  criterion_scores: unknown;
};

function text(
  value: unknown,
) {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function normalizeIds(
  value: unknown,
) {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(
          (item) =>
            text(
              item,
            ),
        )
        .filter(
          Boolean,
        ),
    ),
  );
}

function hasObjectValue(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return false;
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.length >
      0;
  }

  if (
    typeof value ===
    "object"
  ) {
    return Object.keys(
      value as Record<
        string,
        unknown
      >,
    ).length >
      0;
  }

  return true;
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (
        await request.json()
      ) as CleanupRequest;

    const category =
      text(
        body.category,
      );

    const keepProductIds =
      normalizeIds(
        body.keepProductIds,
      );

    const dryRun =
      body.dryRun !==
      false;

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message:
            "category가 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      keepProductIds.length !==
      30
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            `현재 풀 ID는 정확히 30개여야 합니다. 받은 값: ${keepProductIds.length}`,
        },
        {
          status: 400,
        },
      );
    }

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "products",
        )
        .select(
          "id, category, product_name, review_analysis, review_raw_data, criterion_scores",
        )
        .eq(
          "category",
          category,
        );

    if (error) {
      throw error;
    }

    const rows =
      (
        data ??
        []
      ) as ProductRow[];

    const keepSet =
      new Set(
        keepProductIds,
      );

    const currentPool =
      rows.filter(
        (row) =>
          keepSet.has(
            row.id,
          ),
      );

    const legacyProducts =
      rows.filter(
        (row) =>
          !keepSet.has(
            row.id,
          ),
      );

    const missingKeepIds =
      keepProductIds.filter(
        (id) =>
          !currentPool.some(
            (row) =>
              row.id === id,
          ),
      );

    const staleCurrentAnalysis =
      currentPool.filter(
        (row) =>
          hasObjectValue(
            row.review_analysis,
          ) ||
          hasObjectValue(
            row.review_raw_data,
          ) ||
          hasObjectValue(
            row.criterion_scores,
          ),
      );

    const archiveCategory =
      `${category}__legacy`;

    const audit = {
      category,

      archiveCategory,

      activeCategoryCount:
        rows.length,

      keepRequestedCount:
        keepProductIds.length,

      currentPoolCount:
        currentPool.length,

      legacyOutsidePoolCount:
        legacyProducts.length,

      missingKeepIdCount:
        missingKeepIds.length,

      staleCurrentAnalysisCount:
        staleCurrentAnalysis.length,

      legacyProducts:
        legacyProducts.map(
          (row) => ({
            id:
              row.id,

            productName:
              row.product_name,
          }),
        ),

      staleCurrentProducts:
        staleCurrentAnalysis.map(
          (row) => ({
            id:
              row.id,

            productName:
              row.product_name,
          }),
        ),
    };

    if (dryRun) {
      return NextResponse.json(
        {
          success: true,

          dryRun: true,

          ...audit,

          message:
            "DRY RUN 완료. DB 변경 없음.",
        },
      );
    }

    if (
      currentPool.length !==
        30 ||
      missingKeepIds.length !==
        0
    ) {
      return NextResponse.json(
        {
          success: false,

          dryRun: false,

          ...audit,

          message:
            "현재 30개 풀 검증이 일치하지 않아 DB 변경을 중단했습니다.",
        },
        {
          status: 409,
        },
      );
    }

    /*
      예전 13개를 삭제하지 않고 별도 카테고리로 보관한다.

      - 기존 분석/개발 증거 보존
      - 외래키 참조 위험 회피
      - 실제 고객용 category === "로봇청소기" 조회에서는 즉시 제외
    */
    if (
      legacyProducts.length >
      0
    ) {
      const {
        error:
          archiveError,
      } =
        await supabase
          .from(
            "products",
          )
          .update({
            category:
              archiveCategory,

            updated_at:
              new Date()
                .toISOString(),
          })
          .in(
            "id",
            legacyProducts.map(
              (row) =>
                row.id,
            ),
          );

      if (archiveError) {
        throw archiveError;
      }
    }

    /*
      이번 30개 중 과거 분석이 남아 있는 기존 상품은
      새 1,000-review 파이프라인으로 다시 분석해야 한다.

      product_detail_analysis는 이번 파일럿 import에서 갱신된
      제품 상세 근거이므로 유지한다.
    */
    const {
      error:
        resetError,
    } =
      await supabase
        .from(
          "products",
        )
        .update({
          review_analysis:
            null,

          review_raw_data:
            null,

          criterion_scores:
            {},

          updated_at:
            new Date()
              .toISOString(),
        })
        .in(
          "id",
          keepProductIds,
        );

    if (resetError) {
      throw resetError;
    }

    const {
      data:
        verifiedData,
      error:
        verifiedError,
    } =
      await supabase
        .from(
          "products",
        )
        .select(
          "id, category, product_name, review_analysis, review_raw_data, criterion_scores",
        )
        .eq(
          "category",
          category,
        );

    if (verifiedError) {
      throw verifiedError;
    }

    const verified =
      (
        verifiedData ??
        []
      ) as ProductRow[];

    const verifiedIds =
      new Set(
        verified.map(
          (row) =>
            row.id,
        ),
      );

    const invalidCurrent =
      verified.filter(
        (row) =>
          hasObjectValue(
            row.review_analysis,
          ) ||
          hasObjectValue(
            row.review_raw_data,
          ) ||
          hasObjectValue(
            row.criterion_scores,
          ),
      );

    const verificationPass =
      verified.length ===
        30 &&
      keepProductIds.every(
        (id) =>
          verifiedIds.has(
            id,
          ),
      ) &&
      invalidCurrent.length ===
        0;

    return NextResponse.json(
      {
        success:
          verificationPass,

        dryRun: false,

        ...audit,

        archivedLegacyCount:
          legacyProducts.length,

        resetCurrentCount:
          keepProductIds.length,

        verifiedActiveCount:
          verified.length,

        verifiedStaleAnalysisCount:
          invalidCurrent.length,

        verificationPass,

        message:
          verificationPass
            ? "현재 30개 풀 정리 완료. legacy는 보관 카테고리로 이동했고 과거 리뷰/점수 분석은 초기화했습니다."
            : "정리 후 검증값이 예상과 다릅니다.",
      },
      {
        status:
          verificationPass
            ? 200
            : 500,
      },
    );
  } catch (error) {
    console.error(
      "Project D pool cleanup error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "DB 풀 정리 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}
