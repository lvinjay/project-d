export const FULL_CATEGORY_POOL_PRODUCT_MAX = 15;
export const FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT = 5;
export const FULL_CATEGORY_CRITERIA_MAX_CALLS = 1;
export const FULL_CATEGORY_SCORE_MAX_CALLS = 1;

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

export function buildFullCategoryOneApprovalPlan(
  input: {
    category: string;
    resolverMaxCalls: number;
    brightDataMaxCalls: number;
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

  const reviewMaxOpenAiCalls =
    FULL_CATEGORY_POOL_PRODUCT_MAX *
    FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT;

  const totalMaxOpenAiCalls =
    FULL_CATEGORY_CRITERIA_MAX_CALLS +
    reviewMaxOpenAiCalls +
    FULL_CATEGORY_SCORE_MAX_CALLS;

  return {
    schemaVersion: 1,
    category,
    resolverMaxCalls,
    brightDataMaxCalls,
    criteriaMaxOpenAiCalls:
      FULL_CATEGORY_CRITERIA_MAX_CALLS,
    reviewProductMax:
      FULL_CATEGORY_POOL_PRODUCT_MAX,
    reviewMaxOpenAiCalls,
    scoreMaxOpenAiCalls:
      FULL_CATEGORY_SCORE_MAX_CALLS,
    totalMaxOpenAiCalls,
    approvalLines: [
      `카테고리: ${category}`,
      `시장 유료 보충 상한: resolver 최대 ${resolverMaxCalls}회 · Bright Data 최대 ${brightDataMaxCalls}회`,
      `구매기준 최초 생성: OpenAI 최대 ${FULL_CATEGORY_CRITERIA_MAX_CALLS}회`,
      `Recommendation Pool 리뷰 분석: 최대 ${FULL_CATEGORY_POOL_PRODUCT_MAX}개 제품 × 제품당 최대 ${FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT}회 = OpenAI 최대 ${reviewMaxOpenAiCalls}회`,
      `풀 전체 상대점수: OpenAI 최대 ${FULL_CATEGORY_SCORE_MAX_CALLS}회`,
      `이번 카테고리 구축 OpenAI 총 상한: 최대 ${totalMaxOpenAiCalls}회`,
      "",
      "이 승인은 현재 카테고리 구축 1회에만 적용됩니다.",
      "시장 유료 보충은 기존 정책대로 첫 유료 후보 1개까지만 허용하며 자동으로 두 번째 후보를 호출하지 않습니다.",
      "구매기준이 이미 있으면 구매기준 OpenAI 호출은 0회입니다.",
      "구매기준/리뷰/제품점수는 각 단계의 무료 preflight를 통과해야만 실행됩니다.",
      "리뷰 fingerprint는 구매기준 준비 후 무료 preflight에서 확정하며, 실제 계획이 위 승인 상한을 넘으면 추가 유료 호출 없이 즉시 중단합니다.",
      "이미 같은 fingerprint로 분석된 리뷰와 기존 제품점수 cache는 재사용합니다.",
    ],
  };
}
