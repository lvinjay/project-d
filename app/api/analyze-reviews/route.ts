import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
};

type CriterionEvidence = {
  reviewEvidenceCount: number;
  summary: string;
};


type CriterionKey =
  | "cooling_capacity"
  | "noise"
  | "power_consumption"
  | "installation"
  | "special_features";

const CRITERION_KEYS: CriterionKey[] = [
  "cooling_capacity",
  "noise",
  "power_consumption",
  "installation",
  "special_features",
];

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as Record<string, unknown>;
}

function normalizeScore(value: unknown) {
  if (value === null) {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function normalizeAnalysis(raw: Record<string, unknown>) {
  const rawScores =
    raw.criterionScores &&
    typeof raw.criterionScores === "object" &&
    !Array.isArray(raw.criterionScores)
      ? (raw.criterionScores as Record<string, unknown>)
      : {};

  const rawReasons =
    raw.criterionReasons &&
    typeof raw.criterionReasons === "object" &&
    !Array.isArray(raw.criterionReasons)
      ? (raw.criterionReasons as Record<string, unknown>)
      : {};

  const criterionScores = Object.fromEntries(
    CRITERION_KEYS.map((key) => [
      key,
      normalizeScore(rawScores[key]),
    ]),
  );

  const criterionReasons = Object.fromEntries(
    CRITERION_KEYS.map((key) => [
      key,
      typeof rawReasons[key] === "string"
        ? rawReasons[key].trim()
        : "리뷰에서 판단할 근거가 충분하지 않습니다.",
    ]),
  );

  return {
    ...raw,
    criterionScores,
    criterionReasons,
  };
}

function normalizeCriterionEvidence(
  raw: unknown,
  criterionKeys: string[],
  reviewCount: number,
) {
  const row =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const result: Record<string, CriterionEvidence> = {};

  for (const key of criterionKeys) {
    const item =
      row[key] && typeof row[key] === "object" && !Array.isArray(row[key])
        ? (row[key] as Record<string, unknown>)
        : {};

    const rawCount = Number(item.reviewEvidenceCount);
    const reviewEvidenceCount =
      Number.isFinite(rawCount) && rawCount >= 0
        ? Math.min(reviewCount, Math.round(rawCount))
        : 0;

    const summary =
      typeof item.summary === "string"
        ? item.summary.trim()
        : "";

    result[key] = {
      reviewEvidenceCount,
      summary:
        summary ||
        (reviewEvidenceCount > 0
          ? "이 구매기준과 관련된 실제 리뷰가 반복 확인되었습니다."
          : "이 구매기준을 직접 판단할 리뷰 근거가 충분하지 않습니다."),
    };
  }

  return result;
}

function normalizeCollectionStats(
  value: unknown,
  fallbackTotal: number,
): ReviewCollectionStats {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const safeCount = (raw: unknown) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0
      ? Math.floor(parsed)
      : 0;
  };

  const ranking = safeCount(row.ranking);
  const latest = safeCount(row.latest);
  const lowScore = safeCount(row.lowScore);
  const reportedTotal = safeCount(row.total);

  return {
    total: reportedTotal > 0 ? reportedTotal : fallbackTotal,
    ranking,
    latest,
    lowScore,
  };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message: "OPENAI_API_KEY가 설정되지 않았습니다.",
        },
        { status: 500 },
      );
    }

    const body =
      (await request.json()) as ReviewAnalysisRequest;

    const productName =
      typeof body.productName === "string"
        ? body.productName.trim()
        : "";

    const category =
      typeof body.category === "string"
        ? body.category.trim()
        : "카테고리 미지정";

    const reviews = Array.isArray(body.reviews)
      ? body.reviews
          .filter(
            (review): review is string =>
              typeof review === "string" &&
              review.trim().length > 0,
          )
          .map((review) => review.trim())
          .slice(0, 200) // 현재 수집 상한과 동일하게 최대 200개 리뷰 분석
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
          message: "제품명이 필요합니다.",
        },
        { status: 400 },
      );
    }

    if (reviews.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "분석할 리뷰가 없습니다.",
        },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("category_profiles")
      .select("criteria")
      .eq("category", category)
      .maybeSingle();

    if (profileError) throw profileError;

    const dynamicCriteria = Array.isArray(profile?.criteria)
      ? (profile.criteria as DynamicCriterion[])
          .map((criterion) => ({
            key:
              typeof criterion.key === "string"
                ? criterion.key.trim()
                : "",
            label:
              typeof criterion.label === "string"
                ? criterion.label.trim()
                : "",
            shortDescription:
              typeof criterion.shortDescription === "string"
                ? criterion.shortDescription.trim()
                : "",
          }))
          .filter((criterion) => criterion.key && criterion.label)
          .slice(0, 5)
      : [];

    const dynamicCriterionKeys = dynamicCriteria.map(
      (criterion) => criterion.key,
    );

    const client = new OpenAI({ apiKey });

    const prompt = `
당신은 실제 구매 리뷰를 근거로 제품을 평가하는 분석가입니다.

카테고리: ${category}
제품명: ${productName}
리뷰 수: ${reviews.length}

현재 이 카테고리의 핵심 구매기준:
${JSON.stringify(dynamicCriteria, null, 2)}

분석 대상 리뷰:
${reviews
  .map((review, index) => `${index + 1}. ${review}`)
  .join("\n")}

원칙:
- 제공된 리뷰에 없는 사실이나 제품 사양을 만들지 마세요.
- 배송, 포장, 판매자 응대만 언급한 리뷰는 제품 평가에서 제외하세요.
- 반복적으로 언급된 의견을 우선하세요.
- positivePoints와 negativePoints에는 최소 2개 이상의 서로 다른 리뷰에서 반복 확인된 주제만 넣으세요.
- 각 point의 evidenceCount는 해당 주제를 실제로 지지하거나 직접 언급한 "서로 다른 리뷰 행의 개수"입니다.
- evidenceCount를 임의로 0으로 두지 마세요. 출력하는 장점/단점은 반드시 리뷰 번호를 다시 확인해 실제 관련 리뷰 수를 세어 2 이상 ${reviews.length} 이하의 정수로 작성하세요.
- 한 리뷰가 여러 주제를 직접 언급하면 각 주제의 evidenceCount에 각각 포함될 수 있습니다.
- evidenceCount는 전체 리뷰 수나 추정 비율이 아니라, 제공된 리뷰 목록에서 그 의견의 근거가 되는 리뷰 개수입니다.
- criterionEvidence는 위 "핵심 구매기준" 각각에 대해 실제로 관련 내용을 직접 언급한 서로 다른 리뷰 행의 개수를 세는 항목입니다.
- criterionEvidence.reviewEvidenceCount는 추정치나 비율이 아니라 제공된 리뷰 번호를 다시 확인해 센 실제 관련 리뷰 행 개수로 작성하세요.
- 하나의 리뷰가 여러 구매기준을 직접 언급하면 각 기준에 각각 포함될 수 있습니다.
- 해당 구매기준을 직접 판단할 리뷰가 없다면 reviewEvidenceCount는 0으로 작성하세요.
- criterionEvidence.summary에는 그 기준에서 리뷰들이 반복적으로 말한 핵심 근거를 한 문장으로 요약하세요.
- 긍정과 부정 의견이 섞이면 양쪽을 모두 반영하세요.
- 각 criterionScores는 0~100점 또는 null입니다.
- 점수가 높을수록 해당 기준에서 구매자 만족도가 높다는 뜻입니다.
- 리뷰만으로 판단할 수 없는 기준은 반드시 null로 작성하세요.
- 특히 BTU, W, dB 같은 객관적 사양 수치를 리뷰에 근거 없이 추정하지 마세요.
- cooling_capacity는 리뷰에서 체감 냉방 성능에 대한 구체적 언급이 있을 때만 평가하세요. BTU 수치를 추정하는 항목이 아닙니다.
- power_consumption은 전력 사용, 캠핑장 전력 제한, 파워뱅크 사용 등에 대한 실제 리뷰 근거가 있을 때만 평가하세요. W 수치를 추정하지 마세요.
- noise는 실제 체감 소음에 대한 리뷰를 평가하되 dB 수치를 추정하지 마세요.
- installation은 설치 및 배기 구성의 실제 편의성에 대한 리뷰를 평가하세요.
- special_features는 듀얼덕트, 인버터, 제습, 자동배수, 리모컨, 배터리 대응 등 차별 기능이 실제 리뷰에서 반복적으로 긍정 평가될 때만 점수화하세요.
- criterionReasons에는 점수 또는 null의 근거를 한 문장으로 작성하세요.
- 반드시 아래 JSON만 출력하고 마크다운 코드 블록을 사용하지 마세요.

{
  "productName": "제품명",
  "reviewCount": ${reviews.length},
  "summary": "전체 리뷰를 종합한 2~3문장 요약",
  "positivePoints": [
    {
      "topic": "장점 항목",
      "summary": "반복적으로 언급된 내용",
      "evidenceCount": "실제 관련 리뷰 개수(2 이상 정수)"
    }
  ],
  "negativePoints": [
    {
      "topic": "단점 항목",
      "summary": "반복적으로 언급된 내용",
      "evidenceCount": "실제 관련 리뷰 개수(2 이상 정수)"
    }
  ],
  "cautions": ["구매 전에 확인해야 할 사항"],
  "bestFor": ["이 제품이 잘 맞는 사용자"],
  "notFor": ["이 제품이 잘 맞지 않는 사용자"],
  "confidenceScore": 0,
  "criterionEvidence": {
    "현재 핵심 구매기준의 실제 key": {
      "reviewEvidenceCount": 0,
      "summary": "이 기준에 대해 실제 리뷰에서 반복 확인된 핵심 근거"
    }
  },
  "criterionScores": {
    "cooling_capacity": null,
    "noise": null,
    "power_consumption": null,
    "installation": null,
    "special_features": null
  },
  "criterionReasons": {
    "cooling_capacity": "냉방 성능 점수의 리뷰 근거 또는 근거 부족 설명",
    "noise": "소음 점수의 리뷰 근거 또는 근거 부족 설명",
    "power_consumption": "전력 사용성 점수의 리뷰 근거 또는 근거 부족 설명",
    "installation": "설치·배기 방식 점수의 리뷰 근거 또는 근거 부족 설명",
    "special_features": "핵심 특장점 점수의 리뷰 근거 또는 근거 부족 설명"
  }
}

confidenceScore는 리뷰 개수, 구체성, 의견 일관성을 고려해 0~100 정수로 작성하세요.
`;

    const response = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      throw new Error(
        "AI가 분석 결과를 반환하지 않았습니다.",
      );
    }

    try {
      const parsed = extractJson(outputText);
      const analysis = {
        ...normalizeAnalysis(parsed),
        criterionEvidence: normalizeCriterionEvidence(
          parsed.criterionEvidence,
          dynamicCriterionKeys,
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
            "AI 분석 결과를 구조화하는 데 실패했습니다.",
          rawResult: outputText,
        },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Review analysis API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "리뷰 분석 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
