"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../../components/Header";
import AutoReviewReceiver, {
  type ReviewCollectionStats,
} from "../../../components/AutoReviewReceiver";
import ClipboardReviewLoader from "../../../components/ClipboardReviewLoader";
import { supabase } from "../../../lib/supabase";

type ReviewPoint = {
  topic: string;
  summary: string;
  evidenceCount: number;
};

type CriterionScoreMap = Record<string, number | null>;
type CriterionReasonMap = Record<string, string>;

type ReviewAnalysis = {
  productName: string;
  reviewCount: number;
  summary: string;
  positivePoints: ReviewPoint[];
  negativePoints: ReviewPoint[];
  cautions: string[];
  bestFor: string[];
  notFor: string[];
  confidenceScore: number;
  criterionScores: CriterionScoreMap;
  criterionReasons: CriterionReasonMap;
  collectionStats?: ReviewCollectionStats;
};

type RegisteredProduct = {
  id: string;
  category: string;
  product_name: string;
  source_url: string;
  review_analysis: ReviewAnalysis | null;
  criterion_scores: CriterionScoreMap;
  review_raw_data?: {
    reviews?: string[];
    collectionStats?: ReviewCollectionStats | null;
    savedAt?: string;
  } | null;
  created_at: string;
  updated_at: string;
};

type AnalyzeResponse = {
  success: boolean;
  analysis?: ReviewAnalysis;
  message?: string;
};

function AdminReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const productId = searchParams.get("id") ?? "";

  const [product, setProduct] =
    useState<RegisteredProduct | null>(null);

  const [productName, setProductName] =
    useState("");

  const [reviewText, setReviewText] =
    useState("");

  const [collectionStats, setCollectionStats] =
    useState<ReviewCollectionStats | null>(null);

  const [analysis, setAnalysis] =
    useState<ReviewAnalysis | null>(null);

  const [isLoadingProduct, setIsLoadingProduct] =
    useState(true);

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [saveMessage, setSaveMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const loadProduct = useCallback(async () => {
    if (!productId) {
      setErrorMessage(
        "분석할 제품 정보가 없습니다. 관리자 제품 목록에서 리뷰 분석 버튼을 눌러 주세요.",
      );
      setIsLoadingProduct(false);
      return;
    }

    setIsLoadingProduct(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, category, product_name, source_url, review_analysis, criterion_scores, review_raw_data, created_at, updated_at",
        )
        .eq("id", productId)
        .single();

      if (error) {
        throw error;
      }

      const loadedProduct =
        data as RegisteredProduct;

      setProduct(loadedProduct);
      setProductName(loadedProduct.product_name);

      if (loadedProduct.review_analysis) {
        setAnalysis(
          loadedProduct.review_analysis,
        );

        if (loadedProduct.review_analysis.collectionStats) {
          setCollectionStats(
            loadedProduct.review_analysis.collectionStats,
          );
        }
      }

      if (
        loadedProduct.review_raw_data &&
        Array.isArray(loadedProduct.review_raw_data.reviews)
      ) {
        setReviewText(
          loadedProduct.review_raw_data.reviews.join("\n"),
        );

        if (loadedProduct.review_raw_data.collectionStats) {
          setCollectionStats(
            loadedProduct.review_raw_data.collectionStats,
          );
        }
      }
    } catch (error) {
      console.error(
        "제품 정보 불러오기 실패:",
        error,
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "제품 정보를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingProduct(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  function getReviews() {
    return reviewText
      .split(/\r?\n/)
      .map((review) => review.trim())
      .filter((review) => review.length > 0);
  }

  async function saveAnalysis(
    nextAnalysis: ReviewAnalysis,
  ) {
    if (!productId) {
      throw new Error(
        "저장할 제품 ID가 없습니다.",
      );
    }

    setIsSaving(true);
    setSaveMessage("");

    try {
      const reviews = getReviews();
      const savedAt = new Date().toISOString();

      const { error } = await supabase
        .from("products")
        .update({
          review_analysis: nextAnalysis,
          criterion_scores:
            nextAnalysis.criterionScores,
          review_raw_data: {
            reviews,
            collectionStats,
            savedAt,
          },
          updated_at: savedAt,
        })
        .eq("id", productId);

      if (error) {
        throw error;
      }

      setProduct((current) =>
        current
          ? {
              ...current,
              review_analysis: nextAnalysis,
              criterion_scores:
                nextAnalysis.criterionScores,
              review_raw_data: {
                reviews: getReviews(),
                collectionStats,
                savedAt:
                  new Date().toISOString(),
              },
              updated_at:
                new Date().toISOString(),
            }
          : current,
      );

      setSaveMessage(
        "AI 분석 결과와 리뷰 원문을 Supabase에 저장했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function analyzeReviews() {
    const normalizedProductName =
      productName.trim();

    const reviews = getReviews();

    if (!productId) {
      alert(
        "관리자 제품 목록에서 분석할 제품을 선택하세요.",
      );
      return;
    }

    if (!normalizedProductName) {
      alert("제품명을 입력하세요.");
      return;
    }

    if (reviews.length === 0) {
      alert(
        "리뷰를 한 줄에 하나씩 입력하세요.",
      );
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);
    setSaveMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/analyze-reviews",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            productName:
              normalizedProductName,
            category:
              product?.category ?? "",
            reviews,
            collectionStats,
          }),
        },
      );

      const result =
        (await response.json()) as AnalyzeResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ??
            "리뷰 분석에 실패했습니다.",
        );
      }

      if (!result.analysis) {
        throw new Error(
          "AI 분석 결과가 없습니다.",
        );
      }

      setAnalysis(result.analysis);

      await saveAnalysis(result.analysis);
    } catch (error) {
      console.error(
        "리뷰 분석 또는 저장 실패:",
        error,
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "리뷰 분석 중 오류가 발생했습니다.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function insertTestReviews() {
    setReviewText(
      [
        "냉방 성능이 좋아서 한낮에도 텐트 안이 시원했습니다.",
        "냉기는 강하지만 제품 무게가 생각보다 무겁습니다.",
        "취침 모드에서는 소음이 크지 않아 잘 수 있었습니다.",
        "강풍 모드에서는 소음이 꽤 크게 느껴졌습니다.",
        "설치 방법이 간단해서 처음 사용해도 어렵지 않았습니다.",
        "배수와 배기 덕트 설치 공간을 미리 확인해야 합니다.",
        "전력 소비가 있어서 캠핑장 전기 사용 가능 여부를 확인해야 합니다.",
        "가격은 저렴하지 않지만 냉방 성능은 만족스럽습니다.",
      ].join("\n"),
    );
  }

  function returnToProducts() {
    router.push("/admin");
  }

  if (isLoadingProduct) {
    return (
      <main>
        <Header />

        <section className="container emptyState">
          <h1>
            Supabase에서 제품 정보를
            불러오는 중입니다.
          </h1>

          <p className="sectionLead">
            잠시만 기다려 주세요.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <Header />

      <section className="container">
        <span className="heroBadge">
          Project D 관리자
        </span>

        <h1
          className="sectionTitle"
          style={{ marginTop: 18 }}
        >
          실제 리뷰 AI 분석
        </h1>

        <p className="sectionLead">
          리뷰 분석 결과는 제품별로
          Supabase에 저장됩니다.
        </p>

        <button
          type="button"
          className="secondaryButton"
          onClick={returnToProducts}
          style={{ marginTop: 18 }}
        >
          제품 목록으로 돌아가기
        </button>

        {product ? (
          <div
            className="card"
            style={{
              marginTop: 24,
              padding: 22,
              background: "#eef6ff",
              border:
                "1px solid #b9d8ff",
            }}
          >
            <strong>선택한 제품</strong>

            <h2
              style={{
                margin: "12px 0 8px",
              }}
            >
              {product.product_name}
            </h2>

            <p
              style={{
                margin: 0,
                color: "#315b88",
              }}
            >
              카테고리: {product.category}
            </p>

            <a
              href={product.source_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: 12,
                wordBreak: "break-all",
              }}
            >
              상품 페이지 열기
            </a>

            {product.review_analysis ? (
              <p
                style={{
                  margin: "14px 0 0",
                  fontWeight: 700,
                  color: "#067647",
                }}
              >
                저장된 리뷰 분석 결과가
                있습니다.
              </p>
            ) : (
              <p
                style={{
                  margin: "14px 0 0",
                  color: "#667085",
                }}
              >
                아직 저장된 리뷰 분석 결과가
                없습니다.
              </p>
            )}

            {Array.isArray(product.review_raw_data?.reviews) ? (
              <p
                style={{
                  margin: "10px 0 0",
                  fontWeight: 700,
                  color: "#155eef",
                }}
              >
                리뷰 원문{" "}
                {product.review_raw_data?.reviews?.length ?? 0}개가
                재분석용으로 저장되어 있습니다.
              </p>
            ) : null}
          </div>
        ) : null}

<div
  className="card"
  style={{
    marginTop: 24,
    padding: 28,
  }}
>
  <AutoReviewReceiver
    productId={productId}
    disabled={
      isLoadingProduct ||
      isAnalyzing ||
      isSaving
    }
onReviewsReceived={(nextReviewText, nextCollectionStats) => {
  setReviewText(nextReviewText);
  setCollectionStats(nextCollectionStats ?? null);
  setSaveMessage("");
  setErrorMessage("");

  setTimeout(() => {
    document
      .getElementById("analyze-button")
      ?.click();
  }, 500);
}}
  />

  <div className="field">
            <label htmlFor="productName">
              <span>제품명</span>
            </label>

            <input
              id="productName"
              className="textInput"
              value={productName}
              onChange={(event) =>
                setProductName(
                  event.target.value,
                )
              }
              placeholder="제품명을 입력하세요."
              disabled={
                isAnalyzing || isSaving
              }
            />
          </div>

          <div className="field">
            <label htmlFor="reviews">
              <span>리뷰 내용</span>

              <strong>
                {getReviews().length}개
              </strong>
            </label>

            <textarea
              id="reviews"
              className="textInput"
              value={reviewText}
              onChange={(event) =>
                setReviewText(
                  event.target.value,
                )
              }
              placeholder={
                "리뷰를 한 줄에 하나씩 붙여넣으세요.\n예: 냉방 성능은 좋지만 생각보다 무겁습니다."
              }
              rows={12}
              disabled={
                isAnalyzing || isSaving
              }
              style={{
                resize: "vertical",
                minHeight: 260,
                lineHeight: 1.7,
              }}
            />
          </div>

          {collectionStats ? (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#475569",
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: "#0f172a" }}>
                수집 리뷰 {collectionStats.total}개
              </strong>
              {" "}
              (
              추천순 {collectionStats.ranking}
              {" · "}
              최신순 {collectionStats.latest}
              {" · "}
              낮은평점순 {collectionStats.lowScore}
              )
            </div>
          ) : null}

          <div
  style={{
    display: "grid",
    gap: 12,
    marginTop: 14,
  }}
>
  <ClipboardReviewLoader
    disabled={isAnalyzing || isSaving}
    onReviewsLoaded={(nextReviewText) => {
      setReviewText(nextReviewText);
      setSaveMessage("");
      setErrorMessage("");
    }}
  />

  <div
    style={{
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
    }}
  >
    <button
      type="button"
      className="secondaryButton"
      onClick={insertTestReviews}
      disabled={
        isAnalyzing || isSaving
      }
    >
      테스트 리뷰 넣기
    </button>

<button
  id="analyze-button"
  type="button"
  className="primaryButton"
  onClick={analyzeReviews}
      disabled={
        isAnalyzing ||
        isSaving ||
        !product
      }
      style={{
        flex: 1,
        minWidth: 220,
      }}
    >
      {isAnalyzing
        ? "AI가 리뷰를 분석하는 중..."
        : isSaving
          ? "분석 결과 저장 중..."
          : analysis
            ? "리뷰 다시 분석하기"
            : "리뷰 AI 분석 시작"}
    </button>
  </div>
</div>
        </div>

        {saveMessage ? (
          <div
            className="card"
            style={{
              marginTop: 20,
              padding: 20,
              background: "#f6fef9",
              border:
                "1px solid #abefc6",
            }}
          >
            <strong
              style={{ color: "#067647" }}
            >
              저장 완료
            </strong>

            <p
              style={{
                margin: "8px 0 0",
                color: "#067647",
              }}
            >
              {saveMessage}
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="card"
            style={{
              marginTop: 20,
              padding: 20,
              background: "#fff4f4",
              border:
                "1px solid #f2b8b5",
            }}
          >
            <strong>
              오류가 발생했습니다.
            </strong>

            <p
              style={{
                margin: "8px 0 0",
                color: "#b42318",
                lineHeight: 1.7,
              }}
            >
              {errorMessage}
            </p>
          </div>
        ) : null}

        {analysis ? (
          <div
            style={{
              display: "grid",
              gap: 20,
              marginTop: 24,
            }}
          >
            <section
              className="card"
              style={{ padding: 28 }}
            >
              <span className="pill">
                리뷰{" "}
                {analysis.reviewCount}개 분석
              </span>

              <h2
                style={{
                  margin: "16px 0 10px",
                }}
              >
                {analysis.productName}
              </h2>

              <p
                style={{
                  margin: 0,
                  lineHeight: 1.8,
                }}
              >
                {analysis.summary}
              </p>

              <p
                style={{
                  margin: "16px 0 0",
                  color: "#667085",
                }}
              >
                분석 신뢰도:{" "}
                <strong>
                  {analysis.confidenceScore}
                  점
                </strong>
              </p>
            </section>

            <section
              className="card"
              style={{ padding: 28 }}
            >
              <h2>
                반복적으로 확인된 장점
              </h2>

              {analysis.positivePoints
                .length === 0 ? (
                <p className="sectionLead">
                  뚜렷하게 반복된 장점이
                  없습니다.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: 14,
                  }}
                >
                  {analysis.positivePoints.map(
                    (point, index) => (
                      <article
                        key={`${point.topic}-${index}`}
                        style={{
                          padding: 18,
                          border:
                            "1px solid #d1fadf",
                          background:
                            "#f6fef9",
                          borderRadius: 14,
                        }}
                      >
                        <strong>
                          {point.topic}
                        </strong>

                        <p
                          style={{
                            margin: "8px 0",
                            lineHeight: 1.7,
                          }}
                        >
                          {point.summary}
                        </p>

                        <small
                          style={{
                            color: "#667085",
                          }}
                        >
                          관련 근거 약{" "}
                          {
                            point.evidenceCount
                          }
                          건
                        </small>
                      </article>
                    ),
                  )}
                </div>
              )}
            </section>

            <section
              className="card"
              style={{ padding: 28 }}
            >
              <h2>
                반복적으로 확인된 단점
              </h2>

              {analysis.negativePoints
                .length === 0 ? (
                <p className="sectionLead">
                  뚜렷하게 반복된 단점이
                  없습니다.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: 14,
                  }}
                >
                  {analysis.negativePoints.map(
                    (point, index) => (
                      <article
                        key={`${point.topic}-${index}`}
                        style={{
                          padding: 18,
                          border:
                            "1px solid #fedf89",
                          background:
                            "#fffaeb",
                          borderRadius: 14,
                        }}
                      >
                        <strong>
                          {point.topic}
                        </strong>

                        <p
                          style={{
                            margin: "8px 0",
                            lineHeight: 1.7,
                          }}
                        >
                          {point.summary}
                        </p>

                        <small
                          style={{
                            color: "#667085",
                          }}
                        >
                          관련 근거 약{" "}
                          {
                            point.evidenceCount
                          }
                          건
                        </small>
                      </article>
                    ),
                  )}
                </div>
              )}
            </section>

            <section
              className="card"
              style={{ padding: 28 }}
            >
              <h2>구매 전 확인사항</h2>

              {analysis.cautions.length ===
              0 ? (
                <p className="sectionLead">
                  별도로 확인된 주의사항이
                  없습니다.
                </p>
              ) : (
                <ul
                  style={{
                    lineHeight: 1.9,
                    paddingLeft: 22,
                  }}
                >
                  {analysis.cautions.map(
                    (item, index) => (
                      <li key={index}>
                        {item}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>

            <section
              className="card"
              style={{ padding: 28 }}
            >
              <h2>추천 대상</h2>

              <ul
                style={{
                  lineHeight: 1.9,
                  paddingLeft: 22,
                }}
              >
                {analysis.bestFor.map(
                  (item, index) => (
                    <li key={index}>
                      {item}
                    </li>
                  ),
                )}
              </ul>

              <h2 style={{ marginTop: 28 }}>
                추천하지 않는 대상
              </h2>

              <ul
                style={{
                  lineHeight: 1.9,
                  paddingLeft: 22,
                }}
              >
                {analysis.notFor.map(
                  (item, index) => (
                    <li key={index}>
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function AdminReviewLoading() {
  return (
    <main>
      <Header />

      <section className="container emptyState">
        <h1>
          제품 분석 화면을 준비하고 있습니다.
        </h1>

        <p className="sectionLead">
          잠시만 기다려 주세요.
        </p>
      </section>
    </main>
  );
}

export default function AdminReviewPage() {
  return (
    <Suspense
      fallback={<AdminReviewLoading />}
    >
      <AdminReviewContent />
    </Suspense>
  );
}