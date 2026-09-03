"use client";

import {
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
  imageUrl?: string;
  sourceUrl?: string;
  reviewCount?: number;
  rating?: number;
  browserReviews?: BrowserReview[];
  browserReviewSourceUrl?: string;
  browserSpecs?: Record<string, string>;
  browserCatalogTitle?: string;
};

type BrowserBridgeCandidate = {
  name?: string;
  seller?: string;
  price?: number;
  imageUrl?: string;
  url?: string;
  reviewCount?: number;
  rating?: number;
  browserReviews?: BrowserReview[];
  smartstoreReviewProbe?: {
    finalUrl?: string;
    sourceType?: string;
    reviewCountReturned?: number;
    specs?: Record<string, string>;
    catalogTitle?: string;
  };
};

type BrowserBridgeResponse = {
  rawProducts?: number;
  candidates?: BrowserBridgeCandidate[];
};

type FinalCandidate = {
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
    key: "criteria-first",
    label: "4. 1차 구매기준 생성",
    status: "idle",
    message: "",
  },
  {
    key: "reviews",
    label: "5. 최대 1,000개 리뷰 심층 수집",
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
    label: "7. 구매기준 최종 보정",
    status: "idle",
    message: "",
  },
];

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

export default function ProjectDAutomationPanel() {
  const [
    category,
    setCategory,
  ] = useState(
    "로봇청소기",
  );

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

    setSteps(
      INITIAL_STEPS.map(
        (step) => ({
          ...step,
        }),
      ),
    );

    setFinalMessage("");

    try {
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
                targetCount: 100,
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

              return (
                /^https:\/\/search\.shopping\.naver\.com\/catalog\/\d+/i.test(
                  sourceUrl,
                ) &&
                catalogTitle.length > 0 &&
                specCount > 0 &&
                browserReviewCount >= 5
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

            browserSpecs:
              candidate.browserSpecs &&
              typeof candidate.browserSpecs === "object"
                ? candidate.browserSpecs
                : {},

            browserCatalogTitle:
              cleanText(
                candidate.browserCatalogTitle,
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

      const enrichedResponse =
        await fetch(
          `/api/market-candidates-enriched?captureId=${encodeURIComponent(
            captureId,
          )}`,
          {
            cache: "no-store",
          },
        );

      const enriched =
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
            "full",
        );

      if (
        finalCandidates.length === 0
      ) {
        const partialCount =
          Number(
            enriched.partialCandidateCount ??
              0,
          ) || 0;

        throw new Error(
          "DB에 등록할 full 유효 상품을 확보하지 못했습니다." +
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
        )}회`,
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

      const currentRunProductNames =
        finalCandidates
          .map((candidate) =>
            cleanText(
              candidate.detail?.productName,
            ),
          )
          .filter(Boolean);

      const importResults =
        Array.isArray(
          importResult.results,
        )
          ? (
              importResult.results as Array<{
                success?: boolean;
                product?: {
                  id?: string;
                };
              }>
            )
          : [];

      const currentRunProductIds =
        importResults
          .filter(
            (result) =>
              result.success === true,
          )
          .map((result) =>
            cleanText(
              result.product?.id,
            ),
          )
          .filter(Boolean);

      if (
        currentRunProductNames.length === 0 ||
        currentRunProductIds.length !==
          currentRunProductNames.length
      ) {
        throw new Error(
          `상품 풀 DB 등록 결과가 일치하지 않습니다. 제품명 ${currentRunProductNames.length}개 · UUID ${currentRunProductIds.length}개입니다.`,
        );
      }

      window.sessionStorage.setItem(
        "projectDAutomationProductNames",
        JSON.stringify({
          category:
            normalizedCategory,
          productNames:
            currentRunProductNames,
          productIds:
            currentRunProductIds,
        }),
      );

      /*
        4단계
        리뷰분석 API가 구매기준을 사용하므로
        상세정보 기반 1차 구매기준 생성.
      */
      updateStep(
        "criteria-first",
        "working",
        "리뷰 분석용 1차 구매기준을 생성하는 중...",
      );

      const firstCriteriaResponse =
        await fetch(
          "/api/generate-category-criteria",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              category:
                normalizedCategory,
            }),
          },
        );

      const firstCriteriaResult =
        await readJson(
          firstCriteriaResponse,
        );

      if (
        !firstCriteriaResponse.ok ||
        firstCriteriaResult.success !==
          true
      ) {
        throw new Error(
          cleanText(
            firstCriteriaResult.message,
          ) ||
            "1차 구매기준 생성에 실패했습니다.",
        );
      }

      updateStep(
        "criteria-first",
        "done",
        "1차 구매기준 생성 완료",
      );

      /*
        5단계
        DB 등록이 끝난 상품만 심층 리뷰를 수집한다.

        중요:
        - 시장 후보 전체를 1,000개씩 수집하지 않는다.
        - SmartStore, Naver Catalog, Brand Store reviewSource는 deep mode를 사용한다.
        - 세 소스 모두 DB 등록이 끝난 상품에 한해서만 deep mode를 사용한다.
      */
      updateStep(
        "reviews",
        "working",
        `${finalCandidates.length}개 DB 상품의 리뷰 소스를 확인하는 중...`,
      );

      const reviewCollections:
        Array<{
          productId: string;
          productName: string;
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

      for (
        let index = 0;
        index <
        finalCandidates.length;
        index++
      ) {
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

        const reviews =
          Array.from(
            new Set(
              selectedReviewObjects
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
            1000,
          );

        const lowScore =
          selectedReviewObjects.filter(
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

        reviewCollections.push({
          productId,
          productName,
          reviews,
          reviewObjects:
            selectedReviewObjects,
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

      /*
        6단계의 AI 분석은 아래에서 reviewCollections를 사용한다.

        현재 /api/analyze-reviews에는 아직 200개 cap이 있으므로
        실제 Admin 실행 전에 다음 패치에서 100~200개 단위 batch 분석 +
        최종 aggregation으로 교체한다.
      */
      const analyzedProducts:
        Array<{
          productId: string;
          productName: string;
          analysis: unknown;
          reviews: string[];
          collectionStats: {
            total: number;
            ranking: number;
            latest: number;
            lowScore: number;
          };
        }> = [];

      let skippedReviewProducts =
        insufficientReviewProducts;

      updateStep(
        "save-reviews",
        "working",
        `${reviewCollections.length}개 제품 리뷰를 AI 분석하는 중...`,
      );

      for (
        let index = 0;
        index <
        reviewCollections.length;
        index++
      ) {
        const collection =
          reviewCollections[index];

        updateStep(
          "save-reviews",
          "working",
          `${index + 1}/${reviewCollections.length} · ${collection.productName} · 리뷰 ${collection.reviews.length}개`,
        );

        const analyzeResponse =
          await fetch(
            "/api/analyze-reviews",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  productName:
                    collection.productName,

                  category:
                    normalizedCategory,

                  reviews:
                    collection.reviews,

                  collectionStats:
                    collection.collectionStats,
                }),
            },
          );

        const analyzeResult =
          await readJson(
            analyzeResponse,
          );

        if (
          !analyzeResponse.ok ||
          analyzeResult.success !==
            true
        ) {
          throw new Error(
            `${collection.productName}: ${
              cleanText(
                analyzeResult.message,
              ) ||
              "리뷰 AI 분석 실패"
            }`,
          );
        }

        analyzedProducts.push({
          productId:
            collection.productId,

          productName:
            collection.productName,

          analysis:
            analyzeResult.analysis,

          reviews:
            collection.reviews,

          collectionStats:
            collection.collectionStats,
        });
      }

      /*
        6단계
        심층/기존 리뷰 corpus를 batch AI 분석한 결과만 저장한다.

        리뷰 본문 30개 미만 제품은 review_analysis를 꾸며내지 않고
        기존 null/미분석 상태로 둔다.
      */
      if (
        analyzedProducts.length >
        0
      ) {
        updateStep(
          "save-reviews",
          "working",
          "리뷰 batch AI 분석 결과와 실제 리뷰 corpus를 DB에 저장하는 중...",
        );

        const saveResponse =
          await fetch(
            "/api/save-review-analysis-batch",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                category:
                  normalizedCategory,

                products:
                  analyzedProducts,
              }),
            },
          );

        const saveResult =
          await readJson(
            saveResponse,
          );

        if (
          !saveResponse.ok ||
          saveResult.success !==
            true
        ) {
          throw new Error(
            cleanText(
              saveResult.message,
            ) ||
              "리뷰 분석 DB 저장에 실패했습니다.",
          );
        }

        updateStep(
          "save-reviews",
          "done",
          `${Number(
            saveResult.successCount ??
              0,
          )}개 저장 완료` +
            (
              skippedReviewProducts > 0
                ? ` · ${skippedReviewProducts}개 미분석 유지`
                : ""
            ),
        );
      } else {
        updateStep(
          "save-reviews",
          "done",
          "저장할 리뷰 분석 없음 · 리뷰 본문 30개 미만 제품은 미분석 상태로 유지",
        );
      }

      /*
        7단계
        상세정보 + 리뷰 분석을 모두 사용해
        최종 구매기준 재생성.
      */
      updateStep(
        "criteria-final",
        "working",
        "상세정보와 리뷰 근거를 함께 사용해 구매기준을 최종 보정하는 중...",
      );

      const finalCriteriaResponse =
        await fetch(
          "/api/generate-category-criteria",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              category:
                normalizedCategory,
            }),
          },
        );

      const finalCriteriaResult =
        await readJson(
          finalCriteriaResponse,
        );

      if (
        !finalCriteriaResponse.ok ||
        finalCriteriaResult.success !==
          true
      ) {
        throw new Error(
          cleanText(
            finalCriteriaResult.message,
          ) ||
            "최종 구매기준 생성에 실패했습니다.",
        );
      }

      updateStep(
        "criteria-final",
        "done",
        "최종 구매기준 보정 완료",
      );

      setFinalMessage(
        `완료 · ${normalizedCategory} 유효 상품 ${finalCandidates.length}개 DB 구축과 공통 분석이 끝났습니다.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "자동 실행 중 오류가 발생했습니다.";

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

      setFinalMessage(
        `중단됨 · ${message}`,
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
          ? "Project D 자동 실행 중..."
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
    </div>
  );
}
