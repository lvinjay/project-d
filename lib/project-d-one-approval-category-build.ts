export const ONE_APPROVAL_POOL_MIN = 5;
export const ONE_APPROVAL_POOL_MAX = 15;
export const ONE_APPROVAL_REVIEW_MAX_CALLS_PER_PRODUCT = 5;
export const ONE_APPROVAL_SCORE_MAX_CALLS = 1;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SHA256_HEX_PATTERN =
  /^[0-9a-f]{64}$/i;

export type OneApprovalReviewPlan = {
  productId: string;
  productName: string;
  inputFingerprint: string;
  estimatedOpenAiCalls: number;
};

export type OneApprovalCategoryBuildPlanInput = {
  category: string;
  poolProductIds: string[];
  reviewPlans: OneApprovalReviewPlan[];
  scoreMaxOpenAiCalls?: 0 | 1;
};

export type OneApprovalCategoryBuildStage =
  | "review-analysis"
  | "score-preflight-free"
  | "score-execution"
  | "publish";

export type OneApprovalCategoryBuildPlan = {
  schemaVersion: 1;
  category: string;
  poolProductIds: string[];
  poolCount: number;
  reviewPlans: OneApprovalReviewPlan[];
  reviewProductCount: number;
  reviewMaxOpenAiCalls: number;
  scoreMaxOpenAiCalls: 0 | 1;
  totalMaxOpenAiCalls: number;
  scoreFingerprintPolicy:
    "post_review_free_preflight";
  stages: OneApprovalCategoryBuildStage[];
  approvalText: string;
};

function cleanText(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function assertUuid(
  value: string,
  label: string,
) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(
      `${label} must be a UUID.`,
    );
  }
}

function uniqueIds(
  values: string[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    const value =
      cleanText(raw).toLowerCase();

    assertUuid(
      value,
      "Recommendation Pool productId",
    );

    if (seen.has(value)) {
      throw new Error(
        "Recommendation Pool productIds must be unique.",
      );
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function normalizeReviewPlans(
  plans: OneApprovalReviewPlan[],
  poolIds: Set<string>,
): OneApprovalReviewPlan[] {
  const seen =
    new Set<string>();

  return plans.map(
    (plan, index) => {
      const productId =
        cleanText(
          plan.productId,
        ).toLowerCase();

      const productName =
        cleanText(
          plan.productName,
        );

      const inputFingerprint =
        cleanText(
          plan.inputFingerprint,
        ).toLowerCase();

      const estimatedOpenAiCalls =
        Number(
          plan.estimatedOpenAiCalls,
        );

      assertUuid(
        productId,
        `reviewPlans[${index}].productId`,
      );

      if (!poolIds.has(productId)) {
        throw new Error(
          "Every review plan must belong to the approved Recommendation Pool.",
        );
      }

      if (seen.has(productId)) {
        throw new Error(
          "Review plan productIds must be unique.",
        );
      }

      if (!productName) {
        throw new Error(
          "Every review plan needs a productName.",
        );
      }

      if (
        !SHA256_HEX_PATTERN.test(
          inputFingerprint,
        )
      ) {
        throw new Error(
          "Every review plan needs an exact 64-character input fingerprint.",
        );
      }

      if (
        !Number.isSafeInteger(
          estimatedOpenAiCalls,
        ) ||
        estimatedOpenAiCalls < 0 ||
        estimatedOpenAiCalls >
          ONE_APPROVAL_REVIEW_MAX_CALLS_PER_PRODUCT
      ) {
        throw new Error(
          `Each review plan may approve 0-${ONE_APPROVAL_REVIEW_MAX_CALLS_PER_PRODUCT} OpenAI calls.`,
        );
      }

      seen.add(productId);

      return {
        productId,
        productName,
        inputFingerprint,
        estimatedOpenAiCalls,
      };
    },
  );
}

export function buildOneApprovalCategoryBuildPlan(
  input: OneApprovalCategoryBuildPlanInput,
): OneApprovalCategoryBuildPlan {
  const category =
    cleanText(
      input.category,
    );

  if (!category) {
    throw new Error(
      "Category is required.",
    );
  }

  const poolProductIds =
    uniqueIds(
      Array.isArray(
        input.poolProductIds,
      )
        ? input.poolProductIds
        : [],
    );

  if (
    poolProductIds.length <
      ONE_APPROVAL_POOL_MIN ||
    poolProductIds.length >
      ONE_APPROVAL_POOL_MAX
  ) {
    throw new Error(
      `Recommendation Pool must contain ${ONE_APPROVAL_POOL_MIN}-${ONE_APPROVAL_POOL_MAX} products.`,
    );
  }

  const poolIdSet =
    new Set(
      poolProductIds,
    );

  const reviewPlans =
    normalizeReviewPlans(
      Array.isArray(
        input.reviewPlans,
      )
        ? input.reviewPlans
        : [],
      poolIdSet,
    );

  const scoreMaxOpenAiCalls =
    input.scoreMaxOpenAiCalls ??
    ONE_APPROVAL_SCORE_MAX_CALLS;

  if (
    scoreMaxOpenAiCalls !== 0 &&
    scoreMaxOpenAiCalls !== 1
  ) {
    throw new Error(
      "Product score approval must be bounded to 0 or 1 OpenAI call.",
    );
  }

  const reviewMaxOpenAiCalls =
    reviewPlans.reduce(
      (
        total,
        plan,
      ) =>
        total +
        plan.estimatedOpenAiCalls,
      0,
    );

  const totalMaxOpenAiCalls =
    reviewMaxOpenAiCalls +
    scoreMaxOpenAiCalls;

  const stages:
    OneApprovalCategoryBuildStage[] =
      [];

  if (
    reviewMaxOpenAiCalls >
    0
  ) {
    stages.push(
      "review-analysis",
    );
  }

  stages.push(
    "score-preflight-free",
  );

  if (
    scoreMaxOpenAiCalls ===
    1
  ) {
    stages.push(
      "score-execution",
    );
  }

  stages.push(
    "publish",
  );

  const approvalText = [
    `카테고리: ${category}`,
    `Recommendation Pool: ${poolProductIds.length}개`,
    `신규 리뷰 분석: ${reviewPlans.length}개 제품 / OpenAI 최대 ${reviewMaxOpenAiCalls}회`,
    `풀 전체 상대점수: OpenAI 최대 ${scoreMaxOpenAiCalls}회`,
    `이번 한 번 승인 총 상한: OpenAI 최대 ${totalMaxOpenAiCalls}회`,
    "리뷰 분석은 각 무료 dry-run의 정확한 fingerprint만 실행합니다.",
    "제품점수 fingerprint는 승인된 리뷰 저장 완료 후 무료 preflight로 새로 계산하고, 상한 1회 안에서만 실행합니다.",
    "무료 preflight가 실패하거나 호출 상한이 달라지면 유료 실행 없이 즉시 중단합니다.",
  ].join("\n");

  return {
    schemaVersion: 1,
    category,
    poolProductIds,
    poolCount:
      poolProductIds.length,
    reviewPlans,
    reviewProductCount:
      reviewPlans.length,
    reviewMaxOpenAiCalls,
    scoreMaxOpenAiCalls,
    totalMaxOpenAiCalls,
    scoreFingerprintPolicy:
      "post_review_free_preflight",
    stages,
    approvalText,
  };
}
