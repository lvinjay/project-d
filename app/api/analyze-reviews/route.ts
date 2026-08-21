import OpenAI from "openai";
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

export async function POST(
  request: Request,
) {
  try {
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

    const body =
      (
        await request.json()
      ) as ReviewAnalysisRequest;

    const productName =
      typeof body.productName ===
        "string"
        ? body.productName.trim()
        : "";

    const category =
      typeof body.category ===
        "string"
        ? body.category.trim()
        : "";

    const reviews =
      Array.isArray(
        body.reviews,
      )
        ? body.reviews
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
              (review) =>
                review.trim(),
            )
            .slice(
              0,
              200,
            )
        : [];

    const collectionStats =
      normalizeCollectionStats(
        body.collectionStats,
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
      reviews.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "분석할 리뷰가 없습니다.",
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

    const client =
      new OpenAI({
        apiKey,
      });

    const prompt = `
당신은 Project D의 실제 구매 리뷰 분석 엔진입니다.

카테고리:
${category}

상품명:
${productName}

분석 대상 리뷰 수:
${reviews.length}

현재 이 카테고리의 핵심 구매기준:
${JSON.stringify(
  dynamicCriteria,
  null,
  2,
)}

분석 대상 실제 리뷰:
${reviews
  .map(
    (
      review,
      index,
    ) =>
      `${index + 1}. ${review}`,
  )
  .join("\n")}

분석 원칙:

1. 반드시 제공된 리뷰 내용만 근거로 판단하세요.
2. 리뷰에 없는 제품 사양이나 성능을 추측하지 마세요.
3. 배송, 포장, 단순 구매 만족처럼 제품 성능과 직접 관계없는 내용은 약하게 반영하세요.
4. "좋아요", "추천합니다", "대만족"처럼 구체성이 부족한 리뷰는 낮은 정보량 리뷰로 취급하세요.
5. 실제 사용기간, 집 환경, 청소 결과, 오류, 소음, 앱 문제, 관리 불편처럼 구체적인 사용경험이 담긴 리뷰는 더 신뢰하세요.
6. 한두 개 리뷰에서만 나온 문제를 전체 제품의 확정적 결함으로 표현하지 마세요.
7. 서로 다른 리뷰에서 반복되는 장점과 단점을 우선하세요.
8. 광고성 또는 이벤트성 문체로 보이는 리뷰는 약하게 반영하세요.
9. positivePoints와 negativePoints에는 가능하면 서로 다른 리뷰에서 반복 확인된 주제를 넣으세요.
10. evidenceCount는 해당 주제를 실제로 직접 언급하거나 뒷받침한 리뷰 개수입니다.
11. evidenceCount를 임의로 크게 만들지 마세요.
12. criterionEvidence는 각 구매기준과 직접 관련된 실제 리뷰 개수를 기록하세요.
13. 해당 구매기준에 대한 리뷰 근거가 부족하면 점수는 null로 두세요.
14. 점수는 0~100입니다.
15. 점수가 높을수록 해당 구매기준에서 구매 만족도가 높다는 뜻입니다.
16. 제품의 판매페이지 주장만으로 점수를 만들지 마세요.
17. 입력된 구매기준 key만 사용하세요.
18. JSON만 출력하세요. 마크다운은 사용하지 마세요.

점수 기준:
- 90~100: 반복적인 강한 긍정 근거가 있고 뚜렷한 단점이 거의 없음
- 75~89: 전반적으로 강점이 분명하고 일부 단점이 있음
- 60~74: 장단점이 혼재하거나 평균 이상
- 40~59: 단점이나 불확실성이 비교적 큼
- 0~39: 반복적인 심각한 불만 근거가 있음
- 근거 부족: null

반드시 아래 JSON 구조로 반환하세요.

{
  "productName": "${productName}",
  "reviewCount": ${reviews.length},
  "summary": "전체 리뷰를 종합한 2~3문장 요약",
  "positivePoints": [
    {
      "topic": "장점 항목",
      "summary": "반복적으로 확인된 실제 장점",
      "evidenceCount": 2
    }
  ],
  "negativePoints": [
    {
      "topic": "단점 항목",
      "summary": "반복적으로 확인된 실제 단점",
      "evidenceCount": 2
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
      "summary": "해당 구매기준에 대한 리뷰 근거 요약"
    }
  },
  "criterionScores": {
    "${criterionKeys[0]}": null
  },
  "criterionReasons": {
    "${criterionKeys[0]}": "점수 또는 null의 이유"
  }
}

중요:
criterionEvidence,
criterionScores,
criterionReasons에는
반드시 아래 key를 전부 포함하세요.

${criterionKeys.join(
  ", ",
)}

confidenceScore는
리뷰 수, 리뷰 구체성, 반복성,
긍정/부정 근거의 균형을 고려한
0~100 정수입니다.
`;

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
        "AI가 리뷰 분석 결과를 반환하지 않았습니다.",
      );
    }

    try {
      const parsed =
        extractJson(
          outputText,
        );

      const normalized =
        normalizeAnalysis(
          parsed,
          criterionKeys,
        );

      const analysis = {
        ...normalized,

        criterionEvidence:
          normalizeCriterionEvidence(
            parsed.criterionEvidence,
            criterionKeys,
            reviews.length,
          ),

        collectionStats,
      };

      return NextResponse.json({
        success: true,
        analysis,
      });
    } catch {
      console.error(
        "Review analysis JSON parsing failed:",
        outputText,
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "AI 리뷰 분석 결과를 JSON으로 해석하지 못했습니다.",
          rawResult:
            outputText,
        },
        {
          status: 502,
        },
      );
    }
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
