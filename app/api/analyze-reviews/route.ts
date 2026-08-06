import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewAnalysisRequest = {
  productName?: string;
  category?: string;
  reviews?: string[];
};

type CriterionKey =
  | "cooling_capacity"
  | "noise"
  | "power_consumption"
  | "portability"
  | "installation"
  | "drainage"
  | "power_compatibility"
  | "durability_service"
  | "value";

const CRITERION_KEYS: CriterionKey[] = [
  "cooling_capacity",
  "noise",
  "power_consumption",
  "portability",
  "installation",
  "drainage",
  "power_compatibility",
  "durability_service",
  "value",
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
          .slice(0, 200)
      : [];

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

    const client = new OpenAI({ apiKey });

    const prompt = `
당신은 실제 구매 리뷰를 근거로 제품을 평가하는 분석가입니다.

카테고리: ${category}
제품명: ${productName}
리뷰 수: ${reviews.length}

분석 대상 리뷰:
${reviews
  .map((review, index) => `${index + 1}. ${review}`)
  .join("\n")}

원칙:
- 제공된 리뷰에 없는 사실이나 제품 사양을 만들지 마세요.
- 배송, 포장, 판매자 응대만 언급한 리뷰는 제품 평가에서 제외하세요.
- 반복적으로 언급된 의견을 우선하세요.
- 긍정과 부정 의견이 섞이면 양쪽을 모두 반영하세요.
- 각 criterionScores는 0~100점 또는 null입니다.
- 점수가 높을수록 해당 기준에서 구매자 만족도가 높다는 뜻입니다.
- 리뷰만으로 판단할 수 없는 기준은 반드시 null로 작성하세요.
- 특히 BTU, 소비전력, 무게, 가격 같은 객관적 사양을 리뷰에 근거 없이 추정하지 마세요.
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
      "evidenceCount": 0
    }
  ],
  "negativePoints": [
    {
      "topic": "단점 항목",
      "summary": "반복적으로 언급된 내용",
      "evidenceCount": 0
    }
  ],
  "cautions": ["구매 전에 확인해야 할 사항"],
  "bestFor": ["이 제품이 잘 맞는 사용자"],
  "notFor": ["이 제품이 잘 맞지 않는 사용자"],
  "confidenceScore": 0,
  "criterionScores": {
    "cooling_capacity": null,
    "noise": null,
    "power_consumption": null,
    "portability": null,
    "installation": null,
    "drainage": null,
    "power_compatibility": null,
    "durability_service": null,
    "value": null
  },
  "criterionReasons": {
    "cooling_capacity": "냉방 성능 점수의 리뷰 근거 또는 근거 부족 설명",
    "noise": "소음 점수의 리뷰 근거 또는 근거 부족 설명",
    "power_consumption": "소비전력 점수의 리뷰 근거 또는 근거 부족 설명",
    "portability": "무게와 휴대성 점수의 리뷰 근거 또는 근거 부족 설명",
    "installation": "설치 편의성 점수의 리뷰 근거 또는 근거 부족 설명",
    "drainage": "배수 관리 점수의 리뷰 근거 또는 근거 부족 설명",
    "power_compatibility": "전원 활용성 점수의 리뷰 근거 또는 근거 부족 설명",
    "durability_service": "내구성과 A/S 점수의 리뷰 근거 또는 근거 부족 설명",
    "value": "가격 대비 만족도 점수의 리뷰 근거 또는 근거 부족 설명"
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
      const analysis = normalizeAnalysis(parsed);

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
