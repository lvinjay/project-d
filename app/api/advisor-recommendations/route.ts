import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecommendationRequest = {
  category?: unknown;
  weights?: unknown;
};

type ScoreMap = Record<string, number | null>;

type ReviewPoint = {
  topic?: string;
  summary?: string;
  evidenceCount?: number;
};

type ReviewAnalysis = {
  summary?: string;
  reviewCount?: number;
  positivePoints?: ReviewPoint[];
  negativePoints?: ReviewPoint[];
  cautions?: string[];
  bestFor?: string[];
  notFor?: string[];
  confidenceScore?: number;
  criterionReasons?: Record<string, string>;
  criterion_reasons?: Record<string, string>;
};

type ProductRow = {
  id: string;
  category: string;
  product_name: string;
  source_url: string;
  review_analysis: ReviewAnalysis | null;
  criterion_scores: ScoreMap | null;
  market_metrics: Record<string, unknown> | null;
};

const LABELS: Record<string, string> = {
  cooling_capacity: "냉방 성능",
  noise: "소음",
  power_consumption: "소비전력",
  portability: "휴대성",
  installation: "설치 편의성",
  drainage: "배수 관리",
  power_compatibility: "전원 활용성",
  durability_service: "내구성과 A/S",
  value: "가격 대비 만족도",
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWeights(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, number>;
  }

  const result: Record<string, number> = {};

  for (const [key, raw] of Object.entries(value)) {
    const numberValue = Number(raw);

    if (Number.isFinite(numberValue)) {
      result[key] = Math.max(0, Math.min(10, numberValue));
    }
  }

  return result;
}

function isUsableScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

function firstSentences(values: unknown, limit: number) {
  if (!Array.isArray(values)) return [];

  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function pointSummaries(values: unknown, limit: number) {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => {
      if (!value || typeof value !== "object") return "";
      const point = value as ReviewPoint;
      return [point.topic, point.summary].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .slice(0, limit);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecommendationRequest;
    const category = normalizeText(body.category);
    const weights = normalizeWeights(body.weights);

    if (!category) {
      return NextResponse.json(
        { success: false, message: "카테고리가 필요합니다." },
        { status: 400 },
      );
    }

    const activeWeights = Object.entries(weights).filter(([, value]) => value > 0);

    if (activeWeights.length === 0) {
      return NextResponse.json(
        { success: false, message: "추천 기준 중요도가 비어 있습니다." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, category, product_name, source_url, review_analysis, criterion_scores, market_metrics",
      )
      .eq("category", category)
      .not("review_analysis", "is", null);

    if (error) throw error;

    const rows = (data ?? []) as ProductRow[];

    const recommendations = rows
      .map((product) => {
        const scores = product.criterion_scores ?? {};
        let weightedTotal = 0;
        let usedWeightTotal = 0;
        let requestedWeightTotal = 0;
        const criterionBreakdown: Array<{
          key: string;
          label: string;
          score: number | null;
          weight: number;
          contribution: number | null;
          reason: string;
        }> = [];

        const reasonsMap =
          product.review_analysis?.criterionReasons ??
          product.review_analysis?.criterion_reasons ??
          {};

        for (const [key, weight] of activeWeights) {
          requestedWeightTotal += weight;
          const score = scores[key];

          if (isUsableScore(score)) {
            weightedTotal += score * weight;
            usedWeightTotal += weight;
          }

          criterionBreakdown.push({
            key,
            label: LABELS[key] ?? key,
            score: isUsableScore(score) ? score : null,
            weight,
            contribution: isUsableScore(score) ? Number((score * weight).toFixed(1)) : null,
            reason:
              typeof reasonsMap[key] === "string"
                ? reasonsMap[key]
                : "현재 리뷰 분석에서 별도 설명이 저장되지 않았습니다.",
          });
        }

        if (usedWeightTotal === 0) return null;

        const matchScore = Math.round(weightedTotal / usedWeightTotal);
        const dataCoverage = Math.round(
          (usedWeightTotal / Math.max(1, requestedWeightTotal)) * 100,
        );
        const reviewConfidence = Number(
          product.review_analysis?.confidenceScore ?? 0,
        );
        const confidence = Math.round(
          dataCoverage * 0.7 + Math.max(0, Math.min(100, reviewConfidence)) * 0.3,
        );

        const strongest = criterionBreakdown
          .filter((item) => item.score !== null)
          .sort(
            (a, b) =>
              (b.score ?? 0) * b.weight - (a.score ?? 0) * a.weight,
          )
          .slice(0, 3);

        const weakest = criterionBreakdown
          .filter((item) => item.score !== null)
          .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
          .slice(0, 2);

        return {
          id: product.id,
          productName: product.product_name,
          sourceUrl: product.source_url,
          matchScore,
          confidence,
          dataCoverage,
          reviewCount: Number(product.review_analysis?.reviewCount ?? 0),
          summary: product.review_analysis?.summary ?? "리뷰 분석 요약이 없습니다.",
          recommendationReasons: strongest.map(
            (item) =>
              `${item.label} 중요도 ${item.weight}/10에서 제품 점수 ${item.score}점을 기록했습니다.`,
          ),
          cautions: [
            ...firstSentences(product.review_analysis?.cautions, 2),
            ...pointSummaries(product.review_analysis?.negativePoints, 2),
            ...weakest.map(
              (item) => `${item.label} 점수는 ${item.score}점으로 상대적으로 낮습니다.`,
            ),
          ].filter((value, index, array) => array.indexOf(value) === index).slice(0, 4),
          bestFor: firstSentences(product.review_analysis?.bestFor, 3),
          criterionBreakdown: criterionBreakdown.sort((a, b) => b.weight - a.weight),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.matchScore - a.matchScore || b.confidence - a.confidence)
      .slice(0, 5)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    if (recommendations.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "추천에 사용할 제품별 기준 점수가 없습니다.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      category,
      count: recommendations.length,
      recommendations,
      note:
        "점수가 없는 기준은 계산에서 제외했으며, 추천 정확도에 데이터 반영률을 표시했습니다.",
    });
  } catch (error) {
    console.error("Advisor recommendations API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "맞춤 추천을 계산하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
