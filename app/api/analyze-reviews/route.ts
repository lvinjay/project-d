import OpenAI from "openai";
import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  supabase,
} from "../../../lib/supabase";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type ReviewCollectionStats = {
  total: number;
  ranking: number;
  latest: number;
  lowScore: number;
};

type ReviewAnalysisRequest = {
  productName?: string;
  category?: string;
  reviews?: string[];
  collectionStats?: unknown;
  originProductNo?: string | number;
  useStoredReviews?: boolean;
  dryRun?: boolean;
};

type DynamicCriterion = {
  key?: string;
  label?: string;
  shortDescription?: string;
  helpText?: string;
  sourceType?: string;
};

type CriterionEvidence = {
  reviewEvidenceCount: number;
  summary: string;
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

function getServiceSupabase() {
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

function extractJson(
  text: string,
) {
  const cleaned =
    text
      .replace(
        /^```json\s*/i,
        "",
      )
      .replace(
        /^```\s*/i,
        "",
      )
      .replace(
        /\s*```$/i,
        "",
      )
      .trim();

  return JSON.parse(
    cleaned,
  ) as Record<
    string,
    unknown
  >;
}

function normalizeScore(
  value: unknown,
) {
  if (value === null) {
    return null;
  }

  const numberValue =
    Number(value);

  if (
    !Number.isFinite(
      numberValue,
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        numberValue,
      ),
    ),
  );
}

function normalizeCollectionStats(
  value: unknown,
  fallbackTotal: number,
): ReviewCollectionStats {
  const row =
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
      ? (
          value as Record<
            string,
            unknown
          >
        )
      : {};

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

function normalizeCriterionEvidence(
  raw: unknown,
  criterionKeys: string[],
  reviewCount: number,
) {
  const row =
    raw &&
    typeof raw ===
      "object" &&
    !Array.isArray(raw)
      ? (
          raw as Record<
            string,
            unknown
          >
        )
      : {};

  const result:
    Record<
      string,
      CriterionEvidence
    > = {};

  for (
    const key of
    criterionKeys
  ) {
    const item =
      row[key] &&
      typeof row[key] ===
        "object" &&
      !Array.isArray(
        row[key],
      )
        ? (
            row[key] as Record<
              string,
              unknown
            >
          )
        : {};

    const rawCount =
      Number(
        item.reviewEvidenceCount,
      );

    const reviewEvidenceCount =
      Number.isFinite(
        rawCount,
      ) &&
      rawCount >= 0
        ? Math.min(
            reviewCount,
            Math.round(
              rawCount,
            ),
          )
        : 0;

    const summary =
      typeof item.summary ===
        "string"
        ? item.summary.trim()
        : "";

    result[key] = {
      reviewEvidenceCount,

      summary:
        summary ||
        (
          reviewEvidenceCount >
          0
            ? "관련 구매기준에 대한 실제 사용 리뷰 근거가 확인되었습니다."
            : "현재 수집된 리뷰만으로는 이 구매기준을 직접 판단할 근거가 부족합니다."
        ),
    };
  }

  return result;
}

function normalizeAnalysis(
  raw: Record<
    string,
    unknown
  >,
  criterionKeys:
    string[],
) {
  const rawScores =
    raw.criterionScores &&
    typeof raw.criterionScores ===
      "object" &&
    !Array.isArray(
      raw.criterionScores,
    )
      ? (
          raw.criterionScores as Record<
            string,
            unknown
          >
        )
      : {};

  const rawReasons =
    raw.criterionReasons &&
    typeof raw.criterionReasons ===
      "object" &&
    !Array.isArray(
      raw.criterionReasons,
    )
      ? (
          raw.criterionReasons as Record<
            string,
            unknown
          >
        )
      : {};

  const criterionScores:
    Record<
      string,
      number | null
    > = {};

  const criterionReasons:
    Record<
      string,
      string
    > = {};

  for (
    const key of
    criterionKeys
  ) {
    criterionScores[key] =
      normalizeScore(
        rawScores[key],
      );

    criterionReasons[key] =
      typeof rawReasons[key] ===
        "string" &&
      rawReasons[
        key
      ].trim()
        ? (
            rawReasons[
              key
            ] as string
          ).trim()
        : "현재 수집된 리뷰만으로는 충분한 평가 근거가 없습니다.";
  }

  return {
    ...raw,
    criterionScores,
    criterionReasons,
  };
}

const MAX_REVIEW_COUNT = 1000;
const REVIEW_BATCH_SIZE = 200;
const REVIEW_TEXT_LIMIT = 800;

type BatchAnalysisResult = {
  batchIndex: number;
  reviewStart: number;
  reviewEnd: number;
  reviewCount: number;
  analysis: Record<
    string,
    unknown
  >;
};

function cleanReview(
  review: string,
) {
  return review
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .slice(
      0,
      REVIEW_TEXT_LIMIT,
    );
}

function normalizeReviewCorpus(
  value: unknown,
) {
  return Array.isArray(
    value,
  )
    ? Array.from(
        new Set(
          value
            .filter(
              (
                review,
              ): review is string =>
                typeof review ===
                  "string" &&
                review.trim()
                  .length > 0,
            )
            .map(
              cleanReview,
            )
            .filter(
              Boolean,
            ),
        ),
      ).slice(
        0,
        MAX_REVIEW_COUNT,
      )
    : [];
}

function chunkReviews(
  reviews: string[],
) {
  const batches:
    string[][] = [];

  for (
    let start = 0;
    start <
    reviews.length;
    start +=
    REVIEW_BATCH_SIZE
  ) {
    batches.push(
      reviews.slice(
        start,
        start +
          REVIEW_BATCH_SIZE,
      ),
    );
  }

  return batches;
}

async function requestJsonAnalysis(
  client: OpenAI,
  prompt: string,
  label: string,
) {
  const response =
    await client.responses.create(
      {
        model:
          "gpt-5",
        input:
          prompt,
      },
    );

  const outputText =
    response.output_text?.trim();

  if (!outputText) {
    throw new Error(
      `${label}: AI가 분석 결과를 반환하지 않았습니다.`,
    );
  }

  try {
    return extractJson(
      outputText,
    );
  } catch {
    console.error(
      `${label} JSON parsing failed:`,
      outputText,
    );

    throw new Error(
      `${label}: AI 분석 결과를 JSON으로 해석하지 못했습니다.`,
    );
  }
}

function buildBatchPrompt(
  category: string,
  productName: string,
  dynamicCriteria:
    DynamicCriterion[],
  criterionKeys:
    string[],
  reviews: string[],
  batchIndex: number,
  totalBatches: number,
  reviewStart: number,
  reviewEnd: number,
) {
  return `
당신은 Project D의 실제 구매 리뷰 분석 엔진입니다.

이번 작업은 최대 1,000개 리뷰를 한 번에 모델에 넣지 않고
여러 batch로 나눠 정확하게 읽는 1차 분석입니다.

카테고리:
${category}

상품명:
${productName}

전체 batch:
${totalBatches}

현재 batch:
${batchIndex + 1}/${totalBatches}

현재 batch 리뷰 범위:
${reviewStart}~${reviewEnd}

현재 batch 실제 리뷰 수:
${reviews.length}

현재 이 카테고리의 핵심 구매기준:
${JSON.stringify(
  dynamicCriteria,
  null,
  2,
)}

현재 batch 실제 리뷰:
${reviews
  .map(
    (
      review,
      index,
    ) =>
      `${reviewStart + index}. ${review}`,
  )
  .join("\n")}

분석 원칙:

1. 반드시 현재 batch에 제공된 실제 리뷰만 근거로 판단하세요.
2. 리뷰에 없는 제품 사양이나 성능을 추측하지 마세요.
3. 배송, 포장, 판매자 응대처럼 제품 성능과 직접 관계없는 내용은 약하게 반영하세요.
4. "좋아요", "추천합니다", "대만족"처럼 구체성이 부족한 리뷰는 낮은 정보량 리뷰로 취급하세요.
5. 실제 사용기간, 사용환경, 성능 결과, 오류, 소음, 앱 문제, 관리 불편처럼 구체적인 사용경험을 더 신뢰하세요.
6. 한두 개 리뷰에서만 나온 문제를 전체 제품의 확정적 결함으로 표현하지 마세요.
7. 반복되는 장점과 단점을 우선하세요.
8. 광고성 또는 이벤트성 문체로 보이는 리뷰는 약하게 반영하세요.
9. evidenceCount는 이 batch 안에서 해당 주제를 실제로 뒷받침한 리뷰 개수입니다.
10. criterionEvidence의 reviewEvidenceCount도 이 batch 안의 실제 개수만 기록하세요.
11. 근거가 부족한 criterionScores는 null로 두세요.
12. 입력된 구매기준 key만 사용하세요.
13. JSON만 출력하세요. 마크다운은 사용하지 마세요.

반드시 아래 JSON 구조로 반환하세요.

{
  "batchIndex": ${batchIndex + 1},
  "reviewCount": ${reviews.length},
  "summary": "이 batch에서 반복적으로 확인된 핵심 사용경험 요약",
  "positivePoints": [
    {
      "topic": "장점 항목",
      "summary": "실제 반복 장점",
      "evidenceCount": 0
    }
  ],
  "negativePoints": [
    {
      "topic": "단점 항목",
      "summary": "실제 반복 단점",
      "evidenceCount": 0
    }
  ],
  "cautions": [
    "이 batch에서 확인된 구매 전 주의사항"
  ],
  "bestFor": [
    "이 batch 근거로 잘 맞는 사용자"
  ],
  "notFor": [
    "이 batch 근거로 잘 맞지 않는 사용자"
  ],
  "reviewQuality": {
    "highInformationReviews": 0,
    "lowInformationReviews": 0,
    "promotionalStyleReviews": 0
  },
  "criterionEvidence": {
    "${criterionKeys[0]}": {
      "reviewEvidenceCount": 0,
      "summary": "이 batch의 해당 구매기준 근거 요약"
    }
  },
  "criterionScores": {
    "${criterionKeys[0]}": null
  },
  "criterionReasons": {
    "${criterionKeys[0]}": "점수 또는 null의 이유"
  }
}

criterionEvidence,
criterionScores,
criterionReasons에는 아래 key를 전부 포함하세요.

${criterionKeys.join(
  ", ",
)}
`;
}

function buildAggregatePrompt(
  category: string,
  productName: string,
  dynamicCriteria:
    DynamicCriterion[],
  criterionKeys:
    string[],
  totalReviewCount: number,
  batchResults:
    BatchAnalysisResult[],
  collectionStats:
    ReviewCollectionStats,
) {
  const compactBatchResults =
    batchResults.map(
      (batch) => ({
        batchIndex:
          batch.batchIndex,
        reviewStart:
          batch.reviewStart,
        reviewEnd:
          batch.reviewEnd,
        reviewCount:
          batch.reviewCount,
        analysis:
          batch.analysis,
      }),
    );

  return `
당신은 Project D의 리뷰 batch 통합 엔진입니다.

아래 내용은 같은 제품의 실제 리뷰 ${totalReviewCount}개를
최대 ${REVIEW_BATCH_SIZE}개씩 나눠 각각 읽은 1차 분석 결과입니다.

원문 리뷰를 다시 추측하지 말고,
오직 제공된 batch 분석 결과를 통합해서
제품 전체의 재사용 가능한 리뷰 분석을 만드세요.

카테고리:
${category}

상품명:
${productName}

총 실제 리뷰 수:
${totalReviewCount}

수집 통계:
${JSON.stringify(
  collectionStats,
  null,
  2,
)}

카테고리 핵심 구매기준:
${JSON.stringify(
  dynamicCriteria,
  null,
  2,
)}

batch 분석 결과:
${JSON.stringify(
  compactBatchResults,
  null,
  2,
)}

통합 원칙:

1. 서로 다른 batch에서 반복되는 장점과 단점을 가장 강하게 반영하세요.
2. 한 batch에서만 소수로 나온 문제를 제품 전체의 확정적 결함처럼 표현하지 마세요.
3. evidenceCount는 batch별 evidenceCount를 근거로 합산하되 총 리뷰 수 ${totalReviewCount}를 넘기지 마세요.
4. 같은 의미의 주제가 여러 batch에 표현만 다르게 등장하면 하나로 합치세요.
5. criterionEvidence.reviewEvidenceCount도 batch별 실제 근거 수를 합산해서 판단하세요.
6. criterionScores는 전체 batch의 긍정/부정 근거와 반복성을 종합한 0~100 점수입니다.
7. 구매기준에 대한 전체 근거가 부족하면 점수는 null로 두세요.
8. 배송, 포장, 판매자 응대는 제품 평가에 약하게 반영하세요.
9. confidenceScore는 총 리뷰 수, 정보량, batch 간 반복성, 긍정/부정 근거 균형을 반영한 0~100 정수입니다.
10. 제공되지 않은 사실을 추가하거나 추측하지 마세요.
11. 입력된 구매기준 key만 사용하세요.
12. JSON만 출력하세요. 마크다운은 사용하지 마세요.

반드시 아래 JSON 구조로 반환하세요.

{
  "productName": "${productName}",
  "reviewCount": ${totalReviewCount},
  "summary": "전체 batch를 종합한 2~3문장 요약",
  "positivePoints": [
    {
      "topic": "장점 항목",
      "summary": "여러 batch에서 반복 확인된 실제 장점",
      "evidenceCount": 0
    }
  ],
  "negativePoints": [
    {
      "topic": "단점 항목",
      "summary": "여러 batch에서 반복 확인된 실제 단점",
      "evidenceCount": 0
    }
  ],
  "cautions": [
    "구매 전에 확인할 사항"
  ],
  "bestFor": [
    "이 제품이 잘 맞는 사용자"
  ],
  "notFor": [
    "이 제품이 잘 맞지 않는 사용자"
  ],
  "confidenceScore": 0,
  "reviewQuality": {
    "highInformationReviews": 0,
    "lowInformationReviews": 0,
    "promotionalStyleReviews": 0
  },
  "criterionEvidence": {
    "${criterionKeys[0]}": {
      "reviewEvidenceCount": 0,
      "summary": "전체 batch의 해당 구매기준 근거 요약"
    }
  },
  "criterionScores": {
    "${criterionKeys[0]}": null
  },
  "criterionReasons": {
    "${criterionKeys[0]}": "점수 또는 null의 이유"
  }
}

criterionEvidence,
criterionScores,
criterionReasons에는 아래 key를 전부 포함하세요.

${criterionKeys.join(
  ", ",
)}
`;
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (
        await request.json()
      ) as ReviewAnalysisRequest;

    const requestedProductName =
      typeof body.productName ===
        "string"
        ? body.productName.trim()
        : "";

    const category =
      typeof body.category ===
        "string"
        ? body.category.trim()
        : "";

    const useStoredReviews =
      body.useStoredReviews ===
      true;

    const dryRun =
      body.dryRun ===
      true;

    const originProductNo =
      Number(
        body.originProductNo,
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

    let productName =
      requestedProductName;

    let reviewInput:
      unknown =
      body.reviews;

    let collectionStatsInput:
      unknown =
      body.collectionStats;

    let storedDbProductId:
      string | null =
      null;

    let storedOriginProductNo:
      number | null =
      null;

    let storedReviewRawDataPresent =
      false;

    let storedReviewCount =
      0;

    if (useStoredReviews) {
      if (
        !hasOriginProductNo &&
        !productName
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "저장 리뷰를 사용할 때는 originProductNo 또는 상품명이 필요합니다.",
          },
          {
            status: 400,
          },
        );
      }

      const serviceSupabase =
        getServiceSupabase();

      let productQuery =
        serviceSupabase
          .from(
            "products",
          )
          .select(
            "id, product_name, origin_product_no, review_raw_data",
          )
          .eq(
            "category",
            category,
          );

      if (hasOriginProductNo) {
        productQuery =
          productQuery.eq(
            "origin_product_no",
            originProductNo,
          );
      } else {
        productQuery =
          productQuery.eq(
            "product_name",
            productName,
          );
      }

      const {
        data: matchedProduct,
        error:
          matchedProductError,
      } =
        await productQuery
          .limit(
            1,
          )
          .maybeSingle();

      if (matchedProductError) {
        throw matchedProductError;
      }

      if (!matchedProduct) {
        return NextResponse.json(
          {
            success: false,
            message:
              "DB에서 저장 리뷰 대상 제품을 찾지 못했습니다.",
          },
          {
            status: 404,
          },
        );
      }

      const reviewRawData =
        asRecord(
          matchedProduct
            .review_raw_data,
        );

      const storedReviews =
        reviewRawData &&
        Array.isArray(
          reviewRawData.reviews,
        )
          ? reviewRawData.reviews
          : [];

      productName =
        cleanText(
          matchedProduct
            .product_name,
        ) ||
        productName;

      reviewInput =
        storedReviews;

      if (
        body.collectionStats ===
          undefined ||
        body.collectionStats ===
          null
      ) {
        collectionStatsInput =
          reviewRawData
            ?.collectionStats ??
          null;
      }

      storedDbProductId =
        cleanText(
          matchedProduct.id,
        ) ||
        null;

      const matchedOriginProductNo =
        Number(
          matchedProduct
            .origin_product_no,
        );

      storedOriginProductNo =
        Number.isSafeInteger(
          matchedOriginProductNo,
        ) &&
        matchedOriginProductNo >
          0
          ? matchedOriginProductNo
          : null;

      storedReviewRawDataPresent =
        reviewRawData !==
        null;

      storedReviewCount =
        storedReviews.length;
    }

    const reviews =
      normalizeReviewCorpus(
        reviewInput,
      );

    const collectionStats =
      normalizeCollectionStats(
        collectionStatsInput,
        reviews.length,
      );

    if (!productName) {
      return NextResponse.json(
        {
          success: false,
          message:
            "상품명이 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      reviews.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            useStoredReviews
              ? "DB에 분석할 저장 리뷰가 없습니다."
              : "분석할 리뷰가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data: profile,
      error:
        profileError,
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
      Array.isArray(
        profile?.criteria,
      )
        ? (
            profile.criteria as DynamicCriterion[]
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

    if (
      dynamicCriteria.length ===
      0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "이 카테고리의 구매기준이 아직 생성되지 않았습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const criterionKeys =
      dynamicCriteria.map(
        (
          criterion,
        ) =>
          criterion.key,
      );

    const batches =
      chunkReviews(
        reviews,
      );

    if (dryRun) {
      return NextResponse.json({
        success: true,

        dryRun:
          true,

        paidApiCalls:
          0,

        inputSource:
          useStoredReviews
            ? "stored-db"
            : "request-body",

        category,

        productName,

        dbProductId:
          storedDbProductId,

        originProductNo:
          storedOriginProductNo,

        storedReviewRawDataPresent,

        storedReviewCount,

        analyzedReviewCount:
          reviews.length,

        collectionStats,

        criterionCount:
          dynamicCriteria.length,

        criterionKeys,

        batchSize:
          REVIEW_BATCH_SIZE,

        batchCount:
          batches.length,

        reviewTextLimit:
          REVIEW_TEXT_LIMIT,

        estimatedOpenAiCalls:
          batches.length +
          1,
      });
    }

    const apiKey =
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            "OPENAI_API_KEY가 설정되지 않았습니다.",
        },
        {
          status: 500,
        },
      );
    }

    const client =
      new OpenAI({
        apiKey,
      });

    const batchResults:
      BatchAnalysisResult[] =
      [];

    /*
      비용/정확도 균형:
      - 최대 1,000개를 200개씩 최대 5 batch로 나눈다.
      - API 폭주를 막기 위해 제품 내부 batch는 순차 실행한다.
      - 각 리뷰 텍스트는 분석용으로 최대 800자까지만 사용한다.
      - 원본 최대 1,000개 리뷰는 별도로 DB에 저장된다.
    */
    for (
      let index = 0;
      index <
      batches.length;
      index++
    ) {
      const batch =
        batches[index];

      const reviewStart =
        index *
          REVIEW_BATCH_SIZE +
        1;

      const reviewEnd =
        reviewStart +
        batch.length -
        1;

      const prompt =
        buildBatchPrompt(
          category,
          productName,
          dynamicCriteria,
          criterionKeys,
          batch,
          index,
          batches.length,
          reviewStart,
          reviewEnd,
        );

      const parsed =
        await requestJsonAnalysis(
          client,
          prompt,
          `${productName} batch ${index + 1}/${batches.length}`,
        );

      batchResults.push({
        batchIndex:
          index + 1,
        reviewStart,
        reviewEnd,
        reviewCount:
          batch.length,
        analysis:
          parsed,
      });
    }

    const aggregatePrompt =
      buildAggregatePrompt(
        category,
        productName,
        dynamicCriteria,
        criterionKeys,
        reviews.length,
        batchResults,
        collectionStats,
      );

    const aggregateParsed =
      await requestJsonAnalysis(
        client,
        aggregatePrompt,
        `${productName} 최종 batch 통합`,
      );

    const normalized =
      normalizeAnalysis(
        aggregateParsed,
        criterionKeys,
      );

    const analysis = {
      ...normalized,

      productName,

      reviewCount:
        reviews.length,

      criterionEvidence:
        normalizeCriterionEvidence(
          aggregateParsed
            .criterionEvidence,
          criterionKeys,
          reviews.length,
        ),

      collectionStats,

      batchAnalysis: {
        strategy:
          "sequential-200-review-batches",

        totalReviews:
          reviews.length,

        batchSize:
          REVIEW_BATCH_SIZE,

        batchCount:
          batches.length,

        reviewTextLimit:
          REVIEW_TEXT_LIMIT,
      },
    };

    return NextResponse.json({
      success: true,

      inputSource:
        useStoredReviews
          ? "stored-db"
          : "request-body",

      dbProductId:
        storedDbProductId,

      originProductNo:
        storedOriginProductNo,

      analysis,

      batchCount:
        batches.length,

      analyzedReviewCount:
        reviews.length,
    });
  } catch (error) {
    console.error(
      "Review analysis API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "리뷰 분석 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}
