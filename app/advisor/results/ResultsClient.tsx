"use client";

import { loadSelectedFiveContext, selectedFiveIds, assertSameSelectedIds } from "../../../lib/project-d-selected-five-manifest";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import Header from "../../../components/Header";

type CriterionBreakdown = {
  key: string;
  label: string;
  score: number | null;
  effectiveScore: number | null;
  imputed: boolean;
  criterionAverage: number | null;
  weight: number;
  contribution: number | null;
  reason: string;
  reviewEvidenceCount: number;
  evidenceSummary: string;
};

function criterionScoreLabel(criterion: CriterionBreakdown): string {
  if (criterion.imputed === true && criterion.score === null && typeof criterion.effectiveScore === "number") {
    return "후보 평균으로 보완 · 보완 점수 " + criterion.effectiveScore + "점";
  }
  if (typeof criterion.score === "number") return "점수 " + criterion.score + "점";
  return "평가 가능한 점수 없음";
}
function selectDisplaySpecs(
  specs: KeySpec[],
  category: string,
): KeySpec[] {
  const valid =
    specs
      .filter(
        (spec) =>
          typeof spec.name === "string" &&
          spec.name.trim() &&
          typeof spec.value === "string" &&
          spec.value.trim(),
      )
      .map((spec) => ({
        ...spec,
        name: spec.name.trim(),
        value: spec.value.trim(),
      }));

  const pickPreferred = (
    patterns: RegExp[],
  ) => {
    const picked: KeySpec[] = [];
    const pickedNames =
      new Set<string>();

    for (const pattern of patterns) {
      for (const spec of valid) {
        const key =
          normalizeSpecName(
            spec.name,
          );

        if (
          !key ||
          pickedNames.has(key) ||
          !pattern.test(
            `${spec.name} ${spec.value}`,
          )
        ) {
          continue;
        }

        pickedNames.add(key);
        picked.push(spec);
      }
    }

    return picked;
  };

  const isAirConditioner =
    /\uC5D0\uC5B4\uCEE8|\uB0C9\uBC29/i
      .test(category);

  const isRobotVacuum =
    /\uB85C\uBD07\s*\uCCAD\uC18C\uAE30|\uB85C\uCCAD/i
      .test(category);

  const preferred =
    isAirConditioner
      ? pickPreferred([
          /btu|\uB0C9\uBC29\uB2A5\uB825|\uB0C9\uBC29\uC6A9\uB7C9|\uB0C9\uBC29\uC131\uB2A5/i,
          /\uC18C\uC74C|db|\uB370\uC2DC\uBCA8/i,
          /\uC18C\uBE44\uC804\uB825|\uC815\uACA9\uC804\uB825|\uC804\uB825\uC18C\uBE44|watt|\uC640\uD2B8/i,
          /\uBB34\uAC8C|\uC911\uB7C9|kg/i,
          /\uC81C\uC2B5\uB7C9|\uD48D\uB7C9|\uBC30\uD130\uB9AC/i,
        ])
      : isRobotVacuum
        ? [
          // Preserve source values/units; suction controls remain in the valid fallback.
          ...valid.filter((spec) => /^(흡입력|흡입압)$/.test(normalizeSpecName(spec.name))),
          ...pickPreferred([
            /\uC18C\uC74C|db|\uB370\uC2DC\uBCA8/i,
            /\uC0AC\uC6A9\uC2DC\uAC04|\uCCAD\uC18C\uC2DC\uAC04/i,
            /\uBC30\uD130\uB9AC\uC6A9\uB7C9|mah/i,
            /\uBB38\uD131/i,
            /\uBA3C\uC9C0\uD1B5\uC6A9\uB7C9|\uBB3C\uD1B5\uC6A9\uB7C9|\uAE09\uC218\uD0F1\uD06C|\uC624\uC218\uD0F1\uD06C/i,
            /\uC18C\uBE44\uC804\uB825|\uC815\uACA9\uC804\uB825|watt|\uC640\uD2B8/i,
            /\uBB34\uAC8C|\uC911\uB7C9|kg/i,
          ]),
        ]
        : [];

  const seen =
    new Set<string>();

  return [
    ...preferred,
    ...valid,
  ]
    .filter((spec) => {
      const key =
        normalizeSpecName(
          spec.name,
        );

      if (
        !key ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    })
    .slice(0, 5);
}

type KeySpec = {
  name: string;
  value: string;
  evidence?: string;
  source?: string;
};

type Recommendation = {
  id: string;
  rank: number;
  productName: string;
  sourceUrl: string;
  matchScore: number;
  rankingScore?: number;
  baseMatchScore?: number;
  blendedMatchScore?: number;
  valueScore?: number;
  valueRank?: number | null;
  valuePriceScore?: number | null;
  personalAdjustment?: number;
  confidence: number;
  dataCoverage: number;
  reviewCount: number;
  summary: string;
  recommendationReasons: string[];
  cautions: string[];
  productCautions?: string[];
  commonCautions?: Array<{
    title: string;
    description: string;
    affectedCount: number;
    affectedProducts: string[];
  }>;
  bestFor: string[];
  criterionBreakdown: CriterionBreakdown[];
  personalPreferenceScore?: number | null;
  personalPreferenceReason?: string;
  productPrice?: number | null;
  keySpecs?: KeySpec[];
  budgetPenalty?: number;
  budgetReason?: string;
};

function getRankingScore(
  recommendation: Recommendation,
) {
  if (
    typeof recommendation.rankingScore ===
      "number" &&
    Number.isFinite(
      recommendation.rankingScore,
    )
  ) {
    return recommendation.rankingScore;
  }

  const matchScore =
    typeof recommendation.matchScore ===
      "number" &&
    Number.isFinite(
      recommendation.matchScore,
    )
      ? recommendation.matchScore
      : 0;

  const budgetPenalty =
    typeof recommendation.budgetPenalty ===
      "number" &&
    Number.isFinite(
      recommendation.budgetPenalty,
    ) &&
    recommendation.budgetPenalty > 0
      ? recommendation.budgetPenalty
      : 0;

  return Math.max(
    0,
    Math.min(
      100,
      matchScore - budgetPenalty,
    ),
  );
}

type RecommendationResponse = {
  success: boolean;
  category?: string;
  recommendations?: Recommendation[];
  note?: string;
  message?: string;
  needsScoreGeneration?: boolean;
};

type ProductScoreGenerationRequest = {
  category: string;
  productIds?: string[];
  productNames?: string[];
};

type ProductScoreGenerationResponse = {
  success: boolean;
  message?: string;
  dryRun?: boolean;
  cacheHit?: boolean;
  pipelineVersion?: string;
  inputFingerprint?: string;
  estimatedOpenAiCalls?: number;
  paidApiCalls?: number;
  productCount?: number;
};

type ProductScoreGenerationPlan = {
  input: ProductScoreGenerationRequest;
  inputFingerprint: string;
  estimatedOpenAiCalls: number;
  cacheHit: boolean;
};

async function prepareProductScoreGeneration(
  input: ProductScoreGenerationRequest,
): Promise<ProductScoreGenerationPlan> {
  const response = await fetch(
    "/api/generate-product-scores",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        dryRun: true,
      }),
    },
  );

  const result =
    (await response.json()) as ProductScoreGenerationResponse;

  if (
    !response.ok ||
    !result.success ||
    result.dryRun !== true ||
    result.paidApiCalls !== 0 ||
    !result.inputFingerprint
  ) {
    throw new Error(
      result.message ??
        "제품 점수 최신성 무료 사전검증에 실패했습니다.",
    );
  }

  const estimatedOpenAiCalls =
    Number(
      result.estimatedOpenAiCalls,
    );

  if (
    !Number.isSafeInteger(
      estimatedOpenAiCalls,
    ) ||
    estimatedOpenAiCalls < 0 ||
    estimatedOpenAiCalls > 1
  ) {
    throw new Error(
      "제품 점수 생성 예상 OpenAI 호출 수가 안전 범위를 벗어났습니다. 자동 유료 평가는 시작하지 않습니다.",
    );
  }

  return {
    input,
    inputFingerprint:
      result.inputFingerprint,
    estimatedOpenAiCalls,
    cacheHit:
      result.cacheHit === true,
  };
}

type StoredAnswers = {
  selectionIdentity?: string;
  category?: string;
  weights?: Record<string, number>;
  budgetChoice?: string;
  budgetOptions?: Array<{
    label: string;
    value: string;
  }>;
  customPreference?: string;
};

type PersonalPreferenceRequest = {
  category: string;
  budgetChoice: string;
  customPreference: string;
  productIds: string[];
};

type PersonalPreferenceResponse = {
  success: boolean;
  message?: string;
  dryRun?: boolean;
  pipelineVersion?: string;
  inputFingerprint?: string;
  estimatedOpenAiCalls?: number;
  paidApiCalls?: number;
  productCount?: number;
  analysisMode?: string;
  paidResponseAudit?: {
    responseId?: string;
    responseStatus?: string;
    rawModelOutputText?: string;
  } | null;
  interpretedPreferences?: string[];
  productScores?: Array<{
    productId: string;
    score: number;
    reason: string;
  }>;
};

type PersonalPreferencePlan = {
  selectionIdentity?: string;
  input: PersonalPreferenceRequest;
  inputFingerprint: string;
  estimatedOpenAiCalls: number;
  precheckResult: PersonalPreferenceResponse;
};

async function preparePersonalPreferenceAnalysis(
  input: PersonalPreferenceRequest,
): Promise<PersonalPreferencePlan> {
  const response = await fetch(
    "/api/analyze-personal-preferences",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        dryRun: true,
      }),
    },
  );

  const result =
    (await response.json()) as PersonalPreferenceResponse;

  if (
    !response.ok ||
    !result.success ||
    result.dryRun !== true ||
    result.paidApiCalls !== 0 ||
    !result.inputFingerprint
  ) {
    throw new Error(
      result.message ??
        "개인 추가조건 AI 분석 무료 사전검증에 실패했습니다.",
    );
  }

  const estimatedOpenAiCalls =
    Number(
      result.estimatedOpenAiCalls,
    );

  if (
    !Number.isSafeInteger(
      estimatedOpenAiCalls,
    ) ||
    estimatedOpenAiCalls < 0 ||
    estimatedOpenAiCalls > 1
  ) {
    throw new Error(
      "개인 추가조건 AI 분석 예상 OpenAI 호출 수가 안전 범위를 벗어났습니다. 유료 분석은 시작하지 않습니다.",
    );
  }

  return {
    input,
    inputFingerprint:
      result.inputFingerprint,
    estimatedOpenAiCalls,
    precheckResult:
      result,
  };
}

async function executePersonalPreferenceAnalysis(
  plan: PersonalPreferencePlan,
) {
  if (!plan.selectionIdentity) throw new Error("승인한 선택 실행이 없습니다.");
  const selected = await loadSelectedFiveContext(window.sessionStorage, plan.input.category, plan.selectionIdentity);
  assertSameSelectedIds(plan.input.productIds, selected.manifest);
  const response = await fetch(
    "/api/analyze-personal-preferences",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...plan.input,
        inputFingerprint:
          plan.inputFingerprint,
      }),
    },
  );

  const result =
    (await response.json()) as PersonalPreferenceResponse;

  if (
    !response.ok ||
    !result.success
  ) {
    if (
      Number(
        result.paidApiCalls ?? 0,
      ) > 0
    ) {
      window.sessionStorage.setItem(
        "projectDPersonalPreferenceLastFailedPaidResponse",
        JSON.stringify({
          savedAt:
            new Date().toISOString(),
          inputFingerprint:
            plan.inputFingerprint,
          result,
        }),
      );
    }

    throw new Error(
      result.message ??
        "개인 추가조건 AI 분석에 실패했습니다. 자동 재시도하지 않습니다.",
    );
  }

  const paidApiCalls =
    Number(
      result.paidApiCalls ?? 0,
    );

  if (
    !Number.isSafeInteger(
      paidApiCalls,
    ) ||
    paidApiCalls < 0 ||
    paidApiCalls > 1
  ) {
    throw new Error(
      "개인 추가조건 AI 분석의 실제 OpenAI 호출 수가 안전 범위를 벗어났습니다. 자동 재시도하지 않습니다.",
    );
  }

  return result;
}

type PersonalPreferenceCache = {
  key: string;
  result: PersonalPreferenceResponse;
};

function normalizeSpecName(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}]/g, "")
    .replace(/[·ㆍ]/g, "");
}

function extractNumericValue(
  value: string,
): number | null {
  const match = value
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function formatPrice(
  value: number | null | undefined,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "";
  }

  if (value >= 10000) {
    const manwon =
      value / 10000;

    return Number.isInteger(manwon)
      ? `${manwon.toLocaleString()}만원`
      : `${manwon.toFixed(1)}만원`;
  }

  return `${Math.round(
    value,
  ).toLocaleString()}원`;
}

function getRankCardCautions(
  recommendation: Recommendation,
) {
  const values: string[] = [];
  const seen = new Set<string>();

  const append = (value: unknown) => {
    if (typeof value !== "string") {
      return;
    }

    const normalized =
      value
        .replace(/\s+/g, " ")
        .trim();

    if (!normalized) {
      return;
    }

    const key =
      normalized.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    values.push(normalized);
  };

  for (
    const caution of
    recommendation.productCautions ?? []
  ) {
    append(caution);
  }

  for (
    const caution of
    recommendation.commonCautions ?? []
  ) {
    append(
      caution?.title ||
        caution?.description,
    );
  }

  for (
    const caution of
    recommendation.cautions ?? []
  ) {
    append(caution);
  }

  return values.slice(0, 2);
}

function compactReason(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim();

  const firstSentence =
    normalized.match(/^.*?[.!?。](?:\s|$)/)?.[0]?.trim();

  const result =
    firstSentence && firstSentence.length >= 20
      ? firstSentence
      : normalized;

  return result.length > 105
    ? `${result.slice(0, 102).trim()}…`
    : result;
}

function getCriterionComparison(
  winnerId: string,
  criterionKey: string,
  recommendations: Recommendation[],
) {
  const values = recommendations
    .map((product) => {
      const criterion =
        product.criterionBreakdown.find(
          (item) =>
            item.key === criterionKey,
        );

      return criterion?.score !== null &&
        criterion?.score !== undefined
        ? {
            id: product.id,
            score: criterion.score,
          }
        : null;
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        score: number;
      } => item !== null,
    )
    .sort(
      (a, b) =>
        b.score - a.score,
    );

  if (values.length < 2) {
    return "";
  }

  const index =
    values.findIndex(
      (item) =>
        item.id === winnerId,
    );

  if (index < 0) {
    return "";
  }

  const rank = index + 1;

  if (rank === 1) {
    return `비교 ${values.length}개 제품 중 가장 높은 수준`;
  }

  return `비교 ${values.length}개 제품 중 ${rank}위 수준`;
}

type ComparableSpecType =
  | "cooling_btu"
  | "power"
  | "weight"
  | "noise"
  | "cooling_area"
  | null;

function getComparableSpecType(
  spec: KeySpec,
): ComparableSpecType {
  const name =
    normalizeSpecName(spec.name);

  const combined =
    `${spec.name} ${spec.value}`.toLowerCase();

  if (
    /냉방면적|권장냉방면적|냉방평수|적용면적/.test(name)
  ) {
    return "cooling_area";
  }

  if (
    /냉방능력|냉방성능|냉방용량|냉방출력/.test(name) ||
    (/냉방/.test(name) && /btu/i.test(combined))
  ) {
    return "cooling_btu";
  }

  if (
    /소비전력|정격전력|전력소비|평균소비전력/.test(name)
  ) {
    return "power";
  }

  if (
    /제품무게|본체무게|중량|무게/.test(name)
  ) {
    return "weight";
  }

  if (
    /소음|데시벨/.test(name) ||
    /\bdb\b/i.test(combined)
  ) {
    return "noise";
  }

  return null;
}

function extractComparableValue(
  spec: KeySpec,
  type: ComparableSpecType,
): number | null {
  if (!type) return null;

  const value =
    spec.value
      .replace(/,/g, "")
      .trim();

  if (type === "cooling_btu") {
    const directBtu =
      value.match(
        /(\d+(?:\.\d+)?)\s*BTU(?:\/h)?/i,
      );

    if (directBtu) {
      return Number(directBtu[1]);
    }

    const watt =
      value.match(
        /(\d+(?:\.\d+)?)\s*W\b/i,
      );

    if (watt) {
      const watts = Number(watt[1]);

      return Number.isFinite(watts)
        ? watts * 3.412142
        : null;
    }

    return null;
  }

  if (type === "power") {
    const average =
      value.match(
        /(?:평균|average)[^0-9]*?(\d+(?:\.\d+)?)\s*W/i,
      );

    if (average) {
      return Number(average[1]);
    }

    const values = [
      ...value.matchAll(
        /(\d+(?:\.\d+)?)\s*W/gi,
      ),
    ]
      .map((match) => Number(match[1]))
      .filter(Number.isFinite);

    return values.length > 0
      ? values[0]
      : null;
  }

  if (type === "weight") {
    const kg =
      value.match(
        /(\d+(?:\.\d+)?)\s*kg\b/i,
      );

    if (kg) {
      return Number(kg[1]);
    }

    const gram =
      value.match(
        /(\d+(?:\.\d+)?)\s*g\b/i,
      );

    if (gram) {
      return Number(gram[1]) / 1000;
    }

    return null;
  }

  if (type === "noise") {
    const db =
      value.match(
        /(\d+(?:\.\d+)?)\s*dB\b/i,
      );

    return db
      ? Number(db[1])
      : null;
  }

  if (type === "cooling_area") {
    const squareMeter =
      value.match(
        /(\d+(?:\.\d+)?)\s*㎡/,
      );

    if (squareMeter) {
      return Number(squareMeter[1]);
    }

    const pyeong =
      value.match(
        /(\d+(?:\.\d+)?)\s*평/,
      );

    if (pyeong) {
      return Number(pyeong[1]) * 3.305785;
    }

    return null;
  }

  return null;
}

function findComparableSpec(
  product: Recommendation,
  targetSpec: KeySpec,
) {
  const targetType =
    getComparableSpecType(targetSpec);

  if (targetType) {
    const typedMatch =
      (product.keySpecs ?? []).find(
        (spec) =>
          getComparableSpecType(spec) === targetType,
      );

    if (typedMatch) {
      return typedMatch;
    }
  }

  const normalizedTarget =
    normalizeSpecName(targetSpec.name);

  return (
    product.keySpecs ?? []
  ).find((spec) => {
    const normalizedName =
      normalizeSpecName(spec.name);

    return (
      normalizedName === normalizedTarget ||
      normalizedName.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedName)
    );
  });
}

function getSpecComparison(
  winner: Recommendation,
  spec: KeySpec,
  recommendations: Recommendation[],
) {
  const type =
    getComparableSpecType(spec);

  const winnerValue =
    extractComparableValue(
      spec,
      type,
    );

  if (
    !type ||
    winnerValue === null
  ) {
    return "";
  }

  const values =
    recommendations
      .map((product) => {
        const matchedSpec =
          findComparableSpec(
            product,
            spec,
          );

        if (!matchedSpec) {
          return null;
        }

        const numeric =
          extractComparableValue(
            matchedSpec,
            type,
          );

        if (numeric === null) {
          return null;
        }

        return {
          id: product.id,
          value: numeric,
        };
      })
      .filter(
        (
          item,
        ): item is {
          id: string;
          value: number;
        } => item !== null,
      );

  if (values.length < 2) {
    return "";
  }

  const lowerIsBetter =
    type === "power" ||
    type === "weight" ||
    type === "noise";

  const sorted =
    [...values].sort(
      (a, b) =>
        lowerIsBetter
          ? a.value - b.value
          : b.value - a.value,
    );

  const index =
    sorted.findIndex(
      (item) =>
        item.id === winner.id,
    );

  if (index < 0) {
    return "";
  }

  const rank = index + 1;

  if (rank === 1) {
    return lowerIsBetter
      ? `비교 ${values.length}개 중 가장 낮은 수준`
      : `비교 ${values.length}개 중 가장 높은 수준`;
  }

  return `비교 ${values.length}개 중 ${rank}위 수준`;
}
function getPriceComparison(
  winner: Recommendation,
  recommendations: Recommendation[],
) {
  if (
    typeof winner.productPrice !==
      "number" ||
    !Number.isFinite(
      winner.productPrice,
    )
  ) {
    return "";
  }

  const values =
    recommendations
      .filter(
        (product) =>
          typeof product.productPrice ===
            "number" &&
          Number.isFinite(
            product.productPrice,
          ),
      )
      .map((product) => ({
        id: product.id,
        price:
          product.productPrice as number,
      }))
      .sort(
        (a, b) =>
          a.price - b.price,
      );

  if (values.length < 2) {
    return "";
  }

  const index =
    values.findIndex(
      (item) =>
        item.id === winner.id,
    );

  if (index < 0) {
    return "";
  }

  if (index === 0) {
    return `비교 ${values.length}개 중 가장 저렴한 편`;
  }

  return `비교 ${values.length}개 중 ${index + 1}번째로 저렴`;
}

export default function ResultsClient() {
  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    category,
    setCategory,
  ] = useState("");
  const [selectionForReentry, setSelectionForReentry] = useState<{
    category: string;
    runId: string;
  } | null>(null);

  const [
    recommendations,
    setRecommendations,
  ] = useState<
    Recommendation[]
  >([]);

  const [
    note,
    setNote,
  ] = useState("");

  const [
    expandedId,
    setExpandedId,
  ] = useState("");

  const [
    interpretedPreferences,
    setInterpretedPreferences,
  ] = useState<string[]>(
    [],
  );

  const [
    pendingPersonalPlan,
    setPendingPersonalPlan,
  ] = useState<
    PersonalPreferencePlan | null
  >(null);

  const [
    isRunningPersonalPreference,
    setIsRunningPersonalPreference,
  ] = useState(false);

  useEffect(() => {
    async function loadRecommendations() {
      try {
        const raw =
          window.sessionStorage.getItem(
            "projectDAdvisorAnswers",
          );

        if (!raw) {
          throw new Error(
            "맞춤 질문 답변이 없습니다. 질문부터 다시 진행해 주세요.",
          );
        }

        const stored =
          JSON.parse(
            raw,
          ) as StoredAnswers;

        const nextCategory =
          stored.category?.trim() ??
          "";

        const weights =
          stored.weights ?? {};

        if (!stored.selectionIdentity) throw new Error("현재 선택 실행의 질문 답변이 없습니다. Advisor부터 다시 진행해 주세요.");
        const selected = await loadSelectedFiveContext(window.sessionStorage, nextCategory, stored.selectionIdentity);
        setSelectionForReentry({ category: selected.manifest.category, runId: selected.manifest.runId });
        const currentRunProductIds = selectedFiveIds(selected.manifest);
        if (!nextCategory) {
          throw new Error(
            "추천할 카테고리 정보가 없습니다.",
          );
        }

        const scorePlan =
          await prepareProductScoreGeneration({
            category:
              nextCategory,
            productIds:
              currentRunProductIds,
          });

        if (
          scorePlan.estimatedOpenAiCalls >
            0 ||
          !scorePlan.cacheHit
        ) {
          throw new Error(
            `최종 추천용 제품 점수가 최신이 아닙니다. 무료 사전검증 결과 OpenAI 호출 최대 ${scorePlan.estimatedOpenAiCalls}회가 필요하지만 결과 화면에서는 유료 호출을 자동 실행하지 않습니다. 관리자에서 제품별 점수 생성을 승인한 뒤 다시 추천을 실행해 주세요.`,
          );
        }

        const personalRequest:
          PersonalPreferenceRequest = {
            category:
              nextCategory,
            budgetChoice:
              stored.budgetChoice ??
              "no_limit",
            customPreference:
              stored.customPreference ??
              "",
            productIds:
              currentRunProductIds,
          };

        const personalPlan =
          await preparePersonalPreferenceAnalysis(
            personalRequest,
          );

        personalPlan.selectionIdentity = selected.identity;
        const personalCacheKey = selected.identity + ":" + personalPlan.inputFingerprint;

        const cachedRaw =
          window.sessionStorage.getItem(
            "projectDPersonalPreferenceCache",
          );

        let personalResult:
          | PersonalPreferenceResponse
          | null = null;

        if (cachedRaw) {
          try {
            const cached =
              JSON.parse(
                cachedRaw,
              ) as PersonalPreferenceCache;

            if (
              cached.key ===
                personalCacheKey &&
              cached.result?.success
            ) {
              personalResult =
                cached.result;
            }
          } catch {
            window.sessionStorage.removeItem(
              "projectDPersonalPreferenceCache",
            );
          }
        }

        if (!personalResult) {
          if (
            personalPlan.estimatedOpenAiCalls ===
            0
          ) {
            personalResult =
              personalPlan.precheckResult;
          } else {
            setCategory(
              nextCategory,
            );

            setPendingPersonalPlan(
              personalPlan,
            );

            return;
          }
        }

        if (!personalResult) {
          throw new Error(
            "가격·추가 조건 분석 결과가 없습니다.",
          );
        }

        const resolvedPersonalResult =
          personalResult;

        setInterpretedPreferences(
          resolvedPersonalResult.interpretedPreferences ??
            [],
        );

        async function requestRecommendations() {
          const current = await loadSelectedFiveContext(window.sessionStorage, nextCategory, selected.identity);
          assertSameSelectedIds(currentRunProductIds, current.manifest);
          const response =
            await fetch(
              "/api/advisor-recommendations",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    category:
                      nextCategory,
                    weights,
                    budgetChoice:
                      stored.budgetChoice ??
                      "no_limit",
                    personalProductScores:
                      resolvedPersonalResult.productScores ??
                      [],
                    productIds:
                      currentRunProductIds,
                  }),
              },
            );

          const result =
            (await response.json()) as RecommendationResponse;

          return {
            response,
            result,
          };
        }

        let {
          response,
          result,
        } =
          await requestRecommendations();

        if (
          (!response.ok ||
            !result.success) &&
          result.needsScoreGeneration
        ) {
          throw new Error(
            "제품 점수 최신성 검증과 생성 이후에도 추천용 점수가 완전하지 않습니다. 자동으로 유료 호출을 반복하지 않고 중단했습니다.",
          );
        }

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.message ??
              "맞춤 추천을 불러오지 못했습니다.",
          );
        }

        await loadSelectedFiveContext(window.sessionStorage, nextCategory, selected.identity);
        setCategory(
          result.category ??
            nextCategory,
        );

        setRecommendations(
          result.recommendations ??
            [],
        );

        setNote(
          result.note ?? "",
        );
      } catch (error) {
        console.error(
          "맞춤 추천 결과 불러오기 실패:",
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "추천 결과를 불러오지 못했습니다.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadRecommendations();
  }, []);

  async function runPendingPersonalPreference() {
    if (
      !pendingPersonalPlan ||
      isRunningPersonalPreference
    ) {
      return;
    }

    const plan =
      pendingPersonalPlan;

    /*
      유료 요청을 누른 뒤 실패하면 자동 재시도 버튼을 남기지 않는다.
      요청이 서버에 도달했을 가능성이 있으므로 결과 확인 후 새로 판단한다.
    */
    setPendingPersonalPlan(
      null,
    );
    setIsRunningPersonalPreference(
      true,
    );
    setErrorMessage("");

    try {
      const result =
        await executePersonalPreferenceAnalysis(
          plan,
        );

      window.sessionStorage.setItem(
        "projectDPersonalPreferenceCache",
        JSON.stringify({
          key:
            plan.selectionIdentity + ":" + plan.inputFingerprint,
          result,
        } satisfies PersonalPreferenceCache),
      );

      window.location.reload();
    } catch (error) {
      console.error(
        "개인 추가조건 AI 분석 실패:",
        error,
      );

      setErrorMessage(
        error instanceof Error
          ? `${error.message} 유료 요청이 시작됐을 수 있으므로 자동 재시도하지 않습니다.`
          : "개인 추가조건 AI 분석에 실패했습니다. 유료 요청이 시작됐을 수 있으므로 자동 재시도하지 않습니다.",
      );
    } finally {
      setIsRunningPersonalPreference(
        false,
      );
    }
  }

  const winner =
    recommendations[0] ??
    null;

  const topCriteria =
    useMemo(
      () =>
        winner?.criterionBreakdown
          .filter(
            (item) =>
              item.score !==
              null,
          )
          .sort(
            (a, b) =>
              b.weight -
              a.weight,
          )
          .slice(0, 4) ??
        [],
      [winner],
    );

  const winnerReasons =
    useMemo(() => {
      if (!winner) {
        return [];
      }

      return [
        ...winner.criterionBreakdown,
      ]
        .filter(
          (
            criterion,
          ) =>
            criterion.score !==
            null,
        )
        .sort(
          (a, b) =>
            b.weight *
              (b.score ?? 0) -
            a.weight *
              (a.score ?? 0),
        )
        .slice(0, 4)
        .map((criterion) => ({
          ...criterion,
          comparison:
            getCriterionComparison(
              winner.id,
              criterion.key,
              recommendations,
            ),
        }));
    }, [
      winner,
      recommendations,
    ]);

  const winnerSpecs =
    useMemo(() => {
      if (!winner) {
        return [];
      }

      const rows: Array<{
        name: string;
        value: string;
        comparison: string;
        evidence?: string;
      }> = [];

      if (
        typeof winner.productPrice ===
          "number" &&
        Number.isFinite(
          winner.productPrice,
        )
      ) {
        rows.push({
          name: "가격",
          value:
            formatPrice(
              winner.productPrice,
            ),
          comparison:
            getPriceComparison(
              winner,
              recommendations,
            ),
        });
      }

      const prioritized = selectDisplaySpecs(winner.keySpecs ?? [], category);

      const seen =
        new Set<string>();

      for (
        const spec of prioritized
      ) {
        const key =
          normalizeSpecName(
            spec.name,
          );

        if (
          !key ||
          seen.has(key)
        ) {
          continue;
        }

        seen.add(key);

        rows.push({
          name: spec.name,
          value: spec.value,
          comparison:
            getSpecComparison(
              winner,
              spec,
              recommendations,
            ),
          evidence:
            spec.evidence,
        });

        if (
          rows.length >= 5
        ) {
          break;
        }
      }

      return rows;
    }, [
      winner,
      recommendations,
      category,
    ]);

  return (
    <main>
      <Header />

      <section className="advisorResultHero">
        <div className="container">
          <span className="heroBadge">
            맞춤 추천 완료
          </span>

          <h1>
            {category ||
              "제품"}{" "}
            중 나에게 맞는
            순위입니다.
          </h1>

          <p>
            AI가 상세페이지와 실제
            리뷰에서 평가한 제품별
            기준 점수에 내 맞춤
            조건을 결합했습니다.
          </p>
        </div>
      </section>

      <section className="container advisorResultContainer">
        {isLoading ||
        isRunningPersonalPreference ? (
          <div className="card advisorResultState">
            {isRunningPersonalPreference
              ? "승인한 개인 추가조건 AI 분석을 실행하는 중입니다. 자동 재시도는 하지 않습니다."
              : "추천 순위를 계산하는 중입니다."}
          </div>
        ) : pendingPersonalPlan ? (
          <div className="card advisorResultState">
            <h2>
              개인 추가조건 AI 분석이
              필요합니다.
            </h2>

            <p>
              무료 사전검증이
              완료되었습니다. 결과 화면은
              유료 OpenAI 호출을 자동으로
              시작하지 않습니다.
            </p>

            <p>
              예상 OpenAI 호출 최대{" "}
              <strong>
                {
                  pendingPersonalPlan
                    .estimatedOpenAiCalls
                }
                회
              </strong>
            </p>

            <p>
              추가 조건:{" "}
              <strong>
                {
                  pendingPersonalPlan
                    .input
                    .customPreference
                }
              </strong>
            </p>

            <button
              type="button"
              className="primaryButton"
              onClick={
                runPendingPersonalPreference
              }
            >
              개인조건 AI 분석 시작
            </button>

            <p
              style={{
                marginTop: 14,
                color: "#667085",
              }}
            >
              버튼을 누른 경우에만 최대
              1회의 유료 AI 분석을
              시작합니다.
            </p>
          </div>
        ) : errorMessage ? (
          <div className="card advisorResultState advisorResultError">
            <h2>
              추천 결과를 만들지
              못했습니다.
            </h2>

            <p>
              {errorMessage}
            </p>

            <Link
              href="/advisor?category=캠핑용%20에어컨"
              className="primaryButton"
            >
              구매 가이드로 돌아가기
            </Link>
          </div>
        ) : winner ? (
          <>
            <article className="advisorWinnerCard">
              <div>
                <span className="advisorWinnerBadge">
                  1위 추천
                </span>

                <h2>
                  {
                    winner.productName
                  }
                </h2>

                <p>
                  {winner.summary}
                </p>
              </div>

              <div className="advisorWinnerScore">
                <span>
                  나와의 적합도
                </span>

                <strong>
                  {
                    winner.matchScore
                  }
                  점
                </strong>

                <small>
                  분석 신뢰도{" "}
                  {
                    winner.confidence
                  }
                  %
                </small>
              </div>
            </article>

            <div className="advisorResultInfoGrid">
              <section className="card advisorResultPanel">
                <h2>
                  왜 나에게 1위인가요?
                </h2>

                <p
                  style={{
                    margin:
                      "0 0 18px",
                    color:
                      "#667085",
                    lineHeight:
                      1.7,
                  }}
                >
                  내가 중요하게
                  선택한 기준과 실제
                  제품 평가를 함께
                  비교한 결과입니다.
                </p>

                <div
                  style={{
                    display:
                      "grid",
                    gap: 14,
                  }}
                >
                  {winnerReasons.map(
                    (
                      criterion,
                    ) => (
                      <article
                        key={
                          criterion.key
                        }
                        style={{
                          padding:
                            "15px 16px",
                          border:
                            "1px solid #e4e7ec",
                          borderRadius:
                            14,
                          background:
                            "#f8fafc",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            alignItems:
                              "center",
                            gap: 12,
                          }}
                        >
                          <strong>
                            ✓{" "}
                            {
                              criterion.label
                            }
                          </strong>

                          <span
                            style={{
                              fontWeight:
                                800,
                              whiteSpace:
                                "nowrap",
                              color:
                                "#155eef",
                            }}
                          >
                            {
                              criterion.score
                            }
                            점
                          </span>
                        </div>

                        {criterion.comparison ? (
                          <div
                            style={{
                              marginTop:
                                7,
                              fontSize:
                                13,
                              fontWeight:
                                700,
                              color:
                                "#067647",
                            }}
                          >
                            {
                              criterion.comparison
                            }
                          </div>
                        ) : null}

                        <p
                          style={{
                            margin:
                              "8px 0 0",
                            lineHeight:
                              1.65,
                            color:
                              "#475467",
                          }}
                        >
                          {
                            compactReason(
                              criterion.reason,
                            )
                          }
                        </p>

                        {criterion.reviewEvidenceCount !==
                          undefined ? (
                          <div
                            style={{
                              marginTop:
                                8,
                              fontSize:
                                13,
                              color:
                                "#667085",
                            }}
                          >
                            리뷰 근거 약{" "}
                            {
                              criterion.reviewEvidenceCount
                            }
                            건
                          </div>
                        ) : null}
                      </article>
                    ),
                  )}
                </div>

                {winner.personalPreferenceReason ? (
                  <div
                    style={{
                      marginTop:
                        16,
                      padding:
                        15,
                      borderRadius:
                        14,
                      background:
                        "#eef6ff",
                      border:
                        "1px solid #b9d8ff",
                      lineHeight:
                        1.65,
                    }}
                  >
                    <strong>
                      내가 추가한
                      조건도 반영했어요
                    </strong>

                    <p
                      style={{
                        margin:
                          "6px 0 0",
                      }}
                    >
                      {
                        winner.personalPreferenceReason
                      }
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="card advisorResultPanel">
                <h2>
                  구매 전 확인하세요
                </h2>

                {(winner.productCautions ??
                  []).length >
                0 ? (
                  <div
                    style={{
                      marginBottom:
                        18,
                    }}
                  >
                    <strong>
                      이 제품의
                      아쉬운 점
                    </strong>

                    <ul>
                      {(winner.productCautions ??
                        [])
                        .slice(
                          0,
                          3,
                        )
                        .map(
                          (
                            caution,
                          ) => (
                            <li
                              key={`product-${caution}`}
                              style={{
                                marginBottom:
                                  8,
                              }}
                            >
                              △{" "}
                              {
                                caution
                              }
                            </li>
                          ),
                        )}
                    </ul>
                  </div>
                ) : null}

                {(winner.commonCautions ??
                  []).length >
                0 ? (
                  <div>
                    <strong>
                      제품군 공통으로
                      알아둘 점
                    </strong>

                    <p
                      style={{
                        margin:
                          "6px 0 10px",
                        color:
                          "#64748b",
                      }}
                    >
                      아래 내용은 이
                      제품만의 단점이
                      아니라 비교 제품
                      여러 개에서
                      반복된
                      특성입니다.
                    </p>

                    <ul>
                      {(winner.commonCautions ??
                        [])
                        .slice(
                          0,
                          3,
                        )
                        .map(
                          (
                            caution,
                          ) => (
                            <li
                              key={`common-${caution.title}-${caution.description}`}
                              style={{
                                marginBottom:
                                  12,
                              }}
                            >
                              ℹ{" "}
                              <strong>
                                {
                                  caution.title
                                }
                              </strong>

                              {caution.description
                                ? ` — ${caution.description}`
                                : ""}

                              {caution.affectedCount >
                              0 ? (
                                <div
                                  style={{
                                    marginTop:
                                      4,
                                    color:
                                      "#64748b",
                                    fontSize:
                                      13,
                                  }}
                                >
                                  비교한{" "}
                                  {
                                    caution.affectedCount
                                  }
                                  개
                                  제품에서
                                  공통적으로
                                  확인
                                </div>
                              ) : null}
                            </li>
                          ),
                        )}
                    </ul>
                  </div>
                ) : null}

                {(winner.productCautions ??
                  []).length ===
                  0 &&
                (winner.commonCautions ??
                  []).length ===
                  0 ? (
                  <p>
                    리뷰 분석에서
                    반복적으로 확인된
                    주의점이 없습니다.
                  </p>
                ) : null}
              </section>
            </div>

            {winnerSpecs.length >
            0 ? (
              <section
                className="card"
                style={{
                  marginTop: 22,
                  padding: 26,
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    gap: 20,
                    alignItems:
                      "flex-end",
                    flexWrap:
                      "wrap",
                  }}
                >
                  <div>
                    <span className="eyebrow">
                      PRODUCT
                      FACTS
                    </span>

                    <h2
                      style={{
                        margin:
                          "6px 0 0",
                      }}
                    >
                      1위 제품 핵심
                      스펙 비교
                    </h2>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      color:
                        "#667085",
                      fontSize:
                        14,
                    }}
                  >
                    상세페이지에서
                    실제 확인된
                    정보만
                    표시합니다.
                  </p>
                </div>

                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginTop:
                      20,
                  }}
                >
                  {winnerSpecs.map(
                    (
                      spec,
                      index,
                    ) => (
                      <article
                        key={`${spec.name}-${index}`}
                        style={{
                          padding:
                            17,
                          border:
                            "1px solid #e4e7ec",
                          borderRadius:
                            14,
                          background:
                            "#fff",
                        }}
                      >
                        <span
                          style={{
                            display:
                              "block",
                            color:
                              "#667085",
                            fontSize:
                              13,
                          }}
                        >
                          {
                            spec.name
                          }
                        </span>

                        <strong
                          style={{
                            display:
                              "block",
                            marginTop:
                              6,
                            fontSize:
                              20,
                          }}
                        >
                          {
                            spec.value
                          }
                        </strong>

                        {spec.comparison ? (
                          <span
                            style={{
                              display:
                                "block",
                              marginTop:
                                8,
                              color:
                                "#155eef",
                              fontSize:
                                13,
                              fontWeight:
                                700,
                            }}
                          >
                            {
                              spec.comparison
                            }
                          </span>
                        ) : (
                          <span
                            style={{
                              display:
                                "block",
                              marginTop:
                                8,
                              color:
                                "#98a2b3",
                              fontSize:
                                13,
                            }}
                          >
                            다른 제품과
                            동일 항목
                            비교자료 부족
                          </span>
                        )}
                      </article>
                    ),
                  )}
                </div>
              </section>
            ) : null}

            {interpretedPreferences.length >
            0 ? (
              <section className="card advisorPriorityEvidence">
                <div>
                  <span className="eyebrow">
                    맞춤 조건
                  </span>

                  <h2>
                    내가 추가한 조건
                  </h2>
                </div>

                <div className="advisorCriteriaGrid">
                  {interpretedPreferences.map(
                    (
                      preference,
                    ) => (
                      <article
                        key={
                          preference
                        }
                      >
                        <span>
                          {
                            preference
                          }
                        </span>
                      </article>
                    ),
                  )}
                </div>
              </section>
            ) : null}

            <section className="card advisorPriorityEvidence">
              <div>
                <span className="eyebrow">
                  PERSONALIZED
                  PRIORITIES
                </span>

                <h2>
                  내 선택 기준
                </h2>
              </div>

              <div className="advisorCriteriaGrid">
                {topCriteria.map(
                  (
                    criterion,
                  ) => (
                    <article
                      key={
                        criterion.key
                      }
                    >
                      <span>
                        {
                          criterion.label
                        }
                      </span>

                      <strong>
                        {
                          criterion.weight
                        }
                        /10
                      </strong>
                    </article>
                  ),
                )}
              </div>
            </section>

            <section
              className="card"
              style={{
                marginTop: 22,
                marginBottom: 30,
                padding: 22,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 18,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong
                    style={{
                      display: "block",
                      fontSize: 17,
                    }}
                  >
                    {winner.productName}
                  </strong>

                  <span
                    style={{
                      display: "block",
                      marginTop: 5,
                      color: "#667085",
                      fontSize: 14,
                    }}
                  >
                    1위 추천 제품의 상세 평가를 확인하거나
                    상품 페이지로 이동할 수 있습니다.
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() =>
                      setExpandedId(
                        expandedId === winner.id
                          ? ""
                          : winner.id,
                      )
                    }
                  >
                    {expandedId === winner.id
                      ? "세부 점수 닫기"
                      : "세부 점수 보기"}
                  </button>

                  <a
                    href={winner.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="primaryButton"
                  >
                    구매하러 가기 →
                  </a>
                </div>
              </div>

              {expandedId === winner.id ? (
                <div
                  style={{
                    marginTop: 20,
                    paddingTop: 20,
                    borderTop: "1px solid #e4e7ec",
                  }}
                >
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 16,
                      borderRadius: 16,
                      border: "1px solid #dbe4f0",
                      background: "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 8,
                        lineHeight: 1.5,
                      }}
                    >
                      <span>
                        기본 적합도{" "}
                        <b>
                          {winner.baseMatchScore ??
                            winner.matchScore}
                          점
                        </b>
                      </span>

                      {typeof winner.personalAdjustment ===
                        "number" &&
                      winner.personalPreferenceScore !==
                        null &&
                      winner.personalPreferenceScore !==
                        undefined ? (
                        <>
                          <span>→</span>

                          <span>
                            추가 조건 반영{" "}
                            <b>
                              {winner.personalAdjustment >= 0
                                ? "+"
                                : ""}
                              {winner.personalAdjustment}점
                            </b>
                          </span>
                        </>
                      ) : null}

                      {typeof winner.budgetPenalty ===
                        "number" &&
                      winner.budgetPenalty > 0 ? (
                        <>
                          <span>→</span>

                          <span>
                            예산 초과{" "}
                            <b>
                              -{winner.budgetPenalty}점
                            </b>
                          </span>
                        </>
                      ) : null}

                      <span>→</span>

                      <span>
                        최종 순위 점수{" "}
                        <b>
                          {getRankingScore(winner)}
                          점
                        </b>
                      </span>
                    </div>

                    {winner.personalPreferenceReason ? (
                      <p
                        style={{
                          margin: "10px 0 0",
                          color: "#667085",
                          fontSize: 13,
                        }}
                      >
                        추가 조건:{" "}
                        {winner.personalPreferenceReason}
                      </p>
                    ) : null}

                    {winner.budgetReason ? (
                      <p
                        style={{
                          margin: "6px 0 0",
                          color: "#667085",
                          fontSize: 13,
                        }}
                      >
                        {winner.budgetReason}
                      </p>
                    ) : null}
                  </div>

                  <div className="advisorBreakdownTable">
                    {winner.criterionBreakdown.map(
                      (criterion) => (
                        <div key={criterion.key}>
                          <span>
                            {criterion.label}
                          </span>

                          <b>
                            {criterionScoreLabel(criterion)}
                          </b>

                          {criterion.imputed === true && criterion.score === null && criterion.effectiveScore !== null ? (
                            <small>이 제품의 직접 점수가 없어 현재 후보군의 해당 기준 평균을 사용했습니다.</small>
                          ) : null}
                          <small>
                            중요도{" "}
                            {criterion.weight}/10
                            {criterion.score !== null
                              ? " · 최종 추천 점수에 반영"
                              : ""}
                          </small>

                          {typeof criterion.reviewEvidenceCount ===
                          "number" ? (
                            <div
                              style={{
                                gridColumn: "1 / -1",
                                marginTop: 8,
                                paddingTop: 8,
                                borderTop:
                                  "1px solid #eef2f6",
                              }}
                            >
                              <small
                                style={{
                                  display: "block",
                                  color:
                                    criterion.reviewEvidenceCount >
                                    0
                                      ? "#344054"
                                      : "#98a2b3",
                                  fontWeight: 600,
                                }}
                              >
                                리뷰 근거 약{" "}
                                {
                                  criterion.reviewEvidenceCount
                                }
                                건
                              </small>

                              {criterion.evidenceSummary ? (
                                <p
                                  style={{
                                    margin: "4px 0 0",
                                    color: "#667085",
                                    fontSize: 13,
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {
                                    criterion.evidenceSummary
                                  }
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="advisorRankingSection">
              <div className="advisorRankingHeading">
                <div>
                  <span className="eyebrow">
                    RANKING
                  </span>

                  <h2>
                    전체 제품 추천
                    순위
                  </h2>
                </div>

                <p>
                  {note}
                </p>
              </div>

              <div className="advisorRankingList">
                {recommendations.slice(1).map(
                  (item) => {
                    const expanded =
                      expandedId ===
                      item.id;

                    const rankCautions =
                      getRankCardCautions(
                        item,
                      );

                    return (
                      <article
                        className="advisorRankCard"
                        key={
                          item.id
                        }
                      >
                        <div className="advisorRankMain">
                          <div className="advisorRankNumber">
                            {
                              item.rank
                            }
                          </div>

                          <div className="advisorRankContent">
                            <h3>
                              {
                                item.productName
                              }
                            </h3>

                            <p>
                              {
                                item.summary
                              }
                            </p>

                            <div className="advisorRankMeta">
                              <span>
                                리뷰{" "}
                                {
                                  item.reviewCount
                                }
                                개 분석
                              </span>

                              <span>
                                분석 데이터
                                반영{" "}
                                {
                                  item.dataCoverage
                                }
                                %
                              </span>


                              {typeof item.productPrice ===
                                "number" &&
                              Number.isFinite(
                                item.productPrice,
                              ) &&
                              item.productPrice > 0 ? (
                                <span>
                                  가격{" "}
                                  <b>
                                    {formatPrice(
                                      item.productPrice,
                                    )}
                                  </b>
                                </span>
                              ) : null}
                            </div>

                            {rankCautions.length > 0 ? (
                              <p
                                style={{
                                  margin:
                                    "8px 0 0",
                                  color:
                                    "#667085",
                                  fontSize:
                                    13,
                                  lineHeight:
                                    1.6,
                                }}
                              >
                                <strong>
                                  구매 전 확인:{" "}
                                </strong>
                                {rankCautions.join(
                                  " ? ",
                                )}
                              </p>
                            ) : null}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 14,
                              flexWrap: "wrap",
                              justifyContent: "flex-end",
                            }}
                          >
                            <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  }}
>
  {item.valueRank === 1 ? (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        background: "#ECFDF3",
        color: "#067647",
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      가성비 1위
      {typeof item.valueScore === "number"
        ? ` · ${item.valueScore}점`
        : ""}
    </span>
  ) : null}

  <div className="advisorRankScore">
    <strong>
      {item.matchScore}
    </strong>

    <span>
      점
    </span>
  </div>
</div>

                            <a
                              href={
                                item.sourceUrl
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="primaryButton"
                              style={{
                                whiteSpace: "nowrap",
                              }}
                            >
                              구매하러 가기 →
                            </a>
                          </div>
                        </div>

                        <div className="advisorRankActions">
                          <button
                            type="button"
                            className="secondaryButton"
                            onClick={() =>
                              setExpandedId(
                                expanded
                                  ? ""
                                  : item.id,
                              )
                            }
                          >
                            {expanded
                              ? "세부 점수 닫기"
                              : "세부 점수 보기"}
                          </button>
                        </div>

                        {expanded ? (
                          <div>
                            <div
                              style={{
                                marginTop:
                                  18,
                                marginBottom:
                                  14,
                                padding:
                                  16,
                                borderRadius:
                                  16,
                                border:
                                  "1px solid #dbe4f0",
                                background:
                                  "#f8fafc",
                              }}
                            >
                              <strong
                                style={{
                                  display:
                                    "block",
                                  marginBottom:
                                    12,
                                  fontSize:
                                    15,
                                }}
                              >
                                내게 맞는 점수
                                산정
                              </strong>

                              <div
                                style={{
                                  display:
                                    "flex",
                                  flexWrap:
                                    "wrap",
                                  alignItems:
                                    "center",
                                  gap: 8,
                                  lineHeight:
                                    1.5,
                                }}
                              >
                                <span>
                                  기본 적합도{" "}
                                  <b>
                                    {
                                      item.baseMatchScore ??
                                      item.matchScore
                                    }
                                    점
                                  </b>
                                </span>

                                {typeof item.personalAdjustment ===
                                  "number" &&
                                item.personalPreferenceScore !==
                                  null &&
                                item.personalPreferenceScore !==
                                  undefined ? (
                                  <>
                                    <span>
                                      →
                                    </span>

                                    <span>
                                      추가 조건
                                      반영{" "}
                                      <b>
                                        {item.personalAdjustment >=
                                        0
                                          ? "+"
                                          : ""}
                                        {
                                          item.personalAdjustment
                                        }
                                        점
                                      </b>
                                    </span>
                                  </>
                                ) : null}

                                {typeof item.budgetPenalty ===
                                  "number" &&
                                item.budgetPenalty >
                                  0 ? (
                                  <>
                                    <span>
                                      →
                                    </span>

                                    <span>
                                      예산 초과{" "}
                                      <b>
                                        -
                                        {
                                          item.budgetPenalty
                                        }
                                        점
                                      </b>
                                    </span>
                                  </>
                                ) : null}

                                <span>
                                  →
                                </span>

                                <span>
                                  최종 순위 점수{" "}
                                  <b>
                                    {getRankingScore(item)}
                                    점
                                  </b>
                                </span>
                              </div>

                              {item.budgetReason ? (
                                <p
                                  style={{
                                    margin:
                                      "10px 0 0",
                                    color:
                                      "#667085",
                                    fontSize:
                                      13,
                                  }}
                                >
                                  {
                                    item.budgetReason
                                  }
                                </p>
                              ) : null}

                              {item.personalPreferenceReason ? (
                                <p
                                  style={{
                                    margin:
                                      "6px 0 0",
                                    color:
                                      "#667085",
                                    fontSize:
                                      13,
                                  }}
                                >
                                  추가 조건:{" "}
                                  {
                                    item.personalPreferenceReason
                                  }
                                </p>
                              ) : null}

                              <p
                                style={{
                                  margin:
                                    "8px 0 0",
                                  color:
                                    "#98a2b3",
                                  fontSize:
                                    12,
                                }}
                              >
                                각 기준
                                점수에 내가
                                설정한
                                중요도를
                                반영한 뒤,
                                추가 조건과
                                예산 조건을
                                적용해 최종
                                점수를
                                계산합니다.
                              </p>
                            </div>

                            <div className="advisorBreakdownTable">
                              {item.criterionBreakdown.map(
                                (
                                  criterion,
                                ) => (
                                  <div
                                    key={
                                      criterion.key
                                    }
                                  >
                                    <span>
                                      {
                                        criterion.label
                                      }
                                    </span>

                                    <b>
                                      {criterionScoreLabel(criterion)}
                                    </b>

                                    {criterion.imputed === true && criterion.score === null && criterion.effectiveScore !== null ? (
                            <small>이 제품의 직접 점수가 없어 현재 후보군의 해당 기준 평균을 사용했습니다.</small>
                          ) : null}
                          <small>
                                      중요도{" "}
                                      {
                                        criterion.weight
                                      }
                                      /10
                                      {criterion.score !==
                                      null
                                        ? " · 최종 추천 점수에 반영"
                                        : ""}
                                    </small>

                                    {typeof criterion.reviewEvidenceCount ===
                                    "number" ? (
                                      <div
                                        style={{
                                          gridColumn:
                                            "1 / -1",
                                          marginTop:
                                            8,
                                          paddingTop:
                                            8,
                                          borderTop:
                                            "1px solid #eef2f6",
                                        }}
                                      >
                                        <small
                                          style={{
                                            display:
                                              "block",
                                            color:
                                              criterion.reviewEvidenceCount >
                                              0
                                                ? "#344054"
                                                : "#98a2b3",
                                            fontWeight:
                                              600,
                                          }}
                                        >
                                          리뷰 근거 약{" "}
                                          {
                                            criterion.reviewEvidenceCount
                                          }
                                          건
                                        </small>

                                        {criterion.evidenceSummary ? (
                                          <p
                                            style={{
                                              margin:
                                                "4px 0 0",
                                              color:
                                                "#667085",
                                              fontSize:
                                                13,
                                              lineHeight:
                                                1.5,
                                            }}
                                          >
                                            {
                                              criterion.evidenceSummary
                                            }
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  },
                )}
              </div>
            </section>

            <div className="advisorResultActions">
              <Link
                href="/advisor?category=캠핑용%20에어컨"
                className="secondaryButton"
              >
                중요도 다시 설정
              </Link>

              {selectionForReentry ? (
                <Link
                  href={`/advisor/questions?${new URLSearchParams({
                    category: selectionForReentry.category,
                    runId: selectionForReentry.runId,
                  }).toString()}`}
                  className="primaryButton"
                >
                  질문 다시 답하기
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}






