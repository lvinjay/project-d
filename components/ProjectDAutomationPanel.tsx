"use client";

import { ProjectDApprovalDialog, type ApprovalDialogState } from "./ProjectDApprovalDialog";

import { fetchCurrentReviewAnalysisSnapshot, storeAndSaveReviewAnalysis, retryStoredReviewAnalysisPersistence } from "../lib/project-d-review-cas-client";

import { beginSelectionRun, assertSelectionRun, selectEligibleFive, fetchCategoryProfile, categoryProfileRevision, publishSelectedFive, persistPublishedSelectedFive, type SelectedFiveManifest, type SelectedProduct } from "../lib/project-d-selected-five-manifest";

import {
  useRef,
  useState,
} from "react";

type BrowserReview = {
  rating?: number;
  score?: number;
  reviewScore?: number;
  date?: string;
  createDate?: string;
  reviewDate?: string;
  text?: string;
  reviewContent?: string;
  helpfulCount?: number;
};

type MarketCandidate = {
  productName?: string;
  seller?: string;
  price?: number;
  priceVerified?: boolean;
  priceSource?: string;
  priceRawText?: string;
  imageUrl?: string;
  sourceUrl?: string;
  reviewCount?: number;
  rating?: number;
  browserReviews?: BrowserReview[];
  browserReviewSourceUrl?: string;
  browserReviewTotalCount?: number;
  browserSpecs?: Record<string, string>;
  browserCatalogTitle?: string;
  browserEvidenceSourceType?: string;
  browserProductTitle?: string;
  browserProductUrl?: string;
  browserChannelProductNo?: string;
  browserOriginProductNo?: string;
};

type BrowserBridgeCandidate = {
  name?: string;
  seller?: string;
  price?: number;
  priceVerified?: boolean;
  priceSource?: string;
  priceRawText?: string;
  imageUrl?: string;
  url?: string;
  reviewCount?: number;
  rating?: number;
  browserReviews?: BrowserReview[];
  smartstoreReviewProbe?: {
    finalUrl?: string;
    sourceType?: string;
    reviewCountReturned?: number;
    totalAvailableReviews?: number;
    specs?: Record<string, string>;
    catalogTitle?: string;
    productName?: string;
    productUrl?: string;
    channelProductNo?: string;
    originProductNo?: string;
  };
};

type MarketProbeDiagnostics = {
  collectorDiagnostics?: unknown;
  observedProductCardCount?: number;
  priceEvidenceDiagnostics?: { rejectedCount: number; samples: Array<{
    name: string; reason: string; detectedAmounts: number[]; snippet: string; cardType: string;
  }> };
  probeFailureCount?: number;
  probeFailures?: Array<{ position?: number; index?: number; name?: string; productName?: string;
    reason?: string; lastObservedUrl?: string; finalUrl?: string; stage?: string }>;
  deadlineReached?: boolean;
};

type BrowserBridgeResponse = MarketProbeDiagnostics & {
  rawProducts?: number;
  candidates?: BrowserBridgeCandidate[];
};

type FinalCandidate = {
  relevance?: { status?: "eligible" | "excluded" | "needs-review" };
  detail?: {
    productId?: string;
    productName?: string;
    detailStatus?:
      | "full"
      | "partial-market";
    reviewSourceUrl?: string;
    reviews?: Array<{
      rating?: number;
      score?: number;
      reviewScore?: number;
      date?: string;
      createDate?: string;
      reviewDate?: string;
      text?: string;
      reviewContent?: string;
      helpfulCount?: number;
    }>;
  };
};

type DeepReviewBridgeResponse = {
  mode?: string;
  productName?: string;
  reviewSourceUrl?: string;
  requestedMaxReviews?: number;
  reviewCountReturned?: number;
  probe?: {
    success?: boolean;
    finalUrl?: string;
    reviewCountReturned?: number;
    deepReview?: boolean;
    targetReviewCount?: number;
    collectionComplete?: boolean;
    reviews?: BrowserReview[];
    reviewSample?: BrowserReview[];
    reason?: string;
  };
};

type StepStatus =
  | "idle"
  | "working"
  | "done"
  | "error";

type Step = {
  key: string;
  label: string;
  status: StepStatus;
  message: string;
};

const INITIAL_STEPS: Step[] = [
  {
    key: "market",
    label: "1. 시장 상품 자동 수집",
    status: "idle",
    message: "",
  },
  {
    key: "enrich",
    label: "2. 유효 상품 풀 검증",
    status: "idle",
    message: "",
  },
  {
    key: "import",
    label: "3. 상품 풀 DB 등록",
    status: "idle",
    message: "",
  },
  {
    key: "reviews",
    label: "4. 최대 1,000개 리뷰 심층 수집",
    status: "idle",
    message: "",
  },
  {
    key: "criteria-first",
    label: "5. 선택한 5개 구매기준·프로필 연결",
    status: "idle",
    message: "",
  },
  {
    key: "save-reviews",
    label: "6. 리뷰 batch AI 분석·DB 저장",
    status: "idle",
    message: "",
  },
  {
    key: "criteria-final",
    label: "7. 최종 5개 프로필 연결 확인",
    status: "idle",
    message: "",
  },
];

const ANALYSIS_REVIEW_LIMIT = 100;

function selectAnalysisReviewObjects(
  reviews: BrowserReview[],
  limit: number,
) {
  const safeLimit =
    Math.max(
      1,
      Math.floor(limit),
    );

  if (
    reviews.length <=
    safeLimit
  ) {
    return [...reviews];
  }

  if (safeLimit === 1) {
    return [reviews[0]];
  }

  const lastIndex =
    reviews.length - 1;

  return Array.from(
    { length: safeLimit },
    (_, slot) => {
      const index =
        Math.round(
          slot *
            lastIndex /
            (safeLimit - 1),
        );

      return reviews[index];
    },
  );
}

function cleanText(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

async function readJson(
  response: Response,
) {
  const text =
    await response.text();

  try {
    return JSON.parse(text) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error(
      `JSON이 아닌 응답을 받았습니다. (${response.status}) ${text.slice(
        0,
        200,
      )}`,
    );
  }
}


type CategoryCriteriaPlan = {
  category: string;
  productIds: string[];
  inputFingerprint: string;
  estimatedOpenAiCalls: number;
};

async function prepareCategoryCriteria(
  category: string,
  productIds: string[],
): Promise<CategoryCriteriaPlan> {
  const response =
    await fetch(
      "/api/generate-category-criteria",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            category,
            productIds,
            dryRun: true,
          }),
      },
    );

  const result =
    await readJson(
      response,
    );

  const estimatedOpenAiCalls =
    Number(
      result.estimatedOpenAiCalls,
    );

  if (
    !response.ok ||
    result.success !== true ||
    result.dryRun !== true ||
    Number(
      result.paidApiCalls ??
      0,
    ) !== 0 ||
    !cleanText(
      result.inputFingerprint,
    ) ||
    !Number.isSafeInteger(
      estimatedOpenAiCalls,
    ) ||
    estimatedOpenAiCalls < 1 ||
    estimatedOpenAiCalls > 1
  ) {
    throw new Error(
      cleanText(
        result.message,
      ) ||
        "구매기준 AI 생성 무료 사전검증에 실패했습니다.",
    );
  }

  return {
    category,
    productIds: [...productIds],
    inputFingerprint:
      cleanText(
        result.inputFingerprint,
      ),
    estimatedOpenAiCalls,
  };
}

async function executeCategoryCriteria(
  plan: CategoryCriteriaPlan,
) {
  const response =
    await fetch(
      "/api/generate-category-criteria",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            category:
              plan.category,
            productIds: plan.productIds,
            inputFingerprint:
              plan.inputFingerprint,
          }),
      },
    );

  const result =
    await readJson(
      response,
    );

  if (
    !response.ok ||
    result.success !== true
  ) {
    throw new Error(
      cleanText(
        result.message,
      ) ||
        "구매기준 AI 생성에 실패했습니다. 자동 재시도하지 않습니다.",
    );
  }

  return result;
}

type PoolDiagnosticView = { captureId: string; collector: unknown; free: unknown; paid: unknown };

function poolDiagnosticLines(view: PoolDiagnosticView): string[] {
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const matching = (value: unknown) => {
    const row = record(value);
    return row.captureId === view.captureId ? row : {};
  };
  const free = matching(view.free);
  const paid = matching(view.paid);
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? `${value}개` : "미제공 / 미실행";
  const lines: string[] = [];
  const add = (section: unknown, fields: Array<[string, string]>) => {
    const values = record(section);
    for (const [key, label] of fields) lines.push(`${label}: ${count(values[key])}`);
  };
  add(view.collector, [
    ["rawCardCount", "브라우저 카드 관측"], ["cardWithNameCount", "이름 있음"],
    ["cardWithPositivePriceCount", "양수 판매가 있음"], ["cardWithUrlCount", "URL 있음"],
    ["initialEligibleCardCount", "이름·판매가·URL 동시 통과"], ["duplicateByNameCount", "동일 이름 중복 관측"],
    ["duplicateByModelKeyCount", "수집 modelKey 중복 제외"], ["finalCapturedCount", "브라우저 최종 후보"],
  ]);
  const collector = record(view.collector);
  const stopLabels: Record<string, string> = { "target-count": "기존 이름 기준 수집 목표 도달", "stable-after-minimum": "기존 최소 수집 후 정체", "max-scroll-steps": "기존 최대 스크롤 도달",
    "target-reached": "고유 후보 목표 도달", "market-saturated": "현재 검색 결과 포화 추정",
    "max-scroll": "안전 스크롤 상한 도달 · 포화로 판정하지 않음", "timeout": "수집 시간 상한 도달 · 포화로 판정하지 않음" };
  lines.push(`수집 종료: ${typeof collector.stopReason === "string" ? stopLabels[collector.stopReason] ?? "미제공" : "미제공"}`);
  const loops = collector.scrollLoopCount;
  lines.push(`스크롤 반복: ${typeof loops === "number" && Number.isSafeInteger(loops) && loops >= 0 ? `${loops}회` : "미제공"}`);
  add(collector, [["targetCount", "목표 고유 후보"], ["rawGrowthCount", "성장 판단용 고유 카드 근거"]]);
  for (const [key, label, unit] of [
    ["maxScrollLoops", "안전 스크롤 상한", "회"], ["actualScrollLoops", "실제 스크롤", "회"],
    ["minimumScrollLoops", "포화 판단 최소 스크롤", "회"], ["noGrowthThreshold", "연속 무성장 기준", "회"],
    ["lastRawCardGrowthLoop", "마지막 카드 근거 증가", "번째 스크롤"],
    ["lastFinalCandidateGrowthLoop", "마지막 고유 후보 증가", "번째 스크롤"],
    ["consecutiveNoGrowthAtStop", "카드 근거·후보 모두 무성장 연속", "회"],
  ]) {
    const value = collector[key];
    lines.push(`${label}: ${typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? value === 0 && key.startsWith("last") ? "초기 capture" : `${value}${unit}` : "미제공"}`);
  }
  lines.push(`포화 추정: ${collector.saturationDetected === true ? "예 · 현재 검색 결과/수집 방식에 한정" : collector.saturationDetected === false ? "아니오" : "미제공"}`);
  add(free.capture, [["receivedCount", "서버 수신 후보"], ["normalizedCount", "서버 정규화 후"]]);
  add(free.earlyValidation, [["verifiedPriceCount", "검증 가격 근거 있음"], ["initialDedupedCount", "서버 초기 중복 제거 후"],
    ["inspectionCandidateCount", "무료 검사 큐(자격 필터·상한 적용 후)"]]);
  add(free.zeroPaid, [["zeroPaidEvaluatedCount", "무료 자격 평가(정규화 전체)"], ["zeroPaidQualifiedCount", "무료 자격 충족"],
    ["zeroPaidRejectedCount", "무료 자격 미충족"]]);
  add(free.full, [["technicalFullCount", "상세 FULL 결과"], ["fullBeforeRelevanceCount", "relevance 평가 도달 FULL"],
    ["relevanceEligibleCount", "relevance 통과"], ["relevanceRejectedCount", "relevance 제외·검토 필요"],
    ["canonicalDuplicateRejectedCount", "canonical 중복 제외"], ["modelDuplicateRejectedCount", "모델 중복 제외"],
    ["finalCandidateCount", "최종 무료 검증 후보(shortcut 적용 전)"]]);
  add(record(free.zeroPaid).rejectReasons, [["reviewCountBelowMinimum", "무료 자격 탈락 · 리뷰 총량 부족"],
    ["reviewSampleInsufficient", "무료 자격 탈락 · 본문 샘플 부족"], ["nativeMetadataMissing", "무료 자격 탈락 · 상세/native metadata 부족"],
    ["priceEvidenceInvalid", "무료 자격 탈락 · 가격 근거 부족"], ["identityMismatch", "무료 자격 탈락 · 상품 identity 불일치"],
    ["reviewSourceInvalid", "무료 자격 탈락 · 리뷰 소스 부적합"], ["other", "무료 자격 탈락 · 기타"]]);
  add(paid.paidPlanning, [["paidPossibleCount", "사전계획 · 유료 가능 후보"], ["resolverRequiredCount", "사전계획 · resolver 필요 후보"],
    ["brightDataPossibleCount", "사전계획 · Bright Data 가능 후보"]]);

  const paidPreflight =
    record(
      paid.relevancePreflight,
    );

  const freePreflight =
    record(
      free.relevancePreflight,
    );

  const relevancePreflight =
    Object.keys(
      paidPreflight,
    ).length > 0
      ? paidPreflight
      : freePreflight;

  add(
    relevancePreflight,
    [
      [
        "evaluatedCount",
        "유료 전 relevance 평가",
      ],
      [
        "eligibleCount",
        "유료 전 relevance 이름 기준 통과",
      ],
      [
        "needsReviewCount",
        "유료 전 relevance 보류(유지)",
      ],
      [
        "excludedCount",
        "유료 전 relevance 명백 제외",
      ],
    ],
  );

  return lines;
}

function poolDiagnosticCandidateLines(
  view: PoolDiagnosticView,
): string[] {
  const record = (
    value: unknown,
  ): Record<string, unknown> =>
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};

  const matching = (
    value: unknown,
  ) => {
    const row =
      record(value);

    return row.captureId ===
      view.captureId
      ? row
      : {};
  };

  const free =
    matching(view.free);

  const paid =
    matching(view.paid);

  const rejectedProvided =
    Array.isArray(
      free.zeroPaidCandidateDiagnostics,
    );

  const rejected =
    rejectedProvided
      ? free.zeroPaidCandidateDiagnostics as Record<string, unknown>[]
      : [];

  const plans =
    Array.isArray(
      paid.paidCandidatePlans,
    )
      ? paid.paidCandidatePlans as Record<string, unknown>[]
      : [];

  if (!rejectedProvided) {
    return [
      "제품별 진단: 미제공 / 미실행",
    ];
  }

  if (rejected.length === 0) {
    return [
      "무료 자격 탈락 후보 없음",
    ];
  }

  const reasonLabels:
    Record<string, string> = {
      reviewCountBelowMinimum:
        "리뷰 총량 부족",

      reviewSampleInsufficient:
        "본문 샘플 부족",

      nativeMetadataMissing:
        "native metadata 부족",

      priceEvidenceInvalid:
        "가격 근거 부족",

      identityMismatch:
        "상품 identity 불일치",

      reviewSourceInvalid:
        "리뷰 소스 부적합",

      other:
        "기타",
    };

  const boolText = (
    value: unknown,
  ) =>
    value === true
      ? "O"
      : value === false
        ? "X"
        : "미제공";

  const countText = (
    value: unknown,
  ) =>
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
      ? String(value)
      : "미제공";

  return rejected.map(
    (row, index) => {
      const name =
        typeof row.productName ===
          "string"
          ? row.productName
          : `후보 ${index + 1}`;

      const reasons =
        Array.isArray(
          row.reasons,
        )
          ? row.reasons
              .map(
                (reason) =>
                  reasonLabels[
                    String(reason)
                  ] ??
                  String(reason),
              )
              .join(", ")
          : "미제공";

      const plan =
        plans.find(
          (candidate) =>
            candidate.productName ===
              row.productName,
        );

      const path =
        typeof plan?.path ===
          "string"
          ? plan.path
          : "미제공";

      const recoveryTier =
        typeof plan?.recoveryTier ===
          "string"
          ? plan.recoveryTier
          : "미제공";

      const resolverUpper =
        countText(
          plan?.resolverConservativeUpperBound,
        );

      const brightUpper =
        countText(
          plan?.brightDataConservativeUpperBound,
        );

      return [
        `${index + 1}. ${name}`,
        `리뷰 총량 ${countText(row.reviewTotalCount)}/30`,
        `본문 ${countText(row.reviewSampleCount)}/5`,
        `native ${boolText(row.nativeMetadataPresent)}`,
        `review source ${boolText(row.reviewSourceValid)}`,
        `가격 ${boolText(row.priceEvidenceValid)}`,
        `identity ${boolText(row.identityMatched)}`,
        `탈락: ${reasons}`,
        `paid 우선순위: ${recoveryTier}`,
        `paid path: ${path}`,
        `resolver 상한 ${resolverUpper}회`,
        `Bright Data 상한 ${brightUpper}회`,
      ].join(" · ");
    },
  );
}

/*
  Advisor FIVE review-control primitives.

  These functions are intentionally pure so the regression
  suite can execute the exact production control contract
  without browser/API/DB access.
*/
function shouldStopAdvisorReview(
  readyCount: number,
) {
  return readyCount >= 5;
}

function isAdvisorReviewIdentityReady(
  mapping: {
    dbProductId: string;
    originProductNo: number;
  },
  dbIds: Set<string>,
  origins: Set<number>,
) {
  return (
    dbIds.has(
      mapping.dbProductId.toLowerCase(),
    ) ||
    origins.has(
      mapping.originProductNo,
    )
  );
}

function markAdvisorReviewIdentityReady(
  mapping: {
    dbProductId: string;
    originProductNo: number;
  },
  dbIds: Set<string>,
  origins: Set<number>,
) {
  dbIds.add(
    mapping.dbProductId.toLowerCase(),
  );

  origins.add(
    mapping.originProductNo,
  );
}

export default function ProjectDAutomationPanel() {
  const [poolDiagnosticView, setPoolDiagnosticView] = useState<PoolDiagnosticView | null>(null);
  const [
    category,
    setCategory,
  ] = useState(
    "로봇청소기",
  );

  const [
    safePilotMode,
    setSafePilotMode,
  ] = useState(true);

  const [
    steps,
    setSteps,
  ] = useState<Step[]>(
    INITIAL_STEPS,
  );

  const [
    isRunning,
    setIsRunning,
  ] = useState(false);

  const [
    finalMessage,
    setFinalMessage,
  ] = useState("");

  const [
    approvalDialog,
    setApprovalDialog,
  ] = useState<ApprovalDialogState | null>(null);

  const approvalDecisionRef =
    useRef<((approved: boolean) => void) | null>(
      null,
    );

  function requestApproval(
    dialog: ApprovalDialogState,
  ) {
    if (approvalDecisionRef.current) {
      throw new Error(
        "승인 대화상자가 이미 열려 있습니다.",
      );
    }

    return new Promise<boolean>(
      (resolve) => {
        approvalDecisionRef.current =
          resolve;

        setApprovalDialog(
          dialog,
        );
      },
    );
  }

  function resolveApproval(
    approved: boolean,
  ) {
    const resolve =
      approvalDecisionRef.current;

    if (!resolve) {
      return;
    }

    approvalDecisionRef.current =
      null;

    setApprovalDialog(
      null,
    );

    resolve(
      approved,
    );
  }

  function updateStep(
    key: string,
    status: StepStatus,
    message = "",
  ) {
    setSteps(
      (current) =>
        current.map(
          (step) =>
            step.key === key
              ? {
                  ...step,
                  status,
                  message,
                }
              : step,
        ),
    );
  }

  async function collectDeepNaverReviews(
    productName: string,
    reviewSourceUrl: string,
    maxReviews = 1000,
  ) {
    const requestId =
      `project-d-deep-review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    return new Promise<DeepReviewBridgeResponse>(
      (
        resolve,
        reject,
      ) => {
        let settled =
          false;

        const cleanup =
          () => {
            window.removeEventListener(
              "message",
              onMessage,
            );

            window.clearTimeout(
              timeoutId,
            );
          };

        const onMessage =
          (
            event:
              MessageEvent,
          ) => {
            if (
              event.source !==
                window ||
              !event.data ||
              event.data.type !==
                "PROJECT_D_NAVER_CAPTURE_RESULT" ||
              event.data.requestId !==
                requestId
            ) {
              return;
            }

            settled =
              true;

            cleanup();

            if (
              event.data.success !==
              true
            ) {
              reject(
                new Error(
                  cleanText(
                    event.data.message,
                  ) ||
                    `${productName}: 네이버 심층 리뷰 수집 실패`,
                ),
              );

              return;
            }

            resolve(
              (
                event.data
                  .result ??
                {}
              ) as DeepReviewBridgeResponse,
            );
          };

        /*
          제품 1개에서 최대 1,000개 리뷰를
          네이버 native infinite-scroll로 수집할 수 있으므로
          shallow 후보검증보다 넉넉하게 15분을 허용한다.
        */
        const timeoutId =
          window.setTimeout(
            () => {
              if (
                settled
              ) {
                return;
              }

              settled =
                true;

              cleanup();

              reject(
                new Error(
                  `${productName}: 네이버 심층 리뷰 수집 시간이 초과되었습니다.`,
                ),
              );
            },
            900000,
          );

        window.addEventListener(
          "message",
          onMessage,
        );

        window.postMessage(
          {
            type:
              "PROJECT_D_NAVER_CAPTURE_REQUEST",
            requestId,
            payload: {
              mode:
                "deep-reviews",
              productName,
              reviewSourceUrl,
              maxReviews,
            },
          },
          window.location.origin,
        );
      },
    );
  }

  async function run() {
    const normalizedCategory =
      category.trim();

    if (!normalizedCategory) {
      alert(
        "제품군을 입력하세요.",
      );
      return;
    }

    setIsRunning(true);
    setPoolDiagnosticView(null);

    setSteps(
      INITIAL_STEPS.map(
        (step) => ({
          ...step,
        }),
      ),
    );

    setFinalMessage("");

    // Run-local progress survives catch, but never carries into another run.
    const reviewProgress = {
      active: false, total: 0, completed: 0, productName: "", failure: "",
    };
    function reviewProgressMessage(stage: string) {
      return `완료 ${reviewProgress.completed}/${reviewProgress.total}` +
        (reviewProgress.productName ? ` · ${reviewProgress.productName}` : "") +
        ` · ${stage}`;
    }
    function showReviewProgress(stage: string, failure: string, productName = reviewProgress.productName, displayMessage?: string) {
      reviewProgress.active = true;
      reviewProgress.productName = productName;
      reviewProgress.failure = failure;
      updateStep("save-reviews", "working", displayMessage ?? reviewProgressMessage(stage));
    }

    try {
      const selectionRun = beginSelectionRun(window.sessionStorage, normalizedCategory);
      /*
        1단계
        Project D 시장검색 엔진으로
        네이버 후보를 자동 수집한다.
      */
      updateStep(
        "market",
        "working",
        `"${normalizedCategory}" 시장 후보를 자동 검색하는 중...`,
      );

      const bridgeRequestId =
        `project-d-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const bridgeResult =
        await new Promise<BrowserBridgeResponse>((resolve, reject) => {
          let settled = false;

          const cleanup = () => {
            window.removeEventListener("message", onMessage);
            window.clearTimeout(timeoutId);
          };

          const onMessage = (event: MessageEvent) => {
            if (
              event.source !== window ||
              !event.data ||
              event.data.type !== "PROJECT_D_NAVER_CAPTURE_RESULT" ||
              event.data.requestId !== bridgeRequestId
            ) {
              return;
            }

            if (event.data.success !== true) {
              settled = true;
              cleanup();
              reject(
                new Error(
                  cleanText(event.data.message) ||
                    "Chrome 확장프로그램의 네이버 후보 수집에 실패했습니다.",
                ),
              );
              return;
            }

            settled = true;
            cleanup();
            resolve((event.data.result ?? {}) as BrowserBridgeResponse);
          };

          const timeoutId = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(
              new Error(
                "Chrome 확장프로그램 응답 시간이 초과되었습니다. Project D 확장프로그램이 설치·활성화되어 있는지 확인하세요.",
              ),
            );
          }, 900000);

          window.addEventListener("message", onMessage);

          window.postMessage(
            {
              type: "PROJECT_D_NAVER_CAPTURE_REQUEST",
              requestId: bridgeRequestId,
              payload: {
                category: normalizedCategory,
                minBudget: 0,
                maxBudget: 0,
                targetCount: 40,
              },
            },
            window.location.origin,
          );
        });

      const browserCandidates =
        Array.isArray(bridgeResult.candidates)
          ? bridgeResult.candidates
          : [];

      const marketCandidates: MarketCandidate[] =
        browserCandidates
          .map((candidate) => ({
            productName: cleanText(candidate.name),
            seller: cleanText(candidate.seller),
            price: Number(candidate.price ?? 0),
            priceVerified: candidate.priceVerified,
            priceSource: candidate.priceSource,
            priceRawText: candidate.priceRawText,
            imageUrl: cleanText(candidate.imageUrl),
            sourceUrl: cleanText(candidate.url),
            reviewCount: Number(candidate.reviewCount ?? 0),
            rating: Number(candidate.rating ?? 0),

            browserReviews:
              Array.isArray(
                candidate.browserReviews,
              )
                ? candidate.browserReviews
                : [],

            browserReviewSourceUrl:
              cleanText(
                candidate
                  .smartstoreReviewProbe
                  ?.finalUrl ??
                  candidate.url,
              ),

            browserReviewTotalCount:
              Number(
                candidate
                  .smartstoreReviewProbe
                  ?.totalAvailableReviews ??
                  candidate.reviewCount ??
                  0,
              ),

            browserSpecs:
              candidate
                .smartstoreReviewProbe
                ?.specs &&
              typeof candidate
                .smartstoreReviewProbe
                .specs === "object"
                ? candidate
                    .smartstoreReviewProbe
                    .specs
                : {},

            browserCatalogTitle:
              cleanText(
                candidate
                  .smartstoreReviewProbe
                  ?.catalogTitle,
              ),

            browserEvidenceSourceType:
              cleanText(
                candidate
                  .smartstoreReviewProbe
                  ?.sourceType,
              ),

            browserProductTitle:
              cleanText(
                candidate
                  .smartstoreReviewProbe
                  ?.productName,
              ),

            browserProductUrl:
              cleanText(
                candidate
                  .smartstoreReviewProbe
                  ?.productUrl,
              ),

            browserChannelProductNo:
              cleanText(
                candidate
                  .smartstoreReviewProbe
                  ?.channelProductNo,
              ),

            browserOriginProductNo:
              cleanText(
                candidate
                  .smartstoreReviewProbe
                  ?.originProductNo,
              ),
          }))
          .filter(
            (candidate) =>
              cleanText(candidate.productName).length > 0 &&
              Number(candidate.price ?? 0) > 0 &&
              cleanText(candidate.sourceUrl).length > 0,
          )
          .sort((a, b) => {
            const catalogPriority = (
              candidate: MarketCandidate,
            ) => {
              const sourceUrl =
                cleanText(
                  candidate.browserReviewSourceUrl,
                );

              const catalogTitle =
                cleanText(
                  candidate.browserCatalogTitle,
                );

              const specCount =
                candidate.browserSpecs &&
                typeof candidate.browserSpecs ===
                  "object"
                  ? Object.keys(
                      candidate.browserSpecs,
                    ).length
                  : 0;

              const browserReviewCount =
                Array.isArray(
                  candidate.browserReviews,
                )
                  ? candidate.browserReviews.length
                  : 0;

              const browserReviewTotalCount =
                Number(
                  candidate.browserReviewTotalCount ??
                  candidate.reviewCount ??
                  0,
                );

              return (
                /^https:\/\/search\.shopping\.naver\.com\/catalog\/\d+/i.test(
                  sourceUrl,
                ) &&
                catalogTitle.length > 0 &&
                specCount > 0 &&
                browserReviewCount >= 5 &&
                browserReviewTotalCount >= 30
              )
                ? 1
                : 0;
            };

            return (
              catalogPriority(b) -
              catalogPriority(a)
            );
          });

      if (marketCandidates.length === 0) {
        throw new Error(
          "Chrome 확장프로그램이 유효한 시장 후보를 반환하지 못했습니다.",
        );
      }

      updateStep(
        "market",
        "done",
        `${marketCandidates.length}개 시장 후보 수집 완료 · 네이버 원본 ${Number(
          bridgeResult.rawProducts ?? marketCandidates.length,
        )}개`,
      );

      /*
        naver-capture는 이제 사용자에게
        보이지 않는 내부 임시 저장소로만 사용한다.
      */
      const captureProducts =
        marketCandidates.map(
          (candidate) => ({
            name:
              cleanText(
                candidate.productName,
              ),

            text: "",

            seller:
              cleanText(
                candidate.seller,
              ),

            url:
              cleanText(
                candidate.sourceUrl,
              ),

            imageUrl:
              cleanText(
                candidate.imageUrl,
              ),

            priceVerified: candidate.priceVerified,
            priceSource: candidate.priceSource,
            priceRawText: candidate.priceRawText,
            price:
              Number(
                candidate.price ??
                  0,
              ),

            reviewCount:
              Number(
                candidate.reviewCount ??
                  0,
              ),

            rating:
              Number(
                candidate.rating ??
                  0,
              ),

            browserReviews:
              Array.isArray(
                candidate.browserReviews,
              )
                ? candidate.browserReviews
                : [],

            browserReviewSourceUrl:
              cleanText(
                candidate
                  .browserReviewSourceUrl,
              ),

            browserReviewTotalCount:
              Number(
                candidate
                  .browserReviewTotalCount ??
                  candidate.reviewCount ??
                  0,
              ),

            browserSpecs:
              candidate.browserSpecs &&
              typeof candidate.browserSpecs === "object"
                ? candidate.browserSpecs
                : {},

            browserCatalogTitle:
              cleanText(
                candidate.browserCatalogTitle,
              ),

            browserEvidenceSourceType:
              cleanText(
                candidate.browserEvidenceSourceType,
              ),

            browserProductTitle:
              cleanText(
                candidate.browserProductTitle,
              ),

            browserProductUrl:
              cleanText(
                candidate.browserProductUrl,
              ),

            browserChannelProductNo:
              cleanText(
                candidate.browserChannelProductNo,
              ),

            browserOriginProductNo:
              cleanText(
                candidate.browserOriginProductNo,
              ),
          }),
        );

      const captureResponse =
        await fetch(
          "/api/naver-capture",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              category:
                normalizedCategory,

              minBudget:
                0,

              maxBudget:
                0,

              products:
                captureProducts,
              diagnostics: {
                collectorDiagnostics: bridgeResult.collectorDiagnostics,
                observedProductCardCount: bridgeResult.observedProductCardCount,
                priceEvidenceDiagnostics: bridgeResult.priceEvidenceDiagnostics,
                probeFailureCount: bridgeResult.probeFailureCount,
                probeFailures: bridgeResult.probeFailures,
                deadlineReached: bridgeResult.deadlineReached,
              },
            }),
          },
        );

      const captureResult =
        await readJson(
          captureResponse,
        );

      if (
        !captureResponse.ok ||
        captureResult.success !== true
      ) {
        throw new Error(
          cleanText(
            captureResult.message,
          ) ||
            "후보 임시 저장에 실패했습니다.",
        );
      }

      const captureId =
        cleanText(
          captureResult.id,
        );

      if (!captureId) {
        throw new Error(
          "내부 후보 ID가 생성되지 않았습니다.",
        );
      }
      setPoolDiagnosticView({ captureId, collector: bridgeResult.collectorDiagnostics, free: null, paid: null });

      /*
        2단계
        시장 후보를 상세 검증해
        고객 추천에 재사용할 수 있는 유효 상품 풀을 확보한다.
      */
      updateStep(
        "enrich",
        "working",
        "시장 후보의 실제 판매가·리뷰·중복·공식 상품 URL을 검증해 상품 풀을 만드는 중...",
      );

      const enrichedParams =
        new URLSearchParams({
          captureId,
          requireVerifiedPrice: "1",
        });

      let zeroPaidEnrichedOverride:
        Record<string, unknown> | null =
        null;

      if (safePilotMode) {
        enrichedParams.set(
          "zeroPaidOnly",
          "1",
        );
      } else {
        updateStep(
          "enrich",
          "working",
          "resolver/Bright Data를 호출하지 않고 현재 후보의 유료 경로를 사전계획하는 중...",
        );

        const paidPlanParams =
          new URLSearchParams({
            captureId,
            requireVerifiedPrice: "1",
            paidPlanOnly: "1",
          });

        const paidPlanResponse =
          await fetch(
            `/api/market-candidates-enriched?${paidPlanParams.toString()}`,
            {
              cache: "no-store",
            },
          );

        const paidPlan =
          await readJson(
            paidPlanResponse,
          );

        if (
          !paidPlanResponse.ok ||
          paidPlan.success !== true ||
          paidPlan.paidPlanOnly !== true ||
          paidPlan.readOnly !== true ||
          Number(
            paidPlan.paidApiCalls ??
              -1,
          ) !== 0 ||
          Number(
            paidPlan.resolverCalls ??
              -1,
          ) !== 0 ||
          Number(
            paidPlan.brightDataCalls ??
              -1,
          ) !== 0
        ) {
          throw new Error(
            cleanText(
              paidPlan.message,
            ) ||
              "유료 경로 사전계획의 무과금 계약을 검증하지 못했습니다.",
          );
        }

        setPoolDiagnosticView(current => current?.captureId === captureId
          ? { ...current, paid: paidPlan.diagnostics } : current);
        const planCandidateCount =
          Number(
            paidPlan.marketCandidateCount ??
              0,
          );

        const zeroPaidProvenCount =
          Number(
            paidPlan.zeroPaidProvenCount ??
              0,
          );

        const paidPossibleCount =
          Number(
            paidPlan.paidPossibleCount ??
              0,
          );

        const resolverRequired =
          Number(
            paidPlan.resolverKnownRequiredIfAllInspected ??
              0,
          );

        const resolverUpperBound =
          Number(
            paidPlan.resolverConservativeUpperBound ??
              0,
          );

        const brightDataRequired =
          Number(
            paidPlan.brightDataKnownRequiredIfAllInspected ??
              0,
          );

        const brightDataUpperBound =
          Number(
            paidPlan.brightDataConservativeUpperBound ??
              0,
          );

        const otherExternalPossible =
          Number(
            paidPlan.otherExternalPathPossibleCount ??
              0,
          );

        /*
          유료 승인 판단은 반드시 같은 captureId의 무과금 실제 검증 결과를
          기준으로 한다. 별도 파일럿을 다시 실행하면 네이버 캡처 후보 수가
          달라질 수 있으므로 paid-plan과 다른 표본을 비교하게 된다.
        */
        updateStep(
          "enrich",
          "working",
          `같은 ${planCandidateCount}개 후보에서 resolver/Bright Data 0회 실제 검증을 먼저 수행하는 중...`,
        );

        const zeroPaidPreviewParams =
          new URLSearchParams({
            captureId,
            requireVerifiedPrice: "1",
            zeroPaidOnly: "1",
          });

        const zeroPaidPreviewResponse =
          await fetch(
            `/api/market-candidates-enriched?${zeroPaidPreviewParams.toString()}`,
            {
              cache: "no-store",
            },
          );

        const zeroPaidPreview =
          await readJson(
            zeroPaidPreviewResponse,
          );

        if (
          !zeroPaidPreviewResponse.ok ||
          zeroPaidPreview.success !== true ||
          Number(
            zeroPaidPreview.resolverAttempts ??
              -1,
          ) !== 0 ||
          Number(
            zeroPaidPreview.brightDataCalls ??
              -1,
          ) !== 0
        ) {
          throw new Error(
            cleanText(
              zeroPaidPreview.message,
            ) ||
              "같은 캡처의 무과금 실제 검증에서 resolver/Bright Data 0회 계약을 확인하지 못했습니다.",
          );
        }

        setPoolDiagnosticView(current => current?.captureId === captureId
          ? { ...current, free: zeroPaidPreview.diagnostics } : current);
        const zeroPaidPreviewCandidates =
          Array.isArray(
            zeroPaidPreview.finalCandidates,
          )
            ? (
                zeroPaidPreview.finalCandidates as FinalCandidate[]
              ).filter(
                (candidate) =>
                  candidate.detail
                    ?.detailStatus ===
                    "full" &&
                  candidate.relevance
                    ?.status ===
                    "eligible",
              )
            : [];

        const zeroPaidFullCount =
          zeroPaidPreviewCandidates.length;

        const zeroPaidRelevance =
          zeroPaidPreview.relevance &&
          typeof zeroPaidPreview.relevance ===
            "object" &&
          !Array.isArray(
            zeroPaidPreview.relevance,
          )
            ? zeroPaidPreview.relevance as Record<string, unknown>
            : null;

        const zeroPaidEligibleCount =
          Number(
            zeroPaidRelevance
              ?.eligibleCount ??
              zeroPaidFullCount,
          ) || 0;

        const zeroPaidExcludedCount =
          Number(
            zeroPaidRelevance
              ?.excludedCount ??
              0,
          ) || 0;

        const zeroPaidNeedsReviewCount =
          Number(
            zeroPaidRelevance
              ?.needsReviewCount ??
              0,
          ) || 0;

        if (zeroPaidFullCount >= 5) {        const freePoolPreviewNames =
          zeroPaidPreviewCandidates
            .slice(
              0,
              10,
            )
            .map(
              (
                candidate,
                index,
              ) =>
                `${index + 1}. ${cleanText(candidate.detail?.productName) || "상품명 없음"}`,
            );

        const freePoolRemainingCount =
          Math.max(
            0,
            zeroPaidFullCount -
              freePoolPreviewNames.length,
          );


          const approvedFreePool =
            await requestApproval({
              title:
                "무과금 MARKET POOL 확보",
              lines: [
                `검증 후보 ${planCandidateCount}개`,
                `같은 캡처 무과금 실제 검증 FULL ${zeroPaidFullCount}개`,
                `제품군 적합성: 적합 ${zeroPaidEligibleCount}개 / 제외 ${zeroPaidExcludedCount}개 / 검토 필요 ${zeroPaidNeedsReviewCount}개`,
                "",
                "검증된 FULL 상품은 5개로 자르지 않고 MARKET POOL 전체를 DB에 등록합니다.",
                "Advisor 단계는 이 MARKET POOL에서 현재 실행의 정확한 5개만 준비합니다.",
                ...freePoolPreviewNames,
                ...(
                  freePoolRemainingCount >
                  0
                    ? [
                        `외 ${freePoolRemainingCount}개 MARKET POOL 상품`,
                      ]
                    : []
                ),
                "",
                "확인하면 유료 시장 검증은 건너뛰고 검증된 MARKET POOL 전체를 DB 등록한 뒤, Advisor FIVE가 준비될 때까지만 심층리뷰를 확인합니다.",
                "OpenAI는 별도 승인창 전에는 호출되지 않습니다.",
                "취소하면 이 실행을 중단하며 resolver/Bright Data/OpenAI 호출은 0회입니다.",
              ],
              confirmLabel:
                "MARKET POOL 전체로 계속",
              cancelLabel:
                "중단",
            });

          if (!approvedFreePool) {
            throw new Error(
              "무과금 MARKET POOL 확인 후 실행을 중단했습니다. resolver/Bright Data/OpenAI 호출 0회.",
            );
          }

          zeroPaidEnrichedOverride = {
            ...zeroPaidPreview,
            finalCandidates:
              zeroPaidPreviewCandidates,
            resolverAttempts: 0,
            brightDataCalls: 0,
          };

          updateStep(
            "enrich",
            "working",
            `무과금 MARKET POOL ${zeroPaidFullCount}개 유지 · resolver/Bright Data 0회`,
          );
        } else {
          const candidatePlans =
            Array.isArray(
              paidPlan.candidatePlans,
            )
              ? paidPlan.candidatePlans as Record<string, unknown>[]
              : [];

          const firstPaidPlan =
            candidatePlans.find(
              (plan) =>
                plan.zeroPaidProven !==
                true,
            ) ?? null;

          const singleResolverUpper =
            Number(
              firstPaidPlan
                ?.resolverConservativeUpperBound ??
                0,
            ) || 0;

          const singleBrightDataUpper =
            Number(
              firstPaidPlan
                ?.brightDataConservativeUpperBound ??
                0,
            ) || 0;

          const approvedPaidEnrichment =
            await requestApproval({
              title:
                "무료 FULL 5개까지 1개만 유료 보충",
              lines: [
                `검증 후보 ${planCandidateCount}개`,
                `같은 캡처 무과금 실제 검증 FULL ${zeroPaidFullCount}개`,
                `최종 5개까지 부족 ${Math.max(0, 5 - zeroPaidFullCount)}개`,
                `유료 가능 후보 ${paidPossibleCount}개`,
                "",
                "이번 실행은 유료 가능 후보를 전부 검사하지 않습니다.",
                "첫 유료 후보 1개만 허용하고, 나머지 유료 후보는 route에서 실행 대상에서 제외합니다.",
                "그 1개가 FULL이면 정확히 5개에서 즉시 중단합니다.",
                "실패해도 두 번째 유료 후보로 자동 진행하지 않습니다.",
                "",
                `이번 1개 후보 보수적 상한: resolver ${singleResolverUpper}회 · Bright Data ${singleBrightDataUpper}회`,
                "OpenAI는 이후 별도 승인창 전에는 호출되지 않습니다.",
                "취소하면 이 실행의 resolver/Bright Data 호출은 0회입니다.",
              ],
              confirmLabel:
                "유료 후보 1개만 시도",
              cancelLabel:
                "취소",
            });

          if (!approvedPaidEnrichment) {
            throw new Error(
              "1개 유료 보충 실행을 취소했습니다. resolver/Bright Data 호출 0회.",
            );
          }

          enrichedParams.set(
            "executionTargetCount",
            "5",
          );
          enrichedParams.set(
            "paidCandidateLimit",
            "1",
          );
          enrichedParams.set(
            "paidCandidateOffset",
            "0",
          );

          updateStep(
            "enrich",
            "working",
            `무과금 FULL ${zeroPaidFullCount}개 + 유료 후보 최대 1개만 검증 · 최종 5개에서 즉시 중단`,
          );
        }
      }

      let enriched:
        Record<string, unknown>;

      if (zeroPaidEnrichedOverride) {
        enriched =
          zeroPaidEnrichedOverride;
      } else {
        const enrichedResponse =
          await fetch(
            `/api/market-candidates-enriched?${enrichedParams.toString()}`,
            {
              cache: "no-store",
            },
          );

        enriched =
          await readJson(
            enrichedResponse,
          );

        if (
          !enrichedResponse.ok ||
          enriched.success !== true
        ) {
          throw new Error(
            cleanText(
              enriched.message,
            ) ||
              "최종 후보 검증에 실패했습니다.",
          );
        }
      }

      if (
        safePilotMode &&
        (
          Number(
            enriched.resolverAttempts ??
              0,
          ) !== 0 ||
          Number(
            enriched.brightDataCalls ??
              0,
          ) !== 0
        )
      ) {
        throw new Error(
          "무과금 파일럿 안전장치 위반: resolver 또는 Bright Data 호출이 감지되었습니다.",
        );
      }

      if (safePilotMode) setPoolDiagnosticView(current => current?.captureId === captureId
        ? { ...current, free: enriched.diagnostics } : current);
      const returnedCandidates =
        Array.isArray(
          enriched.finalCandidates,
        )
          ? (
              enriched.finalCandidates as FinalCandidate[]
            )
          : [];

      /*
        API가 실수로 partial 후보를 finalCandidates에 포함하더라도
        이후 DB 등록 / 리뷰 AI 분석 단계로 넘어가지 않도록
        클라이언트에서도 full 후보만 한 번 더 확인한다.
      */
      const finalCandidates =
        returnedCandidates.filter(
          (candidate) =>
            candidate.detail
              ?.detailStatus ===
            "full" && candidate.relevance?.status === "eligible",
        );

      const relevanceDiagnostics = enriched.relevance && typeof enriched.relevance === "object" && !Array.isArray(enriched.relevance)
        ? enriched.relevance as Record<string, unknown> : null;
      const relevanceSummary = relevanceDiagnostics
        ? `제품군 적합성: 적합 ${Number(relevanceDiagnostics.eligibleCount ?? 0)}개 / 제외 ${Number(relevanceDiagnostics.excludedCount ?? 0)}개 / 검토 필요 ${Number(relevanceDiagnostics.needsReviewCount ?? 0)}개`
        : "제품군 적합성 진단 없음";
      if (
        !safePilotMode &&
        Number(
          enriched.paidCandidateLimit ??
            -1,
        ) === 1 &&
        finalCandidates.length < 5
      ) {
        throw new Error(
          `유료 후보 1개만 검증했지만 FULL은 ${finalCandidates.length}개입니다. ` +
          `이번 실제 호출: resolver ${Number(enriched.resolverAttempts ?? 0)}회 · Bright Data ${Number(enriched.brightDataCalls ?? 0)}회. ` +
          "두 번째 유료 후보는 자동 호출하지 않았습니다.",
        );
      }

      if (
        finalCandidates.length === 0
      ) {
        const partialCount =
          Number(
            enriched.partialCandidateCount ??
              0,
          ) || 0;

        throw new Error(
          "DB에 등록할 제품군 적합 full 유효 상품을 확보하지 못했습니다. " + relevanceSummary +
            (partialCount > 0
              ? ` · partial 예비 후보 ${partialCount}개`
              : ""),
        );
      }

      updateStep(
        "enrich",
        "done",
        `${finalCandidates.length}개 유효 상품 확보 · 목표 ${Number(
          enriched.targetCount ??
            30,
        )}개 · Bright Data ${Number(
          enriched.brightDataCalls ??
            0,
        )}회 · ${relevanceSummary}`,
      );

      /*
        3단계
        검증된 유효 상품 풀 전체를 products에 등록/갱신.
      */
      updateStep(
        "import",
        "working",
        "검증된 유효 상품 풀을 제품 DB에 등록하는 중...",
      );

      const importResponse =
        await fetch(
          "/api/import-market-candidates",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              category:
                normalizedCategory,

              requireVerifiedPrice: true,
              candidates:
                finalCandidates,
            }),
          },
        );

      const importResult =
        await readJson(
          importResponse,
        );

      if (
        !importResponse.ok ||
        importResult.success !==
          true
      ) {
        throw new Error(
          cleanText(
            importResult.message,
          ) ||
            "제품 DB 등록에 실패했습니다.",
        );
      }

      updateStep(
        "import",
        "done",
        `${Number(
          importResult.successCount ??
            0,
        )}개 제품 등록/갱신 완료`,
      );

      const mappedProducts = new Map<number, { dbProductId: string; originProductNo: number; productName: string }>();
      if (importResult.category !== normalizedCategory || !Array.isArray(importResult.results)) throw new Error("현재 실행 DB 등록 결과가 잘못되었습니다.");
      for (const item of importResult.results as Array<{ success?: boolean; product?: { id?: string; origin_product_no?: number; product_name?: string } }>) {
        if (item.success !== true || !item.product) continue;
        const originProductNo = Number(item.product.origin_product_no);
        if (!Number.isSafeInteger(originProductNo) || originProductNo <= 0) continue;
        if (mappedProducts.has(originProductNo)) throw new Error("현재 pool DB 매핑에 중복 원상품 번호가 있습니다.");
        mappedProducts.set(originProductNo, { dbProductId: cleanText(item.product.id), originProductNo, productName: cleanText(item.product.product_name) });
      }

      if (safePilotMode) {
        updateStep(
          "criteria-first",
          "done",
          "무과금 파일럿 모드 · OpenAI 호출 생략",
        );

        updateStep(
          "reviews",
          "done",
          "무과금 파일럿 모드 · 1,000개 심층수집은 실전 실행에서 수행",
        );

        updateStep(
          "save-reviews",
          "done",
          "무과금 파일럿 모드 · 리뷰 AI 분석/저장 생략",
        );

        updateStep(
          "criteria-final",
          "done",
          "무과금 파일럿 모드 · 최종 구매기준 AI 보정 생략",
        );

        setFinalMessage(
          `파일럿 완료 · ${normalizedCategory} 브라우저 검증 상품 ${finalCandidates.length}개 DB 등록/갱신 · resolver 0회 · Bright Data 0회 · OpenAI 0회`,
        );

        return;
      }

      /*
        4단계
        DB 등록이 끝난 상품만 심층 리뷰를 수집한다.

        중요:
        - MARKET POOL 전체를 무조건 1,000개씩 수집하지 않는다.
        - DB mapping이 확인된 상품만 Advisor FIVE 후보로 검토한다.
        - SmartStore, Naver Catalog, Brand Store reviewSource는 deep mode를 사용한다.
        - 고유한 리뷰 준비 상품 5개가 확보되는 즉시 다음 MARKET POOL 상품의 심층 수집을 중단한다.
      */
      updateStep(
        "reviews",
        "working",
        `MARKET POOL ${finalCandidates.length}개 중 Advisor FIVE 준비를 위한 리뷰 소스를 확인하는 중...`,
      );

      const reviewCollections:
        Array<{
          productId: string;
          productName: string;
          reviewSourceUrl: string;
          reviews: string[];
          reviewObjects: BrowserReview[];
          collectionStats: {
            total: number;
            ranking: number;
            latest: number;
            lowScore: number;
          };
          sourceMode:
            | "smartstore-deep"
            | "catalog-deep"
            | "brandstore-deep"
            | "existing-shallow";
        }> = [];

      let deepCollectedProducts =
        0;

      let shallowFallbackProducts =
        0;

      let insufficientReviewProducts =
        0;

      let unmappedReviewProducts =
        0;

      const advisorReviewDbIds =
        new Set<string>();

      const advisorReviewOrigins =
        new Set<number>();

      for (
        let index = 0;
        index <
        finalCandidates.length;
        index++
      ) {
        // ADVISOR FIVE REVIEW EARLY STOP
        if (
          shouldStopAdvisorReview(
            reviewCollections.length,
          )
        ) {
          break;
        }

        const candidate =
          finalCandidates[index];

        const detail =
          candidate.detail ?? {};

        const productId =
          cleanText(
            detail.productId,
          );

        const productName =
          cleanText(
            detail.productName,
          );

        const currentPoolMapping =
          mappedProducts.get(
            Number(
              productId,
            ),
          );

        if (
          !currentPoolMapping ||
          currentPoolMapping.productName !==
            productName
        ) {
          unmappedReviewProducts++;

          updateStep(
            "reviews",
            "working",
            `${index + 1}/${finalCandidates.length} · ${productName || "상품명 없음"} · 현재 실행 DB mapping 없음 → Advisor FIVE 대상 제외`,
          );

          continue;
        }

        // ADVISOR FIVE PRE-DEEP IDENTITY GATE
        if (
          isAdvisorReviewIdentityReady(
            currentPoolMapping,
            advisorReviewDbIds,
            advisorReviewOrigins,
          )
        ) {
          updateStep(
            "reviews",
            "working",
            `${index + 1}/${finalCandidates.length} · ${productName} · 현재 Advisor FIVE 준비 identity와 중복 → 심층리뷰 수집 생략`,
          );

          continue;
        }

        const reviewSourceUrl =
          cleanText(
            detail.reviewSourceUrl,
          );

        const existingReviewObjects:
          BrowserReview[] =
          Array.isArray(
            detail.reviews,
          )
            ? detail.reviews
            : [];

        let selectedReviewObjects:
          BrowserReview[] =
          existingReviewObjects;

        let sourceMode:
          | "smartstore-deep"
          | "catalog-deep"
          | "brandstore-deep"
          | "existing-shallow" =
          "existing-shallow";

        const isSmartStoreReviewSource =
          reviewSourceUrl.startsWith(
            "https://smartstore.naver.com/",
          ) ||
          reviewSourceUrl.startsWith(
            "https://m.smartstore.naver.com/",
          );

        const isCatalogReviewSource =
          reviewSourceUrl.startsWith(
            "https://search.shopping.naver.com/catalog/",
          );

        const isBrandStoreReviewSource =
          reviewSourceUrl.startsWith(
            "https://brand.naver.com/",
          ) ||
          reviewSourceUrl.startsWith(
            "https://m.brand.naver.com/",
          );

        const supportsDeepReviewSource =
          isSmartStoreReviewSource ||
          isCatalogReviewSource ||
          isBrandStoreReviewSource;

        if (
          supportsDeepReviewSource
        ) {
          const deepSourceLabel =
            isCatalogReviewSource
              ? "Catalog"
              : isBrandStoreReviewSource
                ? "Brand Store"
                : "SmartStore";

          updateStep(
            "reviews",
            "working",
            `${index + 1}/${finalCandidates.length} · ${productName} · ${deepSourceLabel} 최대 1,000개 심층 수집 중...`,
          );

          const deepResult =
            await collectDeepNaverReviews(
              productName,
              reviewSourceUrl,
              1000,
            );

          const deepProbe =
            deepResult.probe ??
            {};

          const deepReviews =
            Array.isArray(
              deepProbe.reviews,
            )
              ? deepProbe.reviews
              : [];

          if (
            deepReviews.length >
            0
          ) {
            selectedReviewObjects =
              deepReviews;

            sourceMode =
              isCatalogReviewSource
                ? "catalog-deep"
                : isBrandStoreReviewSource
                  ? "brandstore-deep"
                  : "smartstore-deep";

            deepCollectedProducts++;
          } else {
            shallowFallbackProducts++;
          }
        } else {
          shallowFallbackProducts++;
        }

        const analysisReviewObjects =
          selectAnalysisReviewObjects(
            selectedReviewObjects,
            ANALYSIS_REVIEW_LIMIT,
          );

        const reviews =
          Array.from(
            new Set(
              analysisReviewObjects
                .map(
                  (review) =>
                    cleanText(
                      review.text ??
                      review.reviewContent,
                    ),
                )
                .filter(
                  Boolean,
                ),
            ),
          ).slice(
            0,
            ANALYSIS_REVIEW_LIMIT,
          );

        const lowScore =
          analysisReviewObjects.filter(
            (review) => {
              const rating =
                Number(
                  review.rating ??
                  review.score ??
                  review.reviewScore ??
                  0,
                );

              return (
                rating >
                  0 &&
                rating <=
                  3
              );
            },
          ).length;

        if (
          reviews.length <
          30
        ) {
          insufficientReviewProducts++;

          updateStep(
            "reviews",
            "working",
            `${index + 1}/${finalCandidates.length} · ${productName} · 실제 리뷰 본문 ${reviews.length}개 → 추천 분석 대상 제외`,
          );

          continue;
        }

        markAdvisorReviewIdentityReady(
          currentPoolMapping,
          advisorReviewDbIds,
          advisorReviewOrigins,
        );

reviewCollections.push({
          productId,
          productName,
          reviewSourceUrl,
          reviews,
          reviewObjects:
            analysisReviewObjects,
          collectionStats: {
            total:
              reviews.length,
            ranking:
              sourceMode ===
                "smartstore-deep" ||
              sourceMode ===
                "catalog-deep" ||
              sourceMode ===
                "brandstore-deep"
                ? reviews.length
                : 0,
            latest:
              sourceMode ===
              "existing-shallow"
                ? reviews.length
                : 0,
            lowScore,
          },
          sourceMode,
        });
      }

      updateStep(
        "reviews",
        "done",
        `${reviewCollections.length}개 분석용 리뷰 corpus 확보` +
          ` · AI 분석 corpus 제품당 최대 ${ANALYSIS_REVIEW_LIMIT}개` +
          ` · SmartStore/Catalog/Brand 심층 ${deepCollectedProducts}개` +
          (
            shallowFallbackProducts >
            0
              ? ` · 기존 리뷰 사용 ${shallowFallbackProducts}개`
              : ""
          ) +
          (
            insufficientReviewProducts >
            0
              ? ` · 리뷰 본문 30개 미만 ${insufficientReviewProducts}개 제외`
              : ""
          ),
      );

      // The pool is not the recommendation set. Select only current-run mapped identities.
      const eligible = reviewCollections.flatMap(collection => {
        const mapping = mappedProducts.get(Number(collection.productId));
        if (!mapping || mapping.productName !== collection.productName) return [];
        return [{ ...collection, ...mapping, ...selectionRun }];
      });
      const selected = selectEligibleFive(eligible, selectionRun);
      assertSelectionRun(window.sessionStorage, selectionRun);

      let profile: Record<string, unknown>;

      if (normalizedCategory !== "로봇청소기") {
        try {
          profile =
            await fetchCategoryProfile(
              normalizedCategory,
            );

          updateStep(
            "criteria-first",
            "done",
            "기존 카테고리 구매기준 5개 재사용 · OpenAI 0회",
          );
        } catch {
          const productIds =
            selected.map(
              (product) =>
                product.dbProductId,
            );

          if (productIds.length !== 5) {
            throw new Error(
              "기준 생성에는 현재 실행의 정확한 5개가 필요합니다.",
            );
          }

          updateStep(
            "criteria-first",
            "working",
            "카테고리 구매기준이 없어 선택한 5개 제품으로 무료 사전검증 중...",
          );

          const criteriaPlan =
            await prepareCategoryCriteria(
              normalizedCategory,
              productIds,
            );

          assertSelectionRun(
            window.sessionStorage,
            selectionRun,
          );

          const approvedCriteria =
            await requestApproval({
              title:
                "카테고리 구매기준이 없습니다. 선택한 5개 제품으로 최초 생성할까요?",
              lines: [
                ...selected.map(
                  (product) =>
                    `${product.productName} (${product.dbProductId})`,
                ),
                "",
                `예상 OpenAI 최대 ${criteriaPlan.estimatedOpenAiCalls}회`,
              ],
              confirmLabel:
                "구매기준 최초 생성",
              cancelLabel:
                "취소",
            });

          if (!approvedCriteria) {
            throw new Error(
              "구매기준 유료 생성을 취소했습니다.",
            );
          }

          assertSelectionRun(
            window.sessionStorage,
            selectionRun,
          );

          await executeCategoryCriteria(
            criteriaPlan,
          );

          assertSelectionRun(
            window.sessionStorage,
            selectionRun,
          );

          profile =
            await fetchCategoryProfile(
              normalizedCategory,
            );

          updateStep(
            "criteria-first",
            "done",
            "카테고리 구매기준 최초 생성 완료",
          );
        }
      } else {
        profile =
          await fetchCategoryProfile(
            normalizedCategory,
          );

        updateStep(
          "criteria-first",
          "done",
          "기존 frozen 로봇청소기 구매기준 사용",
        );
      }

      const profileRevision =
        categoryProfileRevision(
          profile,
        );
      reviewProgress.total = selected.length;
      showReviewProgress("무료 사전검증 시작", "무료 사전검증 실패");
      const plans = [];
      for (const product of selected) {
        showReviewProgress("무료 사전검증 중", "무료 사전검증 실패", product.productName);
        const input = { category: normalizedCategory, productName: product.productName,
          originProductNo: product.originProductNo, reviews: product.reviews,
          collectionStats: product.collectionStats, executionMode: "full" };
        const response = await fetch("/api/analyze-reviews", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, dryRun: true }),
        });
        const result = await readJson(response);
        const maximum = Number(result.estimatedOpenAiCalls);
        const pipelineVersion = cleanText(result.pipelineVersion);
        const reviewQualitySource = cleanText(result.reviewQualitySource);
        if (!response.ok || result.success !== true || result.dryRun !== true ||
            result.paidApiCalls !== 0 || typeof result.inputFingerprint !== "string" ||
            !/^[a-f0-9]{64}$/.test(result.inputFingerprint) || !pipelineVersion ||
            !reviewQualitySource || !Number.isSafeInteger(maximum) ||
            maximum < 1 || maximum > 2 * Math.ceil(product.reviews.length / 50) + 1) {
          throw new Error(cleanText(result.message) || "리뷰 무료 사전검증 계약이 일치하지 않습니다.");
        }

        const identity = { category: normalizedCategory, dbProductId: product.dbProductId,
          originProductNo: product.originProductNo, productName: product.productName };
        showReviewProgress("기존 분석 재사용 조건 확인 중", "기존 분석 확인 실패");
        const existingAnalysis =
          await fetchCurrentReviewAnalysisSnapshot(identity);
        const reusable =
          existingAnalysis !== null &&
          cleanText(existingAnalysis.inputFingerprint) === result.inputFingerprint &&
          cleanText(existingAnalysis.pipelineVersion) === pipelineVersion &&
          cleanText(existingAnalysis.reviewQualitySource) === reviewQualitySource &&
          Number(existingAnalysis.reviewCount) === product.reviews.length;

        plans.push({ product, input, fingerprint: result.inputFingerprint, maximum,
          pipelineVersion, reviewQualitySource, existingAnalysis, reusable });
      }
      showReviewProgress("현재 실행 확인 중", "현재 실행 확인 실패", "");
      assertSelectionRun(window.sessionStorage, selectionRun);
      const paidMaximum =
        plans.reduce(
          (sum, plan) =>
            sum +
            (plan.reusable
              ? 0
              : plan.maximum),
          0,
        );
      const reusableCount =
        plans.filter(
          (plan) => plan.reusable,
        ).length;
      showReviewProgress(
        paidMaximum === 0 ? "기존 동일 분석 재사용 준비" : "무료 사전검증 완료 · 실행 승인 대기",
        "실행 승인 확인 실패",
      );
      const approved =
        paidMaximum === 0 ||
        await requestApproval({
          title:
            "현재 실행의 최종 후보 5개 리뷰를 분석할까요?",
          lines: [
            ...plans.map(
              (plan) =>
                `${plan.product.productName} (${plan.product.dbProductId}) · 리뷰 ${plan.product.reviews.length}개 · ${plan.reusable ? "기존 동일 fingerprint 분석 재사용 · 0회" : `최대 ${plan.maximum}회`}`,
            ),
            "",
            `무료 사전검증 완료 · 기존 분석 재사용 ${reusableCount}개 · OpenAI 최대 ${paidMaximum}회`,
            "동일 fingerprint·pipeline·reviewCount가 확인된 분석만 재사용합니다.",
            "취소하면 유료 리뷰 호출은 없습니다.",
            "분석/재사용 성공 후 동일 corpus 원문도 서버 fingerprint 검증 후 저장합니다.",
          ],
          confirmLabel:
            "필요한 리뷰 분석만 실행",
          cancelLabel:
            "취소",
        });

      if (!approved) {
        reviewProgress.failure = "사용자 취소";
        throw new Error(
          "무료 사전검증 후 리뷰 분석을 취소했습니다.",
        );
      }
      showReviewProgress("승인 완료 · 리뷰 분석 준비", "분석 준비 실패", "");
      const readyProducts: SelectedProduct[] = [];
      for (const plan of plans) {
        const productProgressMessage = `리뷰 분석 중 · ${reviewProgress.completed + 1}/${reviewProgress.total} · ${plan.product.productName}`;
        showReviewProgress("현재 실행·프로필 확인 중", "현재 실행·프로필 확인 실패", plan.product.productName, productProgressMessage);
        assertSelectionRun(window.sessionStorage, selectionRun);
        if (categoryProfileRevision(await fetchCategoryProfile(normalizedCategory)) !== profileRevision) {
          throw new Error("프로필이 변경되어 승인된 리뷰 분석을 중단합니다.");
        }
        assertSelectionRun(window.sessionStorage, selectionRun);
        const identity = { category: normalizedCategory, dbProductId: plan.product.dbProductId,
          originProductNo: plan.product.originProductNo, productName: plan.product.productName };
        if (!plan.reusable) {
          showReviewProgress("보관 결과 확인·저장 재시도 중", "보관 결과 확인·저장 재시도 실패");
          const retried = await retryStoredReviewAnalysisPersistence(identity, plan.fingerprint);
          if (!retried) {
            showReviewProgress("분석 전 DB snapshot 확인 중", "분석 전 DB snapshot 확인 실패");
            const expectedReviewAnalysis = await fetchCurrentReviewAnalysisSnapshot(identity);
            assertSelectionRun(window.sessionStorage, selectionRun);
            // Persist attempt state before sending; no transport/parse/model retry.
            window.sessionStorage.setItem("projectDReviewLastAttempt", JSON.stringify({
              ...selectionRun, dbProductId: plan.product.dbProductId, inputFingerprint: plan.fingerprint, status: "attempted",
            }));
            showReviewProgress("AI 분석 중", "AI 분석 결과 확인 실패", plan.product.productName, productProgressMessage);
            const response = await fetch("/api/analyze-reviews", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...plan.input, inputFingerprint: plan.fingerprint }),
            });
            const result = await readJson(response);
            const analysis = result.analysis as Record<string, unknown> | undefined;
            if (!response.ok || result.success !== true || result.inputFingerprint !== plan.fingerprint ||
                !analysis || analysis.reviewCount !== plan.product.reviews.length) {
              throw new Error(cleanText(result.message) || "유료 리뷰 분석 실패. 자동 재시도하지 않습니다.");
            }
            assertSelectionRun(window.sessionStorage, selectionRun);
            showReviewProgress("분석 결과 저장 중", "분석 결과 저장 확인 실패");
            await storeAndSaveReviewAnalysis({
              ...identity,
              expectedReviewAnalysis, analysis, inputFingerprint: plan.fingerprint,
            });
          }
        }
        showReviewProgress(
          plan.reusable ? "기존 동일 분석 재사용 · 동일 fingerprint 원문 저장 확인 중"
            : "분석 저장 확인됨 · 동일 fingerprint 원문 저장 중",
          "동일 fingerprint 원문 저장 확인 실패",
        );
        assertSelectionRun(window.sessionStorage, selectionRun);
        const rawSaveResponse = await fetch("/api/save-review-raw-batch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: normalizedCategory, products: [{
            dbProductId: plan.product.dbProductId, originProductNo: plan.product.originProductNo,
            productName: plan.product.productName, reviews: plan.product.reviews,
            collectionStats: plan.product.collectionStats, sourceMode: plan.product.sourceMode,
            reviewSourceUrl: plan.product.reviewSourceUrl, inputFingerprint: plan.fingerprint,
            collectionMetadata: { reviewObjects: plan.product.reviewObjects },
          }] }),
        });
        const rawSaved = await readJson(rawSaveResponse);
        const rawResults = Array.isArray(rawSaved.results) ? rawSaved.results : [];
        const rawSavedItem =
          rawResults[0] && typeof rawResults[0] === "object" && !Array.isArray(rawResults[0])
            ? rawResults[0] as Record<string, unknown>
            : null;
        if (!rawSaveResponse.ok || rawSaved.success !== true || rawSaved.successCount !== 1 ||
            rawSaved.rawCorpusPersisted !== true || !rawSavedItem ||
            rawSavedItem.dbProductId !== plan.product.dbProductId ||
            rawSavedItem.inputFingerprint !== plan.fingerprint ||
            rawSavedItem.rawCorpusPersisted !== true ||
            rawSavedItem.savedReviewCount !== plan.product.reviews.length) {
          throw new Error(cleanText(rawSaved.message) || "분석에 사용한 동일 review corpus를 정확한 제품 identity로 저장하지 못했습니다.");
        }

        readyProducts.push({ dbProductId: plan.product.dbProductId, originProductNo: plan.product.originProductNo,
          productName: plan.product.productName, readiness: { runId: selectionRun.runId,
            reviewCount: plan.product.reviews.length, reviewAnalysisSaved: true,
            analysisFingerprint: plan.fingerprint, rawCorpusPersisted: true } });
        // Count only products that passed analysis persistence and raw-corpus checks.
        reviewProgress.completed = readyProducts.length;
        showReviewProgress(
          plan.reusable ? "기존 분석 재사용·동일 원문 저장 확인 완료" : "분석·동일 원문 저장 확인 완료",
          "제품 처리 후 확인 실패",
          plan.product.productName,
          `리뷰 분석 저장 완료 · ${reviewProgress.completed}/${reviewProgress.total}`,
        );
      }
      showReviewProgress("제품 처리 완료 · 최종 프로필 검증 중", "최종 프로필 검증 실패", "");
      if (categoryProfileRevision(await fetchCategoryProfile(normalizedCategory)) !== profileRevision) {
        throw new Error("프로필 revision이 변경되어 최종 5개를 발행하지 않습니다.");
      }
      const selectedFiveManifest: SelectedFiveManifest = {
        ...selectionRun,
        schemaVersion: 1,
        profileRevision,
        products: readyProducts,
      };

      showReviewProgress("제품 처리 완료 · 최종 선택 실행 검증 중", "최종 선택 실행 검증 실패");
      assertSelectionRun(
        window.sessionStorage,
        selectionRun,
      );

      showReviewProgress("제품 처리 완료 · 최종 선택 발행 중", "최종 선택 발행 확인 실패");
      await persistPublishedSelectedFive(
        selectedFiveManifest,
      );

      showReviewProgress("제품 처리 완료 · 발행된 선택 로컬 반영 중", "발행된 선택 로컬 반영 실패");
      publishSelectedFive(
        window.sessionStorage,
        selectedFiveManifest,
      );
      updateStep("save-reviews", "done", "현재 실행의 5개 분석 + 동일 fingerprint review corpus 저장 완료");
      reviewProgress.active = false;
      // Do not regenerate the profile after binding review analysis to its revision.
      updateStep("criteria-final", "done", "분석에 사용한 프로필 revision으로 최종 5개 고정");
      setFinalMessage("최종 5개 준비 완료. 관리자에서 같은 5개 UUID의 점수 생성을 승인한 뒤 Advisor로 진행해 주세요.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "자동 실행 중 오류가 발생했습니다.";

      const progressError = reviewProgress.active
        ? reviewProgressMessage(`${reviewProgress.failure} · ${message}`)
        : null;
      if (progressError) {
        updateStep("save-reviews", "error", progressError);
      } else {
        setSteps(
          (current) => {
            let changed =
              false;

            return current.map(
              (step) => {
                if (
                  !changed &&
                  step.status ===
                    "working"
                ) {
                  changed =
                    true;

                  return {
                    ...step,

                    status:
                      "error",

                    message,
                  };
                }

                return step;
              },
            );
          },
        );
      }

      setFinalMessage(
        `중단됨 · ${progressError ?? message}`,
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        marginTop: 28,
        padding: 28,
        border:
          "2px solid #c7d7fe",
        background:
          "#f8faff",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#3538cd",
          letterSpacing:
            "0.08em",
          marginBottom: 8,
        }}
      >
        PROJECT D AUTOMATION
      </div>

      <h2 style={{ margin: 0 }}>
        카테고리 상품 DB 자동 구축
      </h2>

      <p
        style={{
          margin:
            "8px 0 0",
          color: "#667085",
          lineHeight: 1.7,
        }}
      >
        제품군만 입력하면 가격 제한 없이 시장 상품을 수집하고, 유효 상품 검증·DB 등록·공통 구매기준·리뷰 분석까지 자동 처리합니다. 고객별 비교점수와 최종 추천은 구매 상담 단계에서 별도로 계산합니다.
      </p>

      <div
        className="field"
        style={{
          marginTop: 22,
        }}
      >
        <label htmlFor="automationCategory">
          제품군
        </label>

        <input
          id="automationCategory"
          className="textInput"
          value={category}
          disabled={isRunning}
          onChange={(event) =>
            setCategory(
              event.target.value,
            )
          }
          placeholder="예: 로봇청소기"
        />
      </div>

      <label
        style={{
          marginTop: 18,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid #b2ccff",
          background: "#eff8ff",
          cursor: isRunning
            ? "default"
            : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={safePilotMode}
          disabled={isRunning}
          onChange={(event) =>
            setSafePilotMode(
              event.target.checked,
            )
          }
          style={{
            marginTop: 3,
          }}
        />

        <span
          style={{
            lineHeight: 1.55,
          }}
        >
          <strong>
            무과금 파일럿 모드
          </strong>

          <span
            style={{
              display: "block",
              marginTop: 2,
              color: "#475467",
              fontSize: 13,
            }}
          >
            브라우저에서 동일 상품·리뷰 근거가 검증된 Naver Catalog/SmartStore 상품만 사용해 1~3단계까지만 실행합니다. resolver · Bright Data · OpenAI 호출은 0회로 강제합니다.
          </span>
        </span>
      </label>

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gap: 10,
        }}
      >
        {steps.map(
          (step) => (
            <div
              key={step.key}
              style={{
                display:
                  "flex",
                alignItems:
                  "flex-start",
                gap: 10,
                padding:
                  "12px 14px",
                borderRadius:
                  10,
                background:
                  step.status ===
                  "done"
                    ? "#ECFDF3"
                    : step.status ===
                        "error"
                      ? "#FEF3F2"
                      : step.status ===
                          "working"
                        ? "#EFF8FF"
                        : "#ffffff",
                border:
                  "1px solid #e4e7ec",
              }}
            >
              <span
                style={{
                  width: 22,
                  flex:
                    "0 0 22px",
                  fontWeight:
                    800,
                }}
              >
                {step.status ===
                "done"
                  ? "✓"
                  : step.status ===
                      "working"
                    ? "…"
                    : step.status ===
                        "error"
                      ? "!"
                      : "○"}
              </span>

              <div>
                <strong>
                  {step.label}
                </strong>

                {step.message ? (
                  <div
                    style={{
                      marginTop: 3,
                      color:
                        "#667085",
                      fontSize: 13,
                      lineHeight:
                        1.5,
                    }}
                  >
                    {step.message}
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}
      </div>

      {poolDiagnosticView ? (
        <details style={{ marginTop: 16 }}>
          <summary>같은 capture 기준 후보 감소 진단</summary>
          <p>Capture: {poolDiagnosticView.captureId}</p>
          <p>카드 수는 DOM 요소와 상품명 기준 관측 수이며 고유 상품 수가 아닙니다. 이름·가격·URL 수와 탈락 원인은 중복될 수 있습니다.</p>
          <p>포화는 현재 검색 결과에서 고유 카드 근거와 최종 후보가 함께 늘지 않는다는 추정입니다. 성장 판단은 같은 이름·URL의 DOM 재생성을 새 상품으로 세지 않으며, 전체 시장에 상품이 없다는 뜻은 아닙니다.</p>
          <p>향후 MARKET POOL 20~30개는 strict-valid 상품이 충분할 때의 희망 범위이며 강제 최소치가 아닙니다. 이번 단계는 기존 DB 저장·추천 5개 정책을 유지합니다.</p>
          <p>무료 자격 평가는 정규화 전체, FULL 결과는 실제 검사한 후보 기준입니다. 최종 무료 수는 5개 shortcut 적용 전입니다. 미제공 값은 0을 뜻하지 않습니다.</p>
          <ul>{poolDiagnosticLines(poolDiagnosticView).map(line => <li key={line}>{line}</li>)}</ul>

          <details style={{ marginTop: 8 }}>
            <summary>무료 자격 탈락 후보별 진단</summary>

            <ul>
              {poolDiagnosticCandidateLines(
                poolDiagnosticView,
              ).map(
                (line, index) => (
                  <li
                    key={`${index}-${line}`}
                  >
                    {line}
                  </li>
                ),
              )}
            </ul>
          </details>
          <p>유료 전 relevance 사전판정은 현재 상품명만 사용하며, 명백한 excluded만 비용 경로에서 제외합니다. needs-review는 유지하고 최종 FULL relevance는 기존대로 다시 실행합니다.</p>
          <p>유료 계획은 예상 경로입니다. 기존 비용 카운터는 실제 비용 차단용으로 불완전합니다.</p>
        </details>
      ) : null}

      <button
        type="button"
        className="primaryButton"
        onClick={() =>
          void run()
        }
        disabled={isRunning}
        style={{
          width: "100%",
          marginTop: 20,
        }}
      >
        {isRunning
          ? safePilotMode
            ? "Project D 무과금 파일럿 실행 중..."
            : "Project D 자동 실행 중..."
          : safePilotMode
            ? "무과금 파일럿 실행"
            : "카테고리 상품 DB 자동 구축"}
      </button>

      {finalMessage ? (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 10,
            background:
              finalMessage.startsWith(
                "완료",
              )
                ? "#ECFDF3"
                : "#FEF3F2",
            lineHeight: 1.6,
            fontWeight: 700,
          }}
        >
          {finalMessage}
        </div>
      ) : null}

      <ProjectDApprovalDialog dialog={approvalDialog} onDecision={resolveApproval} />
    </div>
  );
}
