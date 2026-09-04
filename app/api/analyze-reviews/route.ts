import {
  createHash,
} from "node:crypto";

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
  executionMode?: string;
  batchIndex?: number;
  batchResults?: unknown;
  inputFingerprint?: string;
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
  evidenceReviewNumbers: number[];
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

function normalizeEvidenceReviewNumbers(
  raw: unknown,
  minimumReviewNumber: number,
  maximumReviewNumber: number,
) {
  if (
    !Array.isArray(
      raw,
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .map(
          (value) =>
            Number(value),
        )
        .filter(
          (value) =>
            Number.isSafeInteger(
              value,
            ) &&
            value >=
              minimumReviewNumber &&
            value <=
              maximumReviewNumber,
        ),
    ),
  ).sort(
    (left, right) =>
      left - right,
  );
}

function minimumCriterionEvidence(
  reviewCount: number,
) {
  return Math.max(
    3,
    Math.ceil(
      reviewCount *
        0.01,
    ),
  );
}

function collectCriterionEvidenceNumbers(
  batchResults:
    BatchAnalysisResult[],
  criterionKeys:
    string[],
) {
  const result:
    Record<
      string,
      number[]
    > = {};

  for (
    const key of
    criterionKeys
  ) {
    const numbers =
      new Set<number>();

    for (
      const batch of
      batchResults
    ) {
      const analysisRow =
        batch.analysis &&
        typeof batch.analysis ===
          "object" &&
        !Array.isArray(
          batch.analysis,
        )
          ? batch.analysis
          : {};

      const criterionEvidenceRow =
        analysisRow
          .criterionEvidence &&
        typeof analysisRow
          .criterionEvidence ===
          "object" &&
        !Array.isArray(
          analysisRow
            .criterionEvidence,
        )
          ? (
              analysisRow
                .criterionEvidence as
                Record<
                  string,
                  unknown
                >
            )
          : {};

      const item =
        criterionEvidenceRow[
          key
        ] &&
        typeof criterionEvidenceRow[
          key
        ] ===
          "object" &&
        !Array.isArray(
          criterionEvidenceRow[
            key
          ],
        )
          ? (
              criterionEvidenceRow[
                key
              ] as
                Record<
                  string,
                  unknown
                >
            )
          : {};

      const batchNumbers =
        normalizeEvidenceReviewNumbers(
          item
            .evidenceReviewNumbers,
          batch.reviewStart,
          batch.reviewEnd,
        );

      for (
        const reviewNumber of
        batchNumbers
      ) {
        numbers.add(
          reviewNumber,
        );
      }
    }

    result[key] =
      Array.from(
        numbers,
      ).sort(
        (left, right) =>
          left - right,
      );
  }

  return result;
}

function normalizeCriterionEvidence(
  raw: unknown,
  criterionKeys: string[],
  reviewCount: number,
  evidenceNumbersByCriterion?:
    Record<
      string,
      number[]
    >,
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

    const modelEvidenceNumbers =
      normalizeEvidenceReviewNumbers(
        item
          .evidenceReviewNumbers,
        1,
        reviewCount,
      );

    const batchEvidenceNumbers =
      evidenceNumbersByCriterion &&
      Array.isArray(
        evidenceNumbersByCriterion[
          key
        ],
      )
        ? normalizeEvidenceReviewNumbers(
            evidenceNumbersByCriterion[
              key
            ],
            1,
            reviewCount,
          )
        : [];

    const evidenceReviewNumbers =
      batchEvidenceNumbers.length >
      0
        ? batchEvidenceNumbers
        : modelEvidenceNumbers;

    const reviewEvidenceCount =
      evidenceReviewNumbers.length;

    const summary =
      typeof item.summary ===
        "string"
        ? item.summary.trim()
        : "";

    result[key] = {
      reviewEvidenceCount,

      evidenceReviewNumbers,

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

function normalizePointEvidence(
  raw: unknown,
  reviewCount: number,
) {
  if (
    !Array.isArray(
      raw,
    )
  ) {
    return [];
  }

  return raw
    .filter(
      (item) =>
        item &&
        typeof item ===
          "object" &&
        !Array.isArray(
          item,
        ),
    )
    .map(
      (item) => {
        const row =
          item as
            Record<
              string,
              unknown
            >;

        const evidenceReviewNumbers =
          normalizeEvidenceReviewNumbers(
            row
              .evidenceReviewNumbers,
            1,
            reviewCount,
          );

        return {
          ...row,

          evidenceReviewNumbers,

          evidenceCount:
            evidenceReviewNumbers
              .length,
        };
      },
    );
}

function auditReviewQuality(
  raw: unknown,
  reviewCount: number,
) {
  const row =
    raw &&
    typeof raw ===
      "object" &&
    !Array.isArray(
      raw,
    )
      ? (
          raw as
            Record<
              string,
              unknown
            >
        )
      : {};

  const safeCount = (
    value: unknown,
  ) => {
    const parsed =
      Number(value);

    return (
      Number.isSafeInteger(
        parsed,
      ) &&
      parsed >=
        0
    )
      ? parsed
      : 0;
  };

  const highInformationReviews =
    safeCount(
      row.highInformationReviews,
    );

  const lowInformationReviews =
    safeCount(
      row.lowInformationReviews,
    );

  const promotionalStyleReviews =
    safeCount(
      row.promotionalStyleReviews,
    );

  const classifiedReviewCount =
    highInformationReviews +
    lowInformationReviews +
    promotionalStyleReviews;

  return {
    reviewQuality: {
      highInformationReviews,
      lowInformationReviews,
      promotionalStyleReviews,
    },

    reviewQualityAudit: {
      expectedReviewCount:
        reviewCount,

      classifiedReviewCount,

      mutuallyExclusive:
        true,

      countValid:
        classifiedReviewCount ===
        reviewCount,
    },
  };
}

function applyCriterionEvidenceFloor(
  analysis:
    Record<
      string,
      unknown
    >,
  criterionEvidence:
    Record<
      string,
      CriterionEvidence
    >,
  criterionKeys:
    string[],
  reviewCount: number,
) {
  const minimumEvidence =
    minimumCriterionEvidence(
      reviewCount,
    );

  const scoreRow =
    analysis.criterionScores &&
    typeof analysis.criterionScores ===
      "object" &&
    !Array.isArray(
      analysis.criterionScores,
    )
      ? (
          analysis
            .criterionScores as
            Record<
              string,
              number | null
            >
        )
      : {};

  const reasonRow =
    analysis.criterionReasons &&
    typeof analysis.criterionReasons ===
      "object" &&
    !Array.isArray(
      analysis.criterionReasons,
    )
      ? (
          analysis
            .criterionReasons as
            Record<
              string,
              string
            >
        )
      : {};

  const criterionScores = {
    ...scoreRow,
  };

  const criterionReasons = {
    ...reasonRow,
  };

  for (
    const key of
    criterionKeys
  ) {
    const evidenceCount =
      criterionEvidence[
        key
      ]?.reviewEvidenceCount ??
      0;

    if (
      evidenceCount <
      minimumEvidence
    ) {
      criterionScores[key] =
        null;

      criterionReasons[key] =
        `직접 근거 ${evidenceCount}건으로 최소 기준 ${minimumEvidence}건에 미달하여 점수를 산정하지 않습니다.`;
    }
  }

  return {
    ...analysis,

    criterionScores,

    criterionReasons,

    criterionScoring: {
      minimumEvidenceForScore:
        minimumEvidence,

      minimumEvidenceRule:
        "max(3, ceil(reviewCount * 0.01))",
    },
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

type ReviewAnalysisExecutionMode =
  | "full"
  | "batch"
  | "aggregate";

function normalizeExecutionMode(
  value: unknown,
):
  | ReviewAnalysisExecutionMode
  | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "full";
  }

  if (
    value === "full" ||
    value === "batch" ||
    value === "aggregate"
  ) {
    return value;
  }

  return null;
}

function createAnalysisInputFingerprint(
  category: string,
  productName: string,
  dbProductId: string | null,
  originProductNo: number | null,
  reviews: string[],
  collectionStats:
    ReviewCollectionStats,
  dynamicCriteria:
    DynamicCriterion[],
) {
  const payload = {
    version:
      "strict-direct-evidence-resumable-v1",
    category,
    productName,
    dbProductId,
    originProductNo,
    reviews,
    collectionStats,
    dynamicCriteria,
    reviewBatchSize:
      REVIEW_BATCH_SIZE,
    reviewTextLimit:
      REVIEW_TEXT_LIMIT,
  };

  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        payload,
      ),
      "utf8",
    )
    .digest(
      "hex",
    );
}

function normalizeResumeBatchResults(
  raw: unknown,
  batches: string[][],
) {
  if (
    !Array.isArray(
      raw,
    )
  ) {
    throw new Error(
      "aggregate 모드에는 batchResults 배열이 필요합니다.",
    );
  }

  if (
    raw.length !==
    batches.length
  ) {
    throw new Error(
      `batchResults 개수 ${raw.length}건이 현재 batch 수 ${batches.length}건과 다릅니다.`,
    );
  }

  const rows =
    raw.map(
      (value) =>
        asRecord(
          value,
        ),
    );

  if (
    rows.some(
      (row) =>
        !row,
    )
  ) {
    throw new Error(
      "batchResults에 올바르지 않은 항목이 있습니다.",
    );
  }

  const result:
    BatchAnalysisResult[] =
    [];

  for (
    let index = 0;
    index <
    batches.length;
    index++
  ) {
    const expectedBatchIndex =
      index + 1;

    const expectedReviewStart =
      index *
        REVIEW_BATCH_SIZE +
      1;

    const expectedReviewCount =
      batches[index].length;

    const expectedReviewEnd =
      expectedReviewStart +
      expectedReviewCount -
      1;

    const row =
      rows.find(
        (candidate) =>
          Number(
            candidate
              ?.batchIndex,
          ) ===
          expectedBatchIndex,
      );

    if (!row) {
      throw new Error(
        `batchResults에서 batch ${expectedBatchIndex}를 찾지 못했습니다.`,
      );
    }

    const analysis =
      asRecord(
        row.analysis,
      );

    if (!analysis) {
      throw new Error(
        `batch ${expectedBatchIndex}의 analysis가 올바르지 않습니다.`,
      );
    }

    if (
      Number(
        row.reviewStart,
      ) !==
        expectedReviewStart ||
      Number(
        row.reviewEnd,
      ) !==
        expectedReviewEnd ||
      Number(
        row.reviewCount,
      ) !==
        expectedReviewCount
    ) {
      throw new Error(
        `batch ${expectedBatchIndex}의 리뷰 범위 또는 개수가 현재 저장 리뷰와 일치하지 않습니다.`,
      );
    }

    result.push({
      batchIndex:
        expectedBatchIndex,
      reviewStart:
        expectedReviewStart,
      reviewEnd:
        expectedReviewEnd,
      reviewCount:
        expectedReviewCount,
      analysis,
    });
  }

  return result;
}

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
9. positivePoints와 negativePoints의 evidenceReviewNumbers에는 해당 항목을 직접 뒷받침한 현재 batch 리뷰 번호만 넣으세요.
10. evidenceCount는 evidenceReviewNumbers의 중복 제거 후 개수와 정확히 같아야 합니다.
11. criterionEvidence의 evidenceReviewNumbers에도 해당 구매기준을 직접 뒷받침한 현재 batch 리뷰 번호만 넣으세요.
12. criterionEvidence.reviewEvidenceCount는 evidenceReviewNumbers의 중복 제거 후 개수와 정확히 같아야 합니다.
13. criterionEvidence에는 해당 구매기준을 직접 설명하는 리뷰만 넣으세요. "청소를 잘한다", "꼼꼼하다", "성능이 좋다", "만족한다"처럼 범용적인 칭찬은 특정 세부 구매기준의 직접 근거로 세지 마세요.
14. 복합 구매기준은 리뷰가 실제로 언급한 하위 항목만 근거로 인정하세요. 예를 들어 흡입력·머리카락 처리 기준에서 단순한 전체 청소 만족이나 구석 청소 평가는 흡입력/머리카락 처리의 직접 근거가 아닙니다.
15. 앱, 장애물 회피, 머리카락 처리, 카펫 흡입, 스테이션 기능처럼 구체적인 항목은 리뷰에 그 기능 또는 결과가 명시되어 있을 때만 evidenceReviewNumbers에 포함하세요.
16. criterionScores는 직접 근거의 범위만 평가하세요. 구매기준의 중요한 하위 항목에 직접 근거가 없으면 그 한계를 이유에 명시하고, 근거가 지나치게 부분적이면 null을 사용하세요.
17. cautions, bestFor, notFor도 실제 리뷰에 직접 근거가 있는 범위만 표현하고 일반적인 제품 상식이나 사양을 추가로 추론하지 마세요.
18. 한 리뷰의 좁은 불만을 더 넓은 기능 문제로 확장하지 마세요. 예: 자동 맵 확장 불만을 근거 없이 세밀한 맵 편집 문제까지 확대하지 마세요.
19. reviewQuality의 highInformationReviews, lowInformationReviews, promotionalStyleReviews는 서로 겹치지 않는 분류입니다. 현재 batch의 모든 리뷰를 정확히 한 분류에만 넣고 세 값의 합이 현재 batch 리뷰 수와 정확히 같아야 합니다.
20. 근거가 부족한 criterionScores는 null로 두세요.
21. 입력된 구매기준 key만 사용하세요.
22. JSON만 출력하세요. 마크다운은 사용하지 마세요.

반드시 아래 JSON 구조로 반환하세요.

{
  "batchIndex": ${batchIndex + 1},
  "reviewCount": ${reviews.length},
  "summary": "이 batch에서 반복적으로 확인된 핵심 사용경험 요약",
  "positivePoints": [
    {
      "topic": "장점 항목",
      "summary": "실제 반복 장점",
      "evidenceReviewNumbers": [${reviewStart}],
      "evidenceCount": 0
    }
  ],
  "negativePoints": [
    {
      "topic": "단점 항목",
      "summary": "실제 반복 단점",
      "evidenceReviewNumbers": [${reviewStart}],
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
      "evidenceReviewNumbers": [${reviewStart}],
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

최종 구매기준 점수의 최소 직접 근거 수:
${minimumCriterionEvidence(
  totalReviewCount,
)}

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
3. positivePoints와 negativePoints의 evidenceReviewNumbers는 batch 결과에 실제로 존재하는 리뷰 번호만 합치고 중복을 제거하세요.
4. evidenceCount는 evidenceReviewNumbers의 중복 제거 후 개수와 정확히 같아야 합니다.
5. 같은 의미의 주제가 여러 batch에 표현만 다르게 등장하면 하나로 합치세요.
6. criterionEvidence.evidenceReviewNumbers도 batch별 해당 구매기준의 실제 리뷰 번호만 합치고 중복을 제거하세요.
7. criterionEvidence.reviewEvidenceCount는 evidenceReviewNumbers의 중복 제거 후 개수와 정확히 같아야 합니다.
8. criterionScores는 전체 batch의 긍정/부정 근거와 반복성을 종합한 0~100 점수입니다.
9. 해당 구매기준의 직접 근거가 ${minimumCriterionEvidence(
  totalReviewCount,
)}건보다 적으면 criterionScores는 반드시 null로 두세요.
10. 배송, 포장, 판매자 응대는 제품 평가에 약하게 반영하세요.
11. criterionEvidence에는 해당 구매기준을 직접 설명하는 리뷰 번호만 유지하세요. "청소를 잘한다", "꼼꼼하다", "성능이 좋다", "만족한다" 같은 범용 평가는 특정 세부 구매기준의 직접 근거로 승격하지 마세요.
12. 복합 구매기준은 리뷰가 실제로 언급한 하위 항목만 근거로 인정하세요. 중요한 하위 항목에 직접 근거가 없으면 criterionReasons에 그 공백을 명확히 적고 점수를 과대평가하지 마세요.
13. 특히 흡입력·머리카락 처리 같은 구체 기준은 먼지 흡입 결과, 머리카락/반려털 처리, 카펫 흡입 등 직접 언급이 없으면 일반적인 "청소가 잘 된다" 리뷰만으로 점수를 만들지 마세요.
14. 앱, 장애물 회피, 스테이션, 맵핑 등도 해당 기능의 직접 사용경험이 있는 리뷰만 근거로 세세요.
15. cautions, bestFor, notFor도 batch 근거에 직접 연결되는 범위만 표현하세요. 일반적인 제품 상식이나 사양을 새로 추론하지 마세요.
16. 한 리뷰의 좁은 불만을 더 넓은 기능 문제로 확장하지 마세요.
17. reviewQuality의 highInformationReviews, lowInformationReviews, promotionalStyleReviews는 서로 겹치지 않는 분류입니다. 전체 리뷰를 정확히 한 분류에만 포함하고 세 값의 합이 ${totalReviewCount}와 정확히 같아야 합니다.
18. confidenceScore는 총 리뷰 수, 정보량, batch 간 반복성, 긍정/부정 근거 균형을 반영한 0~100 정수입니다.
19. 제공되지 않은 사실을 추가하거나 추측하지 마세요.
20. 입력된 구매기준 key만 사용하세요.
21. JSON만 출력하세요. 마크다운은 사용하지 마세요.

반드시 아래 JSON 구조로 반환하세요.

{
  "productName": "${productName}",
  "reviewCount": ${totalReviewCount},
  "summary": "전체 batch를 종합한 2~3문장 요약",
  "positivePoints": [
    {
      "topic": "장점 항목",
      "summary": "여러 batch에서 반복 확인된 실제 장점",
      "evidenceReviewNumbers": [1],
      "evidenceCount": 0
    }
  ],
  "negativePoints": [
    {
      "topic": "단점 항목",
      "summary": "여러 batch에서 반복 확인된 실제 단점",
      "evidenceReviewNumbers": [1],
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
      "evidenceReviewNumbers": [1],
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

    const executionMode =
      normalizeExecutionMode(
        body.executionMode,
      );

    if (!executionMode) {
      return NextResponse.json(
        {
          success: false,
          message:
            "executionMode은 full, batch, aggregate 중 하나여야 합니다.",
        },
        {
          status: 400,
        },
      );
    }

    const inputFingerprint =
      createAnalysisInputFingerprint(
        category,
        productName,
        storedDbProductId,
        storedOriginProductNo,
        reviews,
        collectionStats,
        dynamicCriteria,
      );

    const requestedInputFingerprint =
      cleanText(
        body.inputFingerprint,
      );

    if (
      requestedInputFingerprint &&
      requestedInputFingerprint !==
        inputFingerprint
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "분석 입력 fingerprint가 현재 저장 리뷰/구매기준과 일치하지 않습니다. 새 dryRun으로 체크포인트를 다시 시작하세요.",
          inputFingerprint,
        },
        {
          status: 409,
        },
      );
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,

        dryRun:
          true,

        paidApiCalls:
          0,

        executionMode,

        inputFingerprint,

        requestedBatchIndex:
          executionMode ===
            "batch"
            ? Number(
                body.batchIndex,
              )
            : null,

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
          executionMode ===
            "full"
            ? batches.length +
              1
            : 1,

        minimumCriterionEvidence:
          minimumCriterionEvidence(
            reviews.length,
          ),
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

    if (
      executionMode !==
        "full" &&
      !requestedInputFingerprint
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "batch/aggregate 모드의 유료 실행에는 dryRun에서 받은 inputFingerprint가 필요합니다.",
          inputFingerprint,
        },
        {
          status: 400,
        },
      );
    }

    if (
      executionMode ===
      "batch"
    ) {
      const requestedBatchIndex =
        Number(
          body.batchIndex,
        );

      if (
        !Number.isSafeInteger(
          requestedBatchIndex,
        ) ||
        requestedBatchIndex <
          1 ||
        requestedBatchIndex >
          batches.length
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              `batchIndex는 1~${batches.length} 사이 정수여야 합니다.`,
          },
          {
            status: 400,
          },
        );
      }

      const index =
        requestedBatchIndex -
        1;

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
          `${productName} batch ${requestedBatchIndex}/${batches.length}`,
        );

      const batchResult:
        BatchAnalysisResult = {
          batchIndex:
            requestedBatchIndex,
          reviewStart,
          reviewEnd,
          reviewCount:
            batch.length,
          analysis:
            parsed,
        };

      return NextResponse.json({
        success: true,
        executionMode:
          "batch",
        paidApiCalls:
          1,
        inputSource:
          useStoredReviews
            ? "stored-db"
            : "request-body",
        inputFingerprint,
        dbProductId:
          storedDbProductId,
        originProductNo:
          storedOriginProductNo,
        productName,
        analyzedReviewCount:
          reviews.length,
        batchCount:
          batches.length,
        batchResult,
      });
    }

    let batchResults:
      BatchAnalysisResult[];

    if (
      executionMode ===
      "aggregate"
    ) {
      try {
        batchResults =
          normalizeResumeBatchResults(
            body.batchResults,
            batches,
          );
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "batchResults 검증에 실패했습니다.",
          },
          {
            status: 400,
          },
        );
      }
    } else {
      batchResults =
        [];

      /*
        기존 full 모드는 호환성을 위해 유지한다.
        resumable 실행은 batch 모드로 한 batch씩 호출하고,
        각 응답을 외부 체크포인트에 즉시 보존한 뒤
        aggregate 모드로 마지막 1회 통합한다.
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

    const evidenceNumbersByCriterion =
      collectCriterionEvidenceNumbers(
        batchResults,
        criterionKeys,
      );

    const criterionEvidence =
      normalizeCriterionEvidence(
        aggregateParsed
          .criterionEvidence,
        criterionKeys,
        reviews.length,
        evidenceNumbersByCriterion,
      );

    const evidenceFlooredAnalysis =
      applyCriterionEvidenceFloor(
        normalized,
        criterionEvidence,
        criterionKeys,
        reviews.length,
      );

    const {
      reviewQuality,
      reviewQualityAudit,
    } =
      auditReviewQuality(
        aggregateParsed
          .reviewQuality,
        reviews.length,
      );

    const analysis = {
      ...evidenceFlooredAnalysis,

      productName,

      reviewCount:
        reviews.length,

      positivePoints:
        normalizePointEvidence(
          aggregateParsed
            .positivePoints,
          reviews.length,
        ),

      negativePoints:
        normalizePointEvidence(
          aggregateParsed
            .negativePoints,
          reviews.length,
        ),

      reviewQuality,

      reviewQualityAudit,

      criterionEvidence,

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

      executionMode,

      paidApiCalls:
        executionMode ===
          "aggregate"
          ? 1
          : batches.length +
            1,

      inputFingerprint,

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
