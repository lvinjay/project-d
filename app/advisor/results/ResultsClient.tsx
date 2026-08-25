"use client";

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
  weight: number;
  contribution: number | null;
  reason: string;
  reviewEvidenceCount?: number;
  evidenceSummary?: string;
};

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

type RecommendationResponse = {
  success: boolean;
  category?: string;
  recommendations?: Recommendation[];
  note?: string;
  message?: string;
  needsScoreGeneration?: boolean;
};

type ProductScoreGenerationResponse = {
  success: boolean;
  message?: string;
};

type StoredAnswers = {
  category?: string;
  weights?: Record<string, number>;
  budgetChoice?: string;
  budgetOptions?: Array<{
    label: string;
    value: string;
  }>;
  customPreference?: string;
};

type PersonalPreferenceResponse = {
  success: boolean;
  message?: string;
  interpretedPreferences?: string[];
  productScores?: Array<{
    productId: string;
    score: number;
    reason: string;
  }>;
};

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

        const runProductsRaw =
          window.sessionStorage.getItem(
            "projectDAutomationProductNames",
          );

        let currentRunProductNames:
          string[] = [];

        if (runProductsRaw) {
          try {
            const parsed =
              JSON.parse(
                runProductsRaw,
              ) as {
                category?: unknown;
                productNames?: unknown;
              };

            if (
              typeof parsed.category ===
                "string" &&
              parsed.category.trim() ===
                nextCategory &&
              Array.isArray(
                parsed.productNames,
              )
            ) {
              currentRunProductNames =
                parsed.productNames
                  .filter(
                    (
                      value,
                    ): value is string =>
                      typeof value ===
                        "string" &&
                      Boolean(
                        value.trim(),
                      ),
                  )
                  .map((value) =>
                    value.trim(),
                  );
            }
          } catch {
            currentRunProductNames =
              [];
          }
        }

        if (
          currentRunProductNames.length !== 5
        ) {
          throw new Error(
            "현재 자동화 실행의 최종 5개 제품 정보가 없습니다. 관리자 자동화를 다시 실행해 주세요.",
          );
        }

        if (!nextCategory) {
          throw new Error(
            "추천할 카테고리 정보가 없습니다.",
          );
        }

        const personalRequest = {
          category:
            nextCategory,
          budgetChoice:
            stored.budgetChoice ??
            "no_limit",
          customPreference:
            stored.customPreference ??
            "",
        };

        const personalCacheKey =
          JSON.stringify(
            personalRequest,
          );

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
          const personalResponse =
            await fetch(
              "/api/analyze-personal-preferences",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify(
                    personalRequest,
                  ),
              },
            );

          const fetchedPersonalResult =
            (await personalResponse.json()) as PersonalPreferenceResponse;

          if (
            !personalResponse.ok ||
            !fetchedPersonalResult.success
          ) {
            throw new Error(
              fetchedPersonalResult.message ??
                "가격·추가 조건을 분석하지 못했습니다.",
            );
          }

          personalResult =
            fetchedPersonalResult;

          window.sessionStorage.setItem(
            "projectDPersonalPreferenceCache",
            JSON.stringify({
              key:
                personalCacheKey,
              result:
                fetchedPersonalResult,
            } satisfies PersonalPreferenceCache),
          );
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
                    productNames:
                      currentRunProductNames,
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
          const scoreResponse =
            await fetch(
              "/api/generate-product-scores",
              {
                method:
                  "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    category:
                      nextCategory,
                    productNames:
                      currentRunProductNames,
                  }),
              },
            );

          const scoreResult =
            (await scoreResponse.json()) as ProductScoreGenerationResponse;

          if (
            !scoreResponse.ok ||
            !scoreResult.success
          ) {
            throw new Error(
              scoreResult.message ??
                "제품별 AI 평가 점수를 만들지 못했습니다.",
            );
          }

          ({
            response,
            result,
          } =
            await requestRecommendations());
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

      const importantPattern =
        /btu|냉방능력|냉방용량|냉방성능|소음|db|데시벨|소비전력|정격전력|전력소비|watt|와트|무게|중량|kg|제습량|풍량|배터리/i;

      const excludedNamePattern =
        /제품명|상품명|제조사|브랜드|모델명|모델번호|품명|색상|컬러/i;

      const rawSpecs =
        (winner.keySpecs ?? []).filter((spec) => {
          const name = spec.name.trim();
          const value = spec.value.trim();

          if (!name || !value) {
            return false;
          }

          if (excludedNamePattern.test(name)) {
            return false;
          }

          if (value.length > 45) {
            return false;
          }

          return importantPattern.test(
            `${name} ${value}`,
          );
        });

      const prioritized = rawSpecs;

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
        {isLoading ? (
          <div className="card advisorResultState">
            추천 순위를 계산하는
            중입니다.
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
                        최종{" "}
                        <b>
                          {winner.matchScore}점
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
                            {criterion.score === null
                              ? "정보 없음"
                              : `${criterion.score}점`}
                          </b>

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
                            </div>
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
                                  최종{" "}
                                  <b>
                                    {
                                      item.matchScore
                                    }
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
                                      {criterion.score ===
                                      null
                                        ? "정보 없음"
                                        : `${criterion.score}점`}
                                    </b>

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

              <Link
                href="/advisor/questions?category=캠핑용%20에어컨"
                className="primaryButton"
              >
                질문 다시 답하기
              </Link>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}






