"use client";

import { useState } from "react";
import Header from "../../../components/Header";

type ReviewPoint = {
  topic: string;
  summary: string;
  evidenceCount: number;
};

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
};

type AnalyzeResponse = {
  success: boolean;
  analysis?: ReviewAnalysis;
  message?: string;
};

export default function AdminReviewPage() {
  const [productName, setProductName] = useState(
    "브리즐 이동식 캠핑 에어컨",
  );

  const [reviewText, setReviewText] = useState("");

  const [analysis, setAnalysis] =
    useState<ReviewAnalysis | null>(null);

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  function getReviews() {
    return reviewText
      .split(/\r?\n/)
      .map((review) => review.trim())
      .filter((review) => review.length > 0);
  }

  async function analyzeReviews() {
    const normalizedProductName =
      productName.trim();

    const reviews = getReviews();

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
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/analyze-reviews",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productName: normalizedProductName,
            reviews,
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
          "분석 결과가 없습니다.",
        );
      }

      setAnalysis(result.analysis);
    } catch (error) {
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
          상품 리뷰를 한 줄에 하나씩
          붙여넣으면 반복되는 장점과 단점,
          구매 전 주의사항을 분석합니다.
        </p>

        <div
          className="card"
          style={{
            marginTop: 28,
            padding: 28,
          }}
        >
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
            />
          </div>

          <div className="field">
            <label htmlFor="reviews">
              <span>
                리뷰 내용
              </span>

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
              style={{
                resize: "vertical",
                minHeight: 260,
                lineHeight: 1.7,
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 14,
            }}
          >
            <button
              type="button"
              className="secondaryButton"
              onClick={insertTestReviews}
              disabled={isAnalyzing}
            >
              테스트 리뷰 넣기
            </button>

            <button
              type="button"
              className="primaryButton"
              onClick={analyzeReviews}
              disabled={isAnalyzing}
              style={{
                flex: 1,
                minWidth: 220,
              }}
            >
              {isAnalyzing
                ? "AI가 리뷰를 분석하는 중..."
                : "리뷰 AI 분석 시작"}
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div
            className="card"
            style={{
              marginTop: 24,
              padding: 22,
              border: "1px solid #f2b8b5",
              background: "#fff4f4",
            }}
          >
            <strong>
              분석에 실패했습니다.
            </strong>

            <p
              style={{
                margin: "8px 0 0",
                color: "#b42318",
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
                리뷰 {analysis.reviewCount}개 분석
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
              <h2>반복적으로 확인된 장점</h2>

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
                          background: "#f6fef9",
                          borderRadius: 14,
                        }}
                      >
                        <strong>
                          {point.topic}
                        </strong>

                        <p
                          style={{
                            margin:
                              "8px 0 0",
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
                          {point.evidenceCount}건
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
              <h2>반복적으로 확인된 단점</h2>

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
                          background: "#fffaeb",
                          borderRadius: 14,
                        }}
                      >
                        <strong>
                          {point.topic}
                        </strong>

                        <p
                          style={{
                            margin:
                              "8px 0 0",
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
                          {point.evidenceCount}건
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

              <ul
                style={{
                  lineHeight: 1.9,
                  paddingLeft: 22,
                }}
              >
                {analysis.cautions.map(
                  (caution, index) => (
                    <li key={index}>
                      {caution}
                    </li>
                  ),
                )}
              </ul>
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