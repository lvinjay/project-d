export const FULL_CATEGORY_POOL_PRODUCT_MAX = 15;
export const FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT = 2;
export const FULL_CATEGORY_CRITERIA_MAX_CALLS = 1;
export const FULL_CATEGORY_SCORE_MAX_CALLS = 1;

export type FullCategoryPreciseReviewPlan = {
  productName: string;
  reviewCount: number;
  estimatedOpenAiCalls: number;
  reusable: boolean;
};

export type FullCategoryOneApprovalPlan = {
  schemaVersion: 1;
  category: string;
  resolverMaxCalls: number;
  brightDataMaxCalls: number;
  criteriaMaxOpenAiCalls: number;
  reviewProductMax: number;
  reviewMaxOpenAiCalls: number;
  scoreMaxOpenAiCalls: number;
  totalMaxOpenAiCalls: number;
  precisePlan: boolean;
  approvalLines: string[];
};

function cleanText(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function safeNonNegativeInteger(
  value: unknown,
  label: string,
) {
  const numeric =
    Number(value);

  if (
    !Number.isSafeInteger(
      numeric,
    ) ||
    numeric < 0
  ) {
    throw new Error(
      `${label} must be a non-negative integer.`,
    );
  }

  return numeric;
}

function safeZeroOrOne(
  value: unknown,
  label: string,
): 0 | 1 {
  const numeric =
    safeNonNegativeInteger(
      value,
      label,
    );

  if (
    numeric !== 0 &&
    numeric !== 1
  ) {
    throw new Error(
      `${label} must be 0 or 1.`,
    );
  }

  return numeric;
}

function normalizePreciseReviewPlans(
  plans: FullCategoryPreciseReviewPlan[],
) {
  if (
    plans.length >
    FULL_CATEGORY_POOL_PRODUCT_MAX
  ) {
    throw new Error(
      `preciseReviewPlans may contain at most ${FULL_CATEGORY_POOL_PRODUCT_MAX} products.`,
    );
  }

  return plans.map(
    (plan, index) => {
      const productName =
        cleanText(
          plan.productName,
        );

      const reviewCount =
        safeNonNegativeInteger(
          plan.reviewCount,
          `preciseReviewPlans[${index}].reviewCount`,
        );

      const estimatedOpenAiCalls =
        safeNonNegativeInteger(
          plan.estimatedOpenAiCalls,
          `preciseReviewPlans[${index}].estimatedOpenAiCalls`,
        );

      if (
        !productName
      ) {
        throw new Error(
          `preciseReviewPlans[${index}].productName is required.`,
        );
      }

      if (
        estimatedOpenAiCalls >
        FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT
      ) {
        throw new Error(
          `preciseReviewPlans[${index}] exceeds the per-product review ceiling.`,
        );
      }

      const reusable =
        plan.reusable === true;

      if (
        reusable &&
        estimatedOpenAiCalls !== 0
      ) {
        throw new Error(
          `Reusable precise review plans must approve 0 OpenAI calls.`,
        );
      }

      return {
        productName,
        reviewCount,
        estimatedOpenAiCalls,
        reusable,
      };
    },
  );
}

export function buildFullCategoryOneApprovalPlan(
  input: {
    category: string;
    resolverMaxCalls: number;
    brightDataMaxCalls: number;
    criteriaMaxOpenAiCalls?: 0 | 1;
    preciseReviewPlans?: FullCategoryPreciseReviewPlan[];
    scoreMaxOpenAiCalls?: 0 | 1;
  },
): FullCategoryOneApprovalPlan {
  const category =
    cleanText(
      input.category,
    );

  if (!category) {
    throw new Error(
      "Category is required.",
    );
  }

  const resolverMaxCalls =
    safeNonNegativeInteger(
      input.resolverMaxCalls,
      "resolverMaxCalls",
    );

  const brightDataMaxCalls =
    safeNonNegativeInteger(
      input.brightDataMaxCalls,
      "brightDataMaxCalls",
    );

  const criteriaMaxOpenAiCalls =
    input.criteriaMaxOpenAiCalls ===
    undefined
      ? FULL_CATEGORY_CRITERIA_MAX_CALLS
      : safeZeroOrOne(
          input.criteriaMaxOpenAiCalls,
          "criteriaMaxOpenAiCalls",
        );

  const scoreMaxOpenAiCalls =
    input.scoreMaxOpenAiCalls ===
    undefined
      ? FULL_CATEGORY_SCORE_MAX_CALLS
      : safeZeroOrOne(
          input.scoreMaxOpenAiCalls,
          "scoreMaxOpenAiCalls",
        );

  const preciseReviewPlans =
    input.preciseReviewPlans ===
    undefined
      ? null
      : normalizePreciseReviewPlans(
          input.preciseReviewPlans,
        );

  const precisePlan =
    preciseReviewPlans !==
    null;

  const reviewProductMax =
    preciseReviewPlans
      ? preciseReviewPlans.length
      : FULL_CATEGORY_POOL_PRODUCT_MAX;

  const reviewMaxOpenAiCalls =
    preciseReviewPlans
      ? preciseReviewPlans.reduce(
          (sum, plan) =>
            sum +
            plan.estimatedOpenAiCalls,
          0,
        )
      : FULL_CATEGORY_POOL_PRODUCT_MAX *
        FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT;

  const totalMaxOpenAiCalls =
    criteriaMaxOpenAiCalls +
    reviewMaxOpenAiCalls +
    scoreMaxOpenAiCalls;

  const preciseReviewLines =
    preciseReviewPlans
      ? preciseReviewPlans.map(
          (plan, index) =>
            `${index + 1}. ${plan.productName} · 리뷰 ${plan.reviewCount > 0 ? `${plan.reviewCount}개` : "기존 분석"} · ${
              plan.reusable
                ? "동일 분석 재사용 · OpenAI 0회"
                : `OpenAI 최대 ${plan.estimatedOpenAiCalls}회`
            }`,
        )
      : [];

  const reusableCount =
    preciseReviewPlans
      ? preciseReviewPlans.filter(
          (plan) =>
            plan.reusable,
        ).length
      : 0;

  const paidReviewProductCount =
    preciseReviewPlans
      ? preciseReviewPlans.filter(
          (plan) =>
            plan.estimatedOpenAiCalls >
            0,
        ).length
      : FULL_CATEGORY_POOL_PRODUCT_MAX;

  const reviewSummary =
    preciseReviewPlans
      ? `Recommendation Pool 리뷰 계획: ${reviewProductMax}개 · 기존 분석 재사용 ${reusableCount}개 · 신규/재분석 최대 ${paidReviewProductCount}개 · OpenAI 최대 ${reviewMaxOpenAiCalls}회`
      : `Recommendation Pool 리뷰 분석: 최대 ${FULL_CATEGORY_POOL_PRODUCT_MAX}개 제품 × 제품당 최대 ${FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT}회 = OpenAI 최대 ${reviewMaxOpenAiCalls}회`;

  const criteriaSummary =
    criteriaMaxOpenAiCalls ===
    0
      ? "구매기준: 기존 기준 재사용 · OpenAI 0회"
      : `구매기준 최초 생성: OpenAI 최대 ${criteriaMaxOpenAiCalls}회`;

  const scoreSummary =
    scoreMaxOpenAiCalls ===
    0
      ? "풀 전체 상대점수: 기존 cache 재사용 · OpenAI 0회"
      : `풀 전체 상대점수: OpenAI 최대 ${scoreMaxOpenAiCalls}회`;

  return {
    schemaVersion: 1,
    category,
    resolverMaxCalls,
    brightDataMaxCalls,
    criteriaMaxOpenAiCalls,
    reviewProductMax,
    reviewMaxOpenAiCalls,
    scoreMaxOpenAiCalls,
    totalMaxOpenAiCalls,
    precisePlan,
    approvalLines: [
      `카테고리: ${category}`,
      `시장 유료 보충 상한: resolver 최대 ${resolverMaxCalls}회 · Bright Data 최대 ${brightDataMaxCalls}회`,
      criteriaSummary,
      reviewSummary,
      scoreSummary,
      `이번 카테고리 구축 OpenAI 총 상한: 최대 ${totalMaxOpenAiCalls}회`,
      ...(
        preciseReviewLines.length >
        0
          ? [
              "",
              "제품별 무료 사전계획",
              ...preciseReviewLines,
            ]
          : []
      ),
      "",
      "이 승인은 현재 카테고리 구축 1회에만 적용됩니다.",
      "시장 유료 보충은 기존 정책대로 첫 유료 후보 1개까지만 허용하며 자동으로 두 번째 후보를 호출하지 않습니다.",
      "구매기준이 이미 있으면 구매기준 OpenAI 호출은 0회입니다.",
      "구매기준/리뷰/제품점수는 각 단계의 무료 preflight를 통과해야만 실행됩니다.",
      precisePlan
        ? "현재 승인 상한은 실제 Recommendation Pool 무료 리뷰 corpus와 기존 분석 준비 상태를 반영한 계획입니다."
        : "리뷰 fingerprint는 구매기준 준비 후 무료 preflight에서 확정하며, 실제 계획이 위 승인 상한을 넘으면 추가 유료 호출 없이 즉시 중단합니다.",
      precisePlan &&
      criteriaMaxOpenAiCalls >
        0
        ? "구매기준이 새로 생성되는 경우 리뷰 fingerprint는 생성 후 다시 무료 검증하며, 현재 corpus 기준 제품별 승인 상한을 넘으면 추가 유료 호출 없이 중단합니다."
        : "이미 같은 fingerprint로 분석된 리뷰와 기존 제품점수 cache는 재사용합니다.",
      "승인 전에 수행된 시장 무료 검증·DB 등록·native 리뷰 corpus 수집에는 OpenAI/resolver/Bright Data 유료 호출이 없습니다.",
    ],
  };
}
