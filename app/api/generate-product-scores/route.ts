import OpenAI from "openai";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  category?: unknown;
};

type Criterion = {
  key?: string;
  label?: string;
  shortDescription?: string;
  helpText?: string;
  sourceType?: string;
};

type ProductRow = {
  id: string;
  product_name: string;
  source_url: string;
  review_analysis: Record<string, unknown> | null;
  product_detail_analysis: Record<string, unknown> | null;
  criterion_scores: Record<string, unknown> | null;
};

type ScoreResult = {
  productId: string;
  criterionScores: Record<string, number | null>;
  criterionReasons: Record<string, string>;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as Record<string, unknown>;
}

function normalizeScore(value: unknown): number | null {
  if (value === null) return null;

  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(numberValue)) return null;

  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function normalizeResults(
  value: unknown,
  productIds: Set<string>,
  criterionKeys: string[],
): ScoreResult[] {
  if (!Array.isArray(value)) return [];

  const keySet = new Set(criterionKeys);

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;

      const row = item as Record<string, unknown>;
      const productId = normalizeText(row.productId);

      if (!productId || !productIds.has(productId)) return null;

      const rawScores =
        row.criterionScores &&
        typeof row.criterionScores === "object" &&
        !Array.isArray(row.criterionScores)
          ? (row.criterionScores as Record<string, unknown>)
          : {};

      const rawReasons =
        row.criterionReasons &&
        typeof row.criterionReasons === "object" &&
        !Array.isArray(row.criterionReasons)
          ? (row.criterionReasons as Record<string, unknown>)
          : {};

      const criterionScores: Record<string, number | null> = {};
      const criterionReasons: Record<string, string> = {};

      for (const key of criterionKeys) {
        if (!keySet.has(key)) continue;

        criterionScores[key] = normalizeScore(rawScores[key]);

        const reason = normalizeText(rawReasons[key]);
        criterionReasons[key] =
          reason || "현재 수집된 상세정보와 리뷰만으로는 충분한 평가 근거가 없습니다.";
      }

      return {
        productId,
        criterionScores,
        criterionReasons,
      };
    })
    .filter((item): item is ScoreResult => Boolean(item));
}


function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(row[key])}`,
    )
    .join(",")}}`;
}

function createScoreFingerprint(value: unknown) {
  return createHash("sha256")
    .update(stableStringify(value))
    .digest("hex");
}

function getReviewAnalysisForFingerprint(
  value: Record<string, unknown> | null,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const {
    criterionReasons: _criterionReasons,
    criterion_reasons: _criterionReasonsSnake,
    ...reviewOnlyFields
  } = value;

  return reviewOnlyFields;
}

function hasCompleteCriterionScores(
  scores: Record<string, unknown> | null,
  criterionKeys: string[],
) {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    return false;
  }

  return criterionKeys.every((key) => {
    const value = scores[key];

    if (value === null) {
      return true;
    }

    const numberValue =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : NaN;

    return (
      Number.isFinite(numberValue) &&
      numberValue >= 0 &&
      numberValue <= 100
    );
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const category = normalizeText(body.category);

    if (!category) {
      return NextResponse.json(
        { success: false, message: "카테고리가 필요합니다." },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "OPENAI_API_KEY가 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("category_profiles")
      .select("category, criteria, common_cautions, updated_at, score_generation_fingerprint, score_generated_at")
      .eq("category", category)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          message: "먼저 이 카테고리의 AI 구매기준을 생성해 주세요.",
        },
        { status: 404 },
      );
    }

    const criteria = Array.isArray(profile.criteria)
      ? (profile.criteria as Criterion[])
          .map((criterion) => ({
            key: normalizeText(criterion.key),
            label: normalizeText(criterion.label),
            shortDescription: normalizeText(criterion.shortDescription),
            helpText: normalizeText(criterion.helpText),
            sourceType: normalizeText(criterion.sourceType),
          }))
          .filter((criterion) => criterion.key && criterion.label)
          .slice(0, 5)
      : [];

    if (criteria.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "제품 점수를 만들 구매기준이 없습니다.",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, product_name, source_url, review_analysis, product_detail_analysis, criterion_scores",
      )
      .eq("category", category)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const products = (data ?? []) as ProductRow[];

    if (products.length < 2) {
      return NextResponse.json(
        {
          success: false,
          message: "제품별 비교 점수를 만들려면 같은 카테고리 제품이 최소 2개 필요합니다.",
        },
        { status: 400 },
      );
    }

    const criterionKeys = criteria.map((criterion) => criterion.key);

    const scoreFingerprint = createScoreFingerprint({
      category,
      criteria,
      commonCautions: Array.isArray(profile.common_cautions)
        ? profile.common_cautions
        : [],
      products: products.map((product) => ({
        id: product.id,
        productName: product.product_name,
        sourceUrl: product.source_url,
        reviewAnalysis: getReviewAnalysisForFingerprint(
          product.review_analysis,
        ),
        productDetailAnalysis: product.product_detail_analysis,
      })),
    });

    const cachedFingerprint =
      normalizeText(profile.score_generation_fingerprint);

    const allProductsHaveScores = products.every((product) =>
      hasCompleteCriterionScores(
        product.criterion_scores,
        criterionKeys,
      ),
    );

    if (
      cachedFingerprint === scoreFingerprint &&
      allProductsHaveScores
    ) {
      return NextResponse.json({
        success: true,
        cacheHit: true,
        category,
        productCount: products.length,
        criterionCount: criteria.length,
        scoreGeneratedAt: profile.score_generated_at ?? null,
        message:
          "리뷰·상세정보·구매기준 변경이 없어 기존 제품별 점수를 그대로 사용합니다.",
      });
    }

    const evidenceProducts = products.map((product) => ({
      productId: product.id,
      productName: product.product_name,
      sourceUrl: product.source_url,
      productDetailAnalysis: product.product_detail_analysis,
      reviewAnalysis: product.review_analysis,
    }));

    const client = new OpenAI({ apiKey });

    const prompt = `
당신은 Project D의 제품 비교 평가 엔진입니다.

카테고리:
${category}

이 카테고리에서 이미 선정된 핵심 구매기준:
${JSON.stringify(criteria, null, 2)}

AI가 전체 비교제품을 함께 분석해 확인한 제품군 공통 한계:
${JSON.stringify(Array.isArray(profile.common_cautions) ? profile.common_cautions : [], null, 2)}

비교할 제품과 수집된 근거:
${JSON.stringify(evidenceProducts, null, 2)}

목표:
같은 카테고리의 제품들을 서로 비교하여, 각 제품을 위 구매기준별로 0~100점으로 평가합니다.
이 점수는 이후 사용자의 중요도와 맞춤 질문 답변을 반영해 최종 추천 순위를 계산하는 데 사용됩니다.

평가 원칙:
- 제품끼리 상대 비교가 가능하도록 같은 눈금으로 평가하세요.
- 위 "제품군 공통 한계"는 여러 비교제품에 공통으로 존재하는 특성이므로 특정 제품만의 약점처럼 상대 감점하지 마세요.
- 공통 한계가 모든 제품에 동일하게 적용된다면 그 사실 자체는 제품 간 점수 차이를 만드는 근거로 사용하지 마세요.
- 같은 공통 한계라도 특정 제품이 다른 후보보다 명확히 더 심하거나 더 잘 해결했다는 근거가 있을 때만 그 차이를 점수에 반영하세요.
- 특정 제품에서만 반복되는 고장, 누수, 설치 불편, 소음, A/S 문제 등 고유 약점은 해당 기준 점수에 상대적으로 반영하세요.
- criterionReasons에서도 공통 한계와 제품 고유 약점을 혼동하지 말고, 점수 차이가 생긴 이유를 제품 간 차이 중심으로 설명하세요.
- 90~100: 현재 비교 제품 중 매우 강한 수준
- 75~89: 강점이 뚜렷한 수준
- 60~74: 평균 이상 또는 무난한 수준
- 40~59: 아쉬움이나 제약이 분명한 수준
- 0~39: 이 기준에서 큰 약점이 있는 수준
- 근거가 정말 부족해서 판단할 수 없으면 null을 사용하세요.
- 상세페이지의 판매자 주장만 믿지 말고 실제 리뷰와 함께 판단하세요.
- 정확한 수치가 제공되지 않았다면 수치를 만들어내지 마세요.
- 가격/가성비 기준은 실제 가격 정보와 구성, 기능, 리뷰를 함께 보세요.
- 소음, 냉방 체감, 배수, 내구성처럼 실사용 경험이 중요한 기준은 리뷰를 적극 반영하세요.
- 한 제품의 점수를 먼저 정하고 다른 제품을 맞추지 말고, 모든 제품을 한 번에 비교해 일관된 상대 점수를 만드세요.
- criterionReasons에는 왜 그 점수를 줬는지 1~2문장으로 구체적인 근거를 적으세요.
- 반드시 아래 criteria key만 사용하세요.
- JSON만 출력하세요.

출력 형식:
{
  "products": [
    {
      "productId": "입력에 있는 실제 productId",
      "criterionScores": {
        "criteria의 실제 key": 0
      },
      "criterionReasons": {
        "criteria의 실제 key": "점수 근거"
      }
    }
  ]
}
`;

    const response = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      throw new Error("AI가 제품별 기준 점수를 반환하지 않았습니다.");
    }

    const parsed = extractJson(outputText);
    const productIds = new Set(products.map((product) => product.id));

    const scoreResults = normalizeResults(
      parsed.products,
      productIds,
      criterionKeys,
    );

    if (scoreResults.length !== products.length) {
      throw new Error(
        `AI 제품 평가 결과가 완전하지 않습니다. ${products.length}개 중 ${scoreResults.length}개만 반환되었습니다.`,
      );
    }

    for (const product of products) {
      const scoreResult = scoreResults.find(
        (item) => item.productId === product.id,
      );

      if (!scoreResult) continue;

      const existingReview =
        product.review_analysis &&
        typeof product.review_analysis === "object" &&
        !Array.isArray(product.review_analysis)
          ? product.review_analysis
          : {};

      const mergedReviewAnalysis = {
        ...existingReview,
        criterionReasons: scoreResult.criterionReasons,
        criterion_reasons: scoreResult.criterionReasons,
      };

      const { error: updateError } = await supabase
        .from("products")
        .update({
          criterion_scores: scoreResult.criterionScores,
          review_analysis: mergedReviewAnalysis,
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id);

      if (updateError) throw updateError;
    }

    const scoreGeneratedAt = new Date().toISOString();

    const { error: profileUpdateError } = await supabase
      .from("category_profiles")
      .update({
        score_generation_fingerprint: scoreFingerprint,
        score_generated_at: scoreGeneratedAt,
      })
      .eq("category", category);

    if (profileUpdateError) throw profileUpdateError;

    return NextResponse.json({
      success: true,
      cacheHit: false,
      category,
      productCount: products.length,
      criterionCount: criteria.length,
      scoreGeneratedAt,
      message: `${products.length}개 제품을 현재 구매기준 ${criteria.length}개로 AI 평가해 제품별 점수와 근거를 저장했습니다.`,
    });
  } catch (error) {
    console.error("Generate product scores API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "제품별 AI 기준 점수를 생성하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
