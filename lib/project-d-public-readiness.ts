import {
  fetchPublishedSelectedFive,
  selectedFiveIds,
} from "./project-d-selected-five-manifest";

type ProductScorePreflightResponse = {
  success?: unknown;
  dryRun?: unknown;
  cacheHit?: unknown;
  inputFingerprint?: unknown;
  estimatedOpenAiCalls?: unknown;
  paidApiCalls?: unknown;
  message?: unknown;
};

export type PublicCategoryReadiness = {
  ready: boolean;
  cacheHit: boolean;
  estimatedOpenAiCalls: number | null;
  reason: string;
};

const PUBLIC_NOT_READY_MESSAGE =
  "이 제품군의 추천 데이터를 점검 중입니다. 잠시 후 다시 이용해 주세요.";

function uniqueFive(productIds: readonly string[]): string[] | null {
  const cleaned = productIds
    .map((value) => value.trim())
    .filter(Boolean);

  if (cleaned.length !== 5 || new Set(cleaned).size !== 5) {
    return null;
  }

  return cleaned;
}

export async function checkProductScoreReadiness(
  category: string,
  productIds: readonly string[],
): Promise<PublicCategoryReadiness> {
  const normalizedCategory = category.trim();
  const exactProductIds = uniqueFive(productIds);

  if (!normalizedCategory || !exactProductIds) {
    return {
      ready: false,
      cacheHit: false,
      estimatedOpenAiCalls: null,
      reason: "invalid-selection",
    };
  }

  try {
    const response = await fetch("/api/generate-product-scores", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        category: normalizedCategory,
        productIds: exactProductIds,
        dryRun: true,
      }),
    });

    const result =
      (await response.json()) as ProductScorePreflightResponse;

    const estimatedOpenAiCalls = Number(
      result.estimatedOpenAiCalls,
    );

    const safeCallCount =
      Number.isSafeInteger(estimatedOpenAiCalls) &&
      estimatedOpenAiCalls >= 0 &&
      estimatedOpenAiCalls <= 1;

    const ready =
      response.ok &&
      result.success === true &&
      result.dryRun === true &&
      result.paidApiCalls === 0 &&
      typeof result.inputFingerprint === "string" &&
      result.inputFingerprint.length > 0 &&
      safeCallCount &&
      estimatedOpenAiCalls === 0 &&
      result.cacheHit === true;

    return {
      ready,
      cacheHit: result.cacheHit === true,
      estimatedOpenAiCalls: safeCallCount
        ? estimatedOpenAiCalls
        : null,
      reason: ready
        ? "ready"
        : typeof result.message === "string"
          ? result.message
          : "score-preflight-not-ready",
    };
  } catch {
    return {
      ready: false,
      cacheHit: false,
      estimatedOpenAiCalls: null,
      reason: "score-preflight-failed",
    };
  }
}

export async function checkPublicCategoryReadiness(
  category: string,
): Promise<PublicCategoryReadiness> {
  try {
    const published =
      await fetchPublishedSelectedFive(category);

    return await checkProductScoreReadiness(
      published.manifest.category,
      selectedFiveIds(published.manifest),
    );
  } catch {
    return {
      ready: false,
      cacheHit: false,
      estimatedOpenAiCalls: null,
      reason: "published-selection-not-ready",
    };
  }
}

export async function assertPublicCategoryReadiness(
  category: string,
  productIds: readonly string[],
): Promise<void> {
  const readiness =
    await checkProductScoreReadiness(
      category,
      productIds,
    );

  if (!readiness.ready) {
    throw new Error(PUBLIC_NOT_READY_MESSAGE);
  }
}
