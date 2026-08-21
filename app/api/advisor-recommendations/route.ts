import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecommendationRequest = {
  category?: unknown;
  weights?: unknown;
  budgetChoice?: unknown;
  personalProductScores?: unknown;
};

type PersonalProductScore = {
  score: number;
  reason: string;
};

type ScoreMap = Record<string, number | null>;

type ReviewPoint = {
  topic?: string;
  summary?: string;
  evidenceCount?: number;
};

type CriterionEvidence = {
  reviewEvidenceCount?: number;
  summary?: string;
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
  criterionEvidence?: Record<string, CriterionEvidence>;
};

type KeySpec = {
  name?: string;
  value?: string;
  evidence?: string;
  source?: string;
};

type ProductDetailAnalysis = {
  price?: unknown;
  keySpecs?: KeySpec[];
  [key: string]: unknown;
};

type ProductRow = {
  id: string;
  category: string;
  product_name: string;
  source_url: string;
  review_analysis: ReviewAnalysis | null;
  criterion_scores: ScoreMap | null;
  market_metrics: Record<string, unknown> | null;
  product_detail_analysis?: ProductDetailAnalysis | null;
};

type ProfileCriterion = {
  key?: string;
  label?: string;
  defaultWeight?: number;
};

function normalizeText(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeWeights(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {} as Record<string, number>;
  }

  const result: Record<string, number> = {};

  for (const [key, raw] of Object.entries(value)) {
    const numberValue = Number(raw);

    if (Number.isFinite(numberValue)) {
      result[key] = Math.max(
        0,
        Math.min(10, numberValue),
      );
    }
  }

  return result;
}

function normalizePersonalScores(value: unknown) {
  const result =
    new Map<string, PersonalProductScore>();

  if (!Array.isArray(value)) {
    return result;
  }

  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const row =
      item as Record<string, unknown>;

    const productId =
      normalizeText(row.productId);

    const score = Number(row.score);
    const reason =
      normalizeText(row.reason);

    if (
      productId &&
      Number.isFinite(score)
    ) {
      result.set(productId, {
        score: Math.max(
          0,
          Math.min(
            100,
            Math.round(score),
          ),
        ),
        reason,
      });
    }
  }

  return result;
}

type BudgetRule =
  | { kind: "none" }
  | { kind: "max"; max: number }
  | { kind: "min"; min: number }
  | {
      kind: "range";
      min: number;
      max: number;
    };

function parseBudgetChoice(
  value: unknown,
): BudgetRule {
  const choice = normalizeText(value);

  if (
    !choice ||
    choice === "no_limit"
  ) {
    return { kind: "none" };
  }

  const upTo =
    choice.match(/^up_to_(\d+)$/);

  if (upTo) {
    return {
      kind: "max",
      max: Number(upTo[1]),
    };
  }

  const over =
    choice.match(/^over_(\d+)$/);

  if (over) {
    return {
      kind: "min",
      min: Number(over[1]),
    };
  }

  const range =
    choice.match(/^(\d+)_(\d+)$/);

  if (range) {
    const first = Number(range[1]);
    const second = Number(range[2]);

    return {
      kind: "range",
      min: Math.min(
        first,
        second,
      ),
      max: Math.max(
        first,
        second,
      ),
    };
  }

  return { kind: "none" };
}

function numericPrice(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  ) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned =
      value.replace(/[^\d.]/g, "");

    const parsed = Number(cleaned);

    if (
      Number.isFinite(parsed) &&
      parsed > 0
    ) {
      return parsed;
    }
  }

  return null;
}

function findPriceInObject(
  value: unknown,
  depth = 0,
): number | null {
  if (
    !value ||
    typeof value !== "object" ||
    depth > 3
  ) {
    return null;
  }

  const row =
    value as Record<string, unknown>;

  const preferredKeys = [
    "price",
    "salePrice",
    "sale_price",
    "finalPrice",
    "final_price",
    "currentPrice",
    "current_price",
    "sellingPrice",
    "selling_price",
    "productPrice",
    "product_price",
    "priceValue",
    "price_value",
  ];

  for (const key of preferredKeys) {
    if (key in row) {
      const price =
        numericPrice(row[key]);

      if (price !== null) {
        return price;
      }
    }
  }

  for (const [key, item] of Object.entries(row)) {
    if (
      /price|가격|판매가|할인가/i.test(key)
    ) {
      const price =
        numericPrice(item);

      if (price !== null) {
        return price;
      }
    }
  }

  for (const item of Object.values(row)) {
    if (
      item &&
      typeof item === "object"
    ) {
      const nested =
        findPriceInObject(
          item,
          depth + 1,
        );

      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
}

function getProductPrice(
  product: ProductRow,
) {
  const detail =
    product.product_detail_analysis;

  /*
    Bright Data에서 확보한 실제 판매가를
    반드시 최우선으로 사용한다.

    현재 Project D 저장 구조:
    product_detail_analysis.price.finalPrice
  */
  if (
    detail &&
    typeof detail === "object" &&
    !Array.isArray(detail)
  ) {
    const detailRow =
      detail as Record<
        string,
        unknown
      >;

    const priceValue =
      detailRow.price;

    if (
      priceValue &&
      typeof priceValue ===
        "object" &&
      !Array.isArray(
        priceValue,
      )
    ) {
      const priceRow =
        priceValue as Record<
          string,
          unknown
        >;

      const preferredFinalKeys = [
        "finalPrice",
        "final_price",
        "actualPurchasePrice",
        "actual_purchase_price",
        "salePrice",
        "sale_price",
        "currentPrice",
        "current_price",
      ];

      for (
        const key of
        preferredFinalKeys
      ) {
        const price =
          numericPrice(
            priceRow[key],
          );

        if (
          price !== null
        ) {
          return price;
        }
      }
    }

    /*
      혹시 향후 finalPrice가
      price 객체 밖에 저장되는 경우도 대응.
    */
    const directFinalKeys = [
      "finalPrice",
      "final_price",
      "actualPurchasePrice",
      "actual_purchase_price",
      "salePrice",
      "sale_price",
      "currentPrice",
      "current_price",
    ];

    for (
      const key of
      directFinalKeys
    ) {
      const price =
        numericPrice(
          detailRow[key],
        );

      if (
        price !== null
      ) {
        return price;
      }
    }
  }

  /*
    실제 판매가가 없는 예전 데이터만
    기존 범용 가격 탐색으로 fallback.
  */
  return (
    findPriceInObject(
      product.product_detail_analysis,
    ) ??
    findPriceInObject(
      product.market_metrics,
    )
  );
}

function getProductKeySpecs(
  product: ProductRow,
) {
  const raw =
    product.product_detail_analysis
      ?.keySpecs;

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return null;
      }

      const name =
        normalizeText(item.name);

      const value =
        normalizeText(item.value);

      const evidence =
        normalizeText(item.evidence);

      const source =
        normalizeText(item.source);

      if (!name || !value) {
        return null;
      }

      return {
        name,
        value,
        evidence,
        source,
      };
    })
    .filter(
      (
        item,
      ): item is {
        name: string;
        value: string;
        evidence: string;
        source: string;
      } => item !== null,
    )
    .slice(0, 30);
}

function budgetAdjustment(
  price: number | null,
  rule: BudgetRule,
) {
  if (rule.kind === "none") {
    return {
      penalty: 0,
      reason: "",
    };
  }

  if (price === null) {
    return {
      penalty: 0,
      reason:
        "현재 저장된 가격 정보가 없어 예산 감점은 적용하지 않았습니다.",
    };
  }

  let upperLimit:
    | number
    | null = null;

  if (rule.kind === "max") {
    upperLimit = rule.max;
  }

  if (rule.kind === "range") {
    upperLimit = rule.max;
  }

  if (
    upperLimit !== null &&
    price > upperLimit
  ) {
    const ratio =
      price /
      Math.max(1, upperLimit);

    let penalty = 0;

    if (ratio <= 1.1) {
      penalty = 5;
    } else if (ratio <= 1.25) {
      penalty = 10;
    } else if (ratio <= 1.5) {
      penalty = 18;
    } else if (ratio <= 2) {
      penalty = 28;
    } else if (ratio <= 3) {
      penalty = 38;
    } else {
      penalty = 50;
    }

    return {
      penalty,
      reason:
        `확인 가격 약 ${Math.round(
          price / 10000,
        )}만원으로 선택 예산 상한 ${Math.round(
          upperLimit / 10000,
        )}만원을 초과해 ${penalty}점 감점했습니다.`,
    };
  }

  return {
    penalty: 0,
    reason: "",
  };
}

function isUsableScore(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

function firstSentences(
  values: unknown,
  limit: number,
) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter(
      (
        value,
      ): value is string =>
        typeof value === "string",
    )
    .map((value) =>
      value.trim(),
    )
    .filter(Boolean)
    .slice(0, limit);
}

function pointSummaries(
  values: unknown,
  limit: number,
) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => {
      if (
        !value ||
        typeof value !== "object"
      ) {
        return "";
      }

      const point =
        value as ReviewPoint;

      return [
        point.topic,
        point.summary,
      ]
        .filter(Boolean)
        .join(": ");
    })
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeIssueText(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /[0-9]+(?:\.[0-9]+)?/g,
      " ",
    )
    .replace(
      /[^\p{L}\s]/gu,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function issueTokens(
  value: string,
) {
  const stopWords =
    new Set([
      "제품",
      "사용",
      "경우",
      "수준",
      "정도",
      "필요",
      "있음",
      "있습니다",
      "있어요",
      "가능",
      "관련",
      "후기",
      "의견",
      "문제",
      "부분",
      "다소",
      "추가",
      "전체",
    ]);

  return normalizeIssueText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 2 &&
        !stopWords.has(token),
    );
}

function issuesAreSimilar(
  a: string,
  b: string,
) {
  const aTokens =
    issueTokens(a);

  const bTokens =
    issueTokens(b);

  if (
    aTokens.length === 0 ||
    bTokens.length === 0
  ) {
    return false;
  }

  const bSet =
    new Set(bTokens);

  const overlap =
    aTokens.filter((token) =>
      bSet.has(token),
    ).length;

  const denominator =
    Math.max(
      1,
      Math.min(
        aTokens.length,
        bTokens.length,
      ),
    );

  return (
    overlap / denominator >=
    0.45
  );
}

function rawProductCautions(
  product: ProductRow,
) {
  return [
    ...firstSentences(
      product.review_analysis
        ?.cautions,
      3,
    ),
    ...pointSummaries(
      product.review_analysis
        ?.negativePoints,
      3,
    ),
  ]
    .map((value) =>
      value.trim(),
    )
    .filter(Boolean)
    .filter(
      (
        value,
        index,
        array,
      ) =>
        array.indexOf(value) ===
        index,
    );
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as RecommendationRequest;

    const category =
      normalizeText(body.category);

    const weights =
      normalizeWeights(body.weights);

    const budgetRule =
      parseBudgetChoice(
        body.budgetChoice,
      );

    const personalScores =
      normalizePersonalScores(
        body.personalProductScores,
      );

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message:
            "카테고리가 필요합니다.",
        },
        { status: 400 },
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("category_profiles")
      .select(
        "criteria, common_cautions",
      )
      .eq(
        "category",
        category,
      )
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    const labelMap =
      new Map<string, string>();

    const defaultWeightMap =
      new Map<string, number>();

    if (
      Array.isArray(
        profile?.criteria,
      )
    ) {
      for (
        const item of
        profile.criteria as ProfileCriterion[]
      ) {
        const key =
          normalizeText(
            item.key,
          );

        const label =
          normalizeText(
            item.label,
          );

        const defaultWeight =
          Math.max(
            0,
            Math.min(
              10,
              Number(
                item.defaultWeight ??
                  0,
              ),
            ),
          );

        if (key && label) {
          labelMap.set(
            key,
            label,
          );
        }

        if (
          key &&
          Number.isFinite(
            defaultWeight,
          ) &&
          defaultWeight > 0
        ) {
          defaultWeightMap.set(
            key,
            defaultWeight,
          );
        }
      }
    }

    /*
      프론트에서 개인화된 weights가 오면 그것을 사용하고,
      없으면 category profile의 defaultWeight를 사용한다.
    */
    const activeWeights =
      (
        Object.keys(weights).length > 0
          ? Object.entries(weights)
          : Array.from(
              defaultWeightMap.entries(),
            )
      ).filter(
        ([, value]) =>
          value > 0,
      );

    if (
      activeWeights.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "추천 기준 중요도가 비어 있습니다.",
        },
        { status: 400 },
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from("products")
      .select(
        "id, category, product_name, source_url, review_analysis, criterion_scores, market_metrics, product_detail_analysis",
      )
      .eq(
        "category",
        category,
      )
      .not(
        "review_analysis",
        "is",
        null,
      );

    if (error) {
      throw error;
    }

    const rows =
      (data ?? []) as ProductRow[];

    const savedCommonCautions =
      Array.isArray(
        profile?.common_cautions,
      )
        ? (profile.common_cautions as Array<
            Record<
              string,
              unknown
            >
          >)
        : [];

    /*
      null 점수는 계산에서 제외하지 않는다.
      먼저 현재 후보군에서 기준별 평균을 계산하고,
      해당 제품의 점수가 없을 때 그 평균을 중립값으로 사용한다.
    */
    const criterionAverages =
      new Map<string, number>();

    for (
      const [key] of activeWeights
    ) {
      const validScores =
        rows
          .map((product) =>
            product.criterion_scores?.[
              key
            ],
          )
          .filter(
            (
              score,
            ): score is number =>
              isUsableScore(
                score,
              ),
          );

      if (
        validScores.length > 0
      ) {
        criterionAverages.set(
          key,
          validScores.reduce(
            (sum, score) =>
              sum + score,
            0,
          ) /
            validScores.length,
        );
      }
    }

    const scoredRecommendations =
      rows
        .map((product) => {
          const scores =
            product.criterion_scores ??
            {};

          let weightedTotal = 0;
          let usedWeightTotal = 0;
          let requestedWeightTotal =
            0;

          const criterionBreakdown:
            Array<{
              key: string;
              label: string;
              score:
                | number
                | null;
              effectiveScore:
                | number
                | null;
              imputed: boolean;
              criterionAverage:
                | number
                | null;
              weight: number;
              contribution:
                | number
                | null;
              reason: string;
              reviewEvidenceCount: number;
              evidenceSummary: string;
            }> = [];

          const reasonsMap =
            product.review_analysis
              ?.criterionReasons ??
            product.review_analysis
              ?.criterion_reasons ??
            {};

          const evidenceMap =
            product.review_analysis
              ?.criterionEvidence ??
            {};

          for (
            const [
              key,
              weight,
            ] of activeWeights
          ) {
            requestedWeightTotal +=
              weight;

            const rawScore =
              scores[key];

            const score =
              isUsableScore(
                rawScore,
              )
                ? rawScore
                : null;

            const averageScore =
              criterionAverages.get(
                key,
              ) ?? null;

            const effectiveScore =
              score ??
              averageScore;

            if (
              effectiveScore !== null
            ) {
              weightedTotal +=
                effectiveScore *
                weight;

              usedWeightTotal +=
                weight;
            }

            criterionBreakdown.push(
              {
                key,
                label:
                  labelMap.get(
                    key,
                  ) ?? key,
                score,
                effectiveScore:
                  effectiveScore !==
                  null
                    ? Number(
                        effectiveScore.toFixed(
                          1,
                        ),
                      )
                    : null,
                imputed:
                  score === null &&
                  effectiveScore !==
                    null,
                criterionAverage:
                  averageScore !==
                  null
                    ? Number(
                        averageScore.toFixed(
                          1,
                        ),
                      )
                    : null,
                weight,
                contribution:
                  effectiveScore !==
                  null
                    ? Number(
                        (
                          effectiveScore *
                          weight
                        ).toFixed(
                          1,
                        ),
                      )
                    : null,
                reason:
                  typeof reasonsMap[
                    key
                  ] ===
                  "string"
                    ? reasonsMap[
                        key
                      ]
                    : "현재 리뷰 분석에서 별도 설명이 저장되지 않았습니다.",
                reviewEvidenceCount:
                  Math.max(
                    0,
                    Math.round(
                      Number(
                        evidenceMap[
                          key
                        ]
                          ?.reviewEvidenceCount ??
                          0,
                      ),
                    ),
                  ),
                evidenceSummary:
                  typeof evidenceMap[
                    key
                  ]?.summary ===
                  "string"
                    ? evidenceMap[
                        key
                      ]?.summary?.trim() ??
                      ""
                    : "",
              },
            );
          }

          if (
            usedWeightTotal === 0
          ) {
            return null;
          }

          const knownWeightTotal =
            criterionBreakdown.reduce(
              (sum, item) =>
                item.score !== null
                  ? sum +
                    item.weight
                  : sum,
              0,
            );

          const imputedWeightTotal =
            criterionBreakdown.reduce(
              (sum, item) =>
                item.imputed
                  ? sum +
                    item.weight
                  : sum,
              0,
            );

          const baseMatchScore =
            Math.round(
              weightedTotal /
                usedWeightTotal,
            );

          const personal =
            personalScores.get(
              product.id,
            );

          const blendedMatchScore =
            personal
              ? Math.round(
                  baseMatchScore *
                    0.75 +
                    personal.score *
                      0.25,
                )
              : baseMatchScore;

          const productPrice =
            getProductPrice(
              product,
            );

          const budget =
            budgetAdjustment(
              productPrice,
              budgetRule,
            );

          /*
            성능/개인화 점수와 가격은 분리한다.
            budgetPenalty은 표시용으로 유지하지만
            matchScore에서는 차감하지 않는다.
          */
          const matchScore =
            Math.max(
              0,
              Math.min(
                100,
                blendedMatchScore,
              ),
            );

          const dataCoverage =
            Math.round(
              (knownWeightTotal /
                Math.max(
                  1,
                  requestedWeightTotal,
                )) *
                100,
            );

          const reviewConfidence =
            Number(
              product.review_analysis
                ?.confidenceScore ??
                0,
            );

          const confidence =
            Math.round(
              dataCoverage *
                0.7 +
                Math.max(
                  0,
                  Math.min(
                    100,
                    reviewConfidence,
                  ),
                ) *
                  0.3,
            );

          const strongest =
            [
              ...criterionBreakdown,
            ]
              .filter(
                (item) =>
                  item.effectiveScore !==
                  null,
              )
              .sort(
                (a, b) =>
                  (b.effectiveScore ??
                    0) *
                    b.weight -
                  (a.effectiveScore ??
                    0) *
                    a.weight,
              )
              .slice(0, 3);

          const weakest =
            [
              ...criterionBreakdown,
            ]
              .filter(
                (item) =>
                  item.effectiveScore !==
                  null,
              )
              .sort(
                (a, b) =>
                  (a.effectiveScore ??
                    0) -
                  (b.effectiveScore ??
                    0),
              )
              .slice(0, 2);

          const productName =
            product.product_name.trim();

          const commonCautions =
            savedCommonCautions
              .filter(
                (item) => {
                  const affected =
                    Array.isArray(
                      item.affectedProducts,
                    )
                      ? item.affectedProducts
                      : [];

                  return affected.some(
                    (name) =>
                      typeof name ===
                        "string" &&
                      name
                        .trim()
                        .toLowerCase() ===
                        productName.toLowerCase(),
                  );
                },
              )
              .map(
                (item) => {
                  const title =
                    normalizeText(
                      item.title,
                    );

                  const description =
                    normalizeText(
                      item.description,
                    );

                  const affectedCount =
                    Number(
                      item.affectedCount ??
                        0,
                    );

                  const affectedProducts =
                    Array.isArray(
                      item.affectedProducts,
                    )
                      ? item.affectedProducts.filter(
                          (
                            name,
                          ): name is string =>
                            typeof name ===
                              "string" &&
                            Boolean(
                              name.trim(),
                            ),
                        )
                      : [];

                  return {
                    title,
                    description,
                    affectedCount:
                      Number.isFinite(
                        affectedCount,
                      )
                        ? affectedCount
                        : 0,
                    affectedProducts,
                  };
                },
              )
              .filter(
                (item) =>
                  item.title ||
                  item.description,
              )
              .slice(0, 3);

          const rawCautions =
            rawProductCautions(
              product,
            );

          const productCautions =
            rawCautions
              .filter(
                (issue) =>
                  !commonCautions.some(
                    (
                      commonIssue,
                    ) =>
                      issuesAreSimilar(
                        issue,
                        [
                          commonIssue.title,
                          commonIssue.description,
                        ]
                          .filter(
                            Boolean,
                          )
                          .join(
                            " ",
                          ),
                      ),
                  ),
              )
              .slice(0, 3);

          return {
            id: product.id,
            productName:
              product.product_name,
            sourceUrl:
              product.source_url,

            matchScore,
            baseMatchScore,
            blendedMatchScore,

            personalAdjustment:
              blendedMatchScore -
              baseMatchScore,

            confidence,
            dataCoverage,
            requestedWeightTotal,
            knownWeightTotal,
            imputedWeightTotal,

            reviewCount:
              Number(
                product.review_analysis
                  ?.reviewCount ??
                  0,
              ),

            summary:
              product.review_analysis
                ?.summary ??
              "리뷰 분석 요약이 없습니다.",

            personalPreferenceScore:
              personal?.score ??
              null,

            personalPreferenceReason:
              personal?.reason ??
              "",

            productPrice,

            keySpecs:
              getProductKeySpecs(
                product,
              ),

            budgetPenalty:
              budget.penalty,

            budgetReason:
              budget.reason,

            recommendationReasons:
              [
                ...(personal?.reason
                  ? [
                      personal.reason
                        .replace(
                          /\([^)]*[a-zA-Z_][^)]*\)/g,
                          "",
                        )
                        .replace(
                          /\b[a-zA-Z_]{3,}\s*\d{1,3}\b/g,
                          "",
                        )
                        .replace(
                          /^내 가격·추가 조건 반영:\s*/i,
                          "",
                        )
                        .replace(
                          /\s{2,}/g,
                          " ",
                        )
                        .trim(),
                    ]
                  : []),

                ...strongest.map(
                  (item) => {
                    const score =
                      item.effectiveScore ??
                      0;

                    if (
                      score >= 85
                    ) {
                      return `${item.label}: 비교 제품 중 특히 좋은 평가를 받았어요.`;
                    }

                    if (
                      score >= 70
                    ) {
                      return `${item.label}: 전반적으로 좋은 편이에요.`;
                    }

                    return `${item.label}: 선택하신 조건에서 무난한 편이에요.`;
                  },
                ),
              ]
                .filter(Boolean)
                .slice(0, 4),

            productCautions:
              [
                ...productCautions,

                ...weakest.map(
                  (item) =>
                    `${item.label}: 비교 제품 중 상대적으로 아쉬운 편이에요.`,
                ),
              ]
                .filter(
                  (
                    value,
                    index,
                    array,
                  ) =>
                    array.indexOf(
                      value,
                    ) ===
                    index,
                )
                .slice(0, 3),

            commonCautions,

            cautions:
              [
                ...productCautions,

                ...commonCautions.map(
                  (item) =>
                    [
                      item.title,
                      item.description,
                    ]
                      .filter(
                        Boolean,
                      )
                      .join(
                        ": ",
                      ),
                ),
              ]
                .filter(
                  (
                    value,
                    index,
                    array,
                  ) =>
                    array.indexOf(
                      value,
                    ) ===
                    index,
                )
                .slice(0, 4),

            bestFor:
              firstSentences(
                product
                  .review_analysis
                  ?.bestFor,
                3,
              ),

            criterionBreakdown:
              criterionBreakdown.sort(
                (a, b) =>
                  b.weight -
                  a.weight,
              ),
          };
        })
        .filter(
          (
            item,
          ): item is NonNullable<
            typeof item
          > =>
            item !== null,
        )
        ;

    const validPrices =
      scoredRecommendations
        .map(
          (item) =>
            item.productPrice,
        )
        .filter(
          (
            price,
          ): price is number =>
            typeof price ===
              "number" &&
            Number.isFinite(
              price,
            ) &&
            price > 0,
        );

    const minPrice =
      validPrices.length > 0
        ? Math.min(
            ...validPrices,
          )
        : null;

    const maxPrice =
      validPrices.length > 0
        ? Math.max(
            ...validPrices,
          )
        : null;

    /*
      가성비 점수:

      - 성능/개인화 점수 80%
      - 후보군 내 가격경쟁력 20%

      가격경쟁력은 50~100점 범위로 제한한다.

      가장 비싼 제품이라고 가격점수를 0점으로 만들면
      후보 가격 차이가 크지 않아도 성능 좋은 제품이
      지나치게 불리해질 수 있기 때문이다.

      따라서 가성비는 "가장 싼 제품"이 아니라
      "가격을 고려해도 성능이 좋은 제품"을 찾는
      보조 순위로 사용한다.
    */
    const withValueScores =
      scoredRecommendations.map(
        (item) => {
          let valuePriceScore:
            | number
            | null = null;

          if (
            item.productPrice !==
              null &&
            minPrice !== null &&
            maxPrice !== null
          ) {
            valuePriceScore =
              maxPrice ===
              minPrice
                ? 100
                : Math.round(
                    100 -
                      ((item.productPrice -
                        minPrice) /
                        (maxPrice -
                          minPrice)) *
                        50,
                  );
          }

          const valueScore =
            valuePriceScore ===
            null
              ? item.matchScore
              : Math.round(
                  item.matchScore *
                    0.8 +
                    valuePriceScore *
                      0.2,
                );

          return {
            ...item,
            valuePriceScore,
            valueScore,
          };
        },
      );

    const valueRankMap =
      new Map(
        [...withValueScores]
          .sort(
            (a, b) =>
              b.valueScore -
                a.valueScore ||
              b.matchScore -
                a.matchScore,
          )
          .map(
            (item, index) => [
              item.id,
              index + 1,
            ]),
      );

    const recommendations =
      withValueScores
        .sort(
          (a, b) =>
            b.matchScore -
              a.matchScore ||
            b.confidence -
              a.confidence,
        )
        .slice(0, 5)
        .map(
          (item, index) => ({
            ...item,
            rank:
              index + 1,
            valueRank:
              valueRankMap.get(
                item.id,
              ) ?? null,
          }),
        );

    if (
      recommendations.length ===
      0
    ) {
      return NextResponse.json(
        {
          success: false,
          needsScoreGeneration:
            true,
          message:
            "현재 구매기준에 맞는 제품별 기준 점수가 없습니다.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      category,
      count:
        recommendations.length,
      recommendations,
      note:
        "점수가 없는 기준은 후보군의 해당 기준 평균점으로 중립 대체하고 dataCoverage로 실제 근거 비율을 별도 표시합니다. matchScore는 성능·개인화 점수이며 가격은 감점하지 않고 valueScore/valueRank로 별도 평가합니다.",
    });
  } catch (error) {
    console.error(
      "Advisor recommendations API error:",
      error,
    );

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




