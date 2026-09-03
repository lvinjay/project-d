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
    reviews?: Array<{
      rating?: number;
      date?: string;
      text?: string;
      helpfulCount?: number;
    }>;
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
    label: "1. 시장 후보 자동 수집",
    status: "idle",
    message: "",
  },
  {
    key: "enrich",
    label: "2. 최종 후보 5개 검증",
    status: "idle",
    message: "",
  },
  {
    key: "import",
    label: "3. 제품 DB 등록",
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
    label: "5. 리뷰 AI 분석",
    status: "idle",
    message: "",
  },
  {
    key: "save-reviews",
    label: "6. 리뷰 분석 DB 저장",
    status: "idle",
    message: "",
  },
  {
    key: "criteria-final",
    label: "7. 구매기준 최종 보정",
    status: "idle",
    message: "",
  },
  {
    key: "scores",
    label: "8. 제품별 비교 점수 생성",
    status: "idle",
    message: "",
  },
];

function parsePrice(
  value: string,
) {
  const digits =
    value.replace(
      /[^\d]/g,
      "",
    );

  return digits
    ? Number(digits)
    : 0;
}

function displayPrice(
  value: string,
) {
  const price =
    parsePrice(value);

  return price
    ? price.toLocaleString(
        "ko-KR",
      )
    : "";
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

export default function ProjectDAutomationPanel() {
  const [
    category,
    setCategory,
  ] = useState(
    "로봇청소기",
  );

  const [
    minBudget,
    setMinBudget,
  ] = useState(
    "500,000",
  );

  const [
    maxBudget,
    setMaxBudget,
  ] = useState(
    "1,500,000",
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

  async function run() {
    const normalizedCategory =
      category.trim();

    const min =
      parsePrice(
        minBudget,
      );

    const max =
      parsePrice(
        maxBudget,
      );

    if (!normalizedCategory) {
      alert(
        "제품군을 입력하세요.",
      );
      return;
    }

    if (
      min > 0 &&
      max > 0 &&
      min > max
    ) {
      alert(
        "최소 예산은 최대 예산보다 작아야 합니다.",
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
                minBudget: min,
                maxBudget: max,
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
                min,

              maxBudget:
                max,

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
        최대 15개 후보를
        공식 URL + Bright Data로 상세 검증해
        최종 5개를 확보한다.
      */
      updateStep(
        "enrich",
        "working",
        "최대 15개 후보의 실제 판매가·리뷰·중복·공식 상품 URL을 검증하는 중...",
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
        enriched.targetReached !==
          true ||
        finalCandidates.length < 5
      ) {
        const partialCount =
          Number(
            enriched.partialCandidateCount ??
              0,
          ) || 0;

        throw new Error(
          `full 유효 후보가 5개에 도달하지 못했습니다. 현재 ${finalCandidates.length}개` +
            (partialCount > 0
              ? ` · partial 예비 후보 ${partialCount}개`
              : "") +
            "입니다.",
        );
      }

      updateStep(
        "enrich",
        "done",
        `${finalCandidates.length}개 최종 후보 확보 · Bright Data ${Number(
          enriched.brightDataCalls ??
            0,
        )}회`,
      );

      /*
        3단계
        최종 5개를 products에 등록/갱신.
      */
      updateStep(
        "import",
        "working",
        "최종 후보를 제품 DB에 등록하는 중...",
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
        currentRunProductNames.length !== 5 ||
        currentRunProductIds.length !== 5
      ) {
        throw new Error(
          `현재 실행의 최종 제품명/UUID가 정확히 5개여야 합니다. 제품명 ${currentRunProductNames.length}개 · UUID ${currentRunProductIds.length}개입니다.`,
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
        Bright Data에서 확보한 리뷰를
        제품별로 AI 분석.
      */
      updateStep(
        "reviews",
        "working",
        "제품 5개의 리뷰를 순서대로 AI 분석 중...",
      );

      const analyzedProducts:
        Array<{
          productId: string;
          productName: string;
          analysis: unknown;
        }> = [];

      let skippedReviewProducts =
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

        const reviewObjects =
          Array.isArray(
            detail.reviews,
          )
            ? detail.reviews
            : [];

        const reviews =
          reviewObjects
            .map(
              (review) =>
                cleanText(
                  review.text,
                ),
            )
            .filter(Boolean);

        const lowScore =
          reviewObjects.filter(
            (review) => {
              const rating =
                Number(
                  review.rating ??
                    0,
                );

              return (
                rating > 0 &&
                rating <= 3
              );
            },
          ).length;

        if (
          reviews.length <
          5
        ) {
          skippedReviewProducts++;

          updateStep(
            "reviews",
            "working",
            `${index + 1}/${finalCandidates.length} · ${productName} · 리뷰 본문 ${reviews.length}개 → AI 분석 생략`,
          );

          continue;
        }

        updateStep(
          "reviews",
          "working",
          `${index + 1}/${finalCandidates.length} · ${productName}`,
        );

        const analyzeResponse =
          await fetch(
            "/api/analyze-reviews",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                productName,

                category:
                  normalizedCategory,

                reviews,

                collectionStats: {
                  total:
                    reviews.length,

                  ranking: 0,

                  latest:
                    reviews.length,

                  lowScore,
                },
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
            `${productName}: ${
              cleanText(
                analyzeResult.message,
              ) ||
              "리뷰 AI 분석 실패"
            }`,
          );
        }

        analyzedProducts.push({
          productId,

          productName,

          analysis:
            analyzeResult.analysis,
        });
      }

      updateStep(
        "reviews",
        "done",
        `${analyzedProducts.length}개 리뷰 AI 분석 완료` +
          (
            skippedReviewProducts > 0
              ? ` · ${skippedReviewProducts}개 리뷰 본문 부족으로 생략`
              : ""
          ),
      );

      /*
        6단계
        실제 리뷰 본문이 충분해 AI 분석까지 완료된 제품만 저장한다.

        리뷰 본문 미확보 제품은 review_analysis를 꾸며내지 않고
        기존 null/미분석 상태로 두며 이후 구매기준/점수 단계는 계속 진행한다.
      */
      if (
        analyzedProducts.length >
        0
      ) {
        updateStep(
          "save-reviews",
          "working",
          "리뷰 분석 결과를 DB에 저장하는 중...",
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
          "저장할 리뷰 분석 없음 · 리뷰 본문 미확보 제품은 미분석 상태로 계속 진행",
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

      /*
        8단계
        최종 상대평가 점수 생성.
      */
      updateStep(
        "scores",
        "working",
        "최종 제품 비교 점수를 계산하는 중...",
      );

      const scoreResponse =
        await fetch(
          "/api/generate-product-scores",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              category:
                normalizedCategory,
              productNames:
                currentRunProductNames,
            }),
          },
        );

      const scoreResult =
        await readJson(
          scoreResponse,
        );

      if (
        !scoreResponse.ok ||
        scoreResult.success !==
          true
      ) {
        throw new Error(
          cleanText(
            scoreResult.message,
          ) ||
            "제품별 점수 생성에 실패했습니다.",
        );
      }

      updateStep(
        "scores",
        "done",
        `${Number(
          scoreResult.productCount ??
            5,
        )}개 제품 비교 점수 생성 완료`,
      );

      setFinalMessage(
        `완료 · ${normalizedCategory} 최종 후보 5개와 추천 데이터 준비가 모두 끝났습니다.`,
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
        후보 수집부터 추천 준비까지 자동 실행
      </h2>

      <p
        style={{
          margin:
            "8px 0 0",
          color: "#667085",
          lineHeight: 1.7,
        }}
      >
        제품군과 예산만 입력하면 시장 후보 수집부터 최종 5개 선정, 리뷰 분석, 구매기준과 비교점수 생성까지 자동 처리합니다.
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
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: 16,
          marginTop: 18,
        }}
      >
        <div className="field">
          <label htmlFor="automationMinBudget">
            최소 예산
          </label>

          <input
            id="automationMinBudget"
            className="textInput"
            inputMode="numeric"
            value={minBudget}
            disabled={isRunning}
            onChange={(event) =>
              setMinBudget(
                displayPrice(
                  event.target.value,
                ),
              )
            }
            placeholder="500,000"
          />
        </div>

        <div className="field">
          <label htmlFor="automationMaxBudget">
            최대 예산
          </label>

          <input
            id="automationMaxBudget"
            className="textInput"
            inputMode="numeric"
            value={maxBudget}
            disabled={isRunning}
            onChange={(event) =>
              setMaxBudget(
                displayPrice(
                  event.target.value,
                ),
              )
            }
            placeholder="1,500,000"
          />
        </div>
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
          : "후보 수집부터 추천 준비까지 자동 실행"}
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
