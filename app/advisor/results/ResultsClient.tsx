"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "../../../components/Header";

type CriterionBreakdown = {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  contribution: number | null;
  reason: string;
};

type Recommendation = {
  id: string;
  rank: number;
  productName: string;
  sourceUrl: string;
  matchScore: number;
  confidence: number;
  dataCoverage: number;
  reviewCount: number;
  summary: string;
  recommendationReasons: string[];
  cautions: string[];
  bestFor: string[];
  criterionBreakdown: CriterionBreakdown[];
};

type RecommendationResponse = {
  success: boolean;
  category?: string;
  recommendations?: Recommendation[];
  note?: string;
  message?: string;
};

type StoredAnswers = {
  category?: string;
  weights?: Record<string, number>;
};

export default function ResultsClient() {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [category, setCategory] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [note, setNote] = useState("");
  const [expandedId, setExpandedId] = useState("");

  useEffect(() => {
    async function loadRecommendations() {
      try {
        const raw = window.sessionStorage.getItem("projectDAdvisorAnswers");

        if (!raw) {
          throw new Error("맞춤 질문 답변이 없습니다. 질문부터 다시 진행해 주세요.");
        }

        const stored = JSON.parse(raw) as StoredAnswers;
        const nextCategory = stored.category?.trim() ?? "";
        const weights = stored.weights ?? {};

        if (!nextCategory) {
          throw new Error("추천할 카테고리 정보가 없습니다.");
        }

        const response = await fetch("/api/advisor-recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: nextCategory, weights }),
        });

        const result = (await response.json()) as RecommendationResponse;

        if (!response.ok || !result.success) {
          throw new Error(result.message ?? "맞춤 추천을 불러오지 못했습니다.");
        }

        setCategory(result.category ?? nextCategory);
        setRecommendations(result.recommendations ?? []);
        setNote(result.note ?? "");
      } catch (error) {
        console.error("맞춤 추천 결과 불러오기 실패:", error);
        setErrorMessage(
          error instanceof Error ? error.message : "추천 결과를 불러오지 못했습니다.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadRecommendations();
  }, []);

  const winner = recommendations[0] ?? null;
  const topCriteria = useMemo(
    () =>
      winner?.criterionBreakdown
        .filter((item) => item.score !== null)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 4) ?? [],
    [winner],
  );

  return (
    <main>
      <Header />

      <section className="advisorResultHero">
        <div className="container">
          <span className="heroBadge">맞춤 추천 완료</span>
          <h1>{category || "제품"} 중 나에게 맞는 순위입니다.</h1>
          <p>
            직접 설정한 중요도와 실제 리뷰에서 산출한 제품별 기준 점수를 결합했습니다.
          </p>
        </div>
      </section>

      <section className="container advisorResultContainer">
        {isLoading ? (
          <div className="card advisorResultState">추천 순위를 계산하는 중입니다.</div>
        ) : errorMessage ? (
          <div className="card advisorResultState advisorResultError">
            <h2>추천 결과를 만들지 못했습니다.</h2>
            <p>{errorMessage}</p>
            <Link href="/advisor?category=캠핑용%20에어컨" className="primaryButton">
              구매 가이드로 돌아가기
            </Link>
          </div>
        ) : winner ? (
          <>
            <article className="advisorWinnerCard">
              <div>
                <span className="advisorWinnerBadge">1위 추천</span>
                <h2>{winner.productName}</h2>
                <p>{winner.summary}</p>
              </div>

              <div className="advisorWinnerScore">
                <span>나와의 적합도</span>
                <strong>{winner.matchScore}점</strong>
                <small>추천 신뢰도 {winner.confidence}%</small>
              </div>
            </article>

            <div className="advisorResultInfoGrid">
              <section className="card advisorResultPanel">
                <h2>왜 1위인가요?</h2>
                <ul>
                  {winner.recommendationReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </section>

              <section className="card advisorResultPanel">
                <h2>구매 전 확인하세요</h2>
                <ul>
                  {winner.cautions.length > 0 ? (
                    winner.cautions.map((caution) => <li key={caution}>{caution}</li>)
                  ) : (
                    <li>리뷰 분석에서 반복적으로 확인된 주의점이 없습니다.</li>
                  )}
                </ul>
              </section>
            </div>

            <section className="card advisorPriorityEvidence">
              <div>
                <span className="eyebrow">YOUR PRIORITIES</span>
                <h2>당신이 중요하게 본 기준과 제품 점수</h2>
              </div>

              <div className="advisorCriteriaGrid">
                {topCriteria.map((criterion) => (
                  <article key={criterion.key}>
                    <span>{criterion.label}</span>
                    <strong>{criterion.score}점</strong>
                    <small>중요도 {criterion.weight}/10</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="advisorRankingSection">
              <div className="advisorRankingHeading">
                <div>
                  <span className="eyebrow">RANKING</span>
                  <h2>전체 제품 추천 순위</h2>
                </div>
                <p>{note}</p>
              </div>

              <div className="advisorRankingList">
                {recommendations.map((item) => {
                  const expanded = expandedId === item.id;

                  return (
                    <article className="advisorRankCard" key={item.id}>
                      <div className="advisorRankMain">
                        <div className="advisorRankNumber">{item.rank}</div>
                        <div className="advisorRankContent">
                          <h3>{item.productName}</h3>
                          <p>{item.summary}</p>
                          <div className="advisorRankMeta">
                            <span>리뷰 {item.reviewCount}개 분석</span>
                            <span>데이터 반영률 {item.dataCoverage}%</span>
                          </div>
                        </div>
                        <div className="advisorRankScore">
                          <strong>{item.matchScore}</strong>
                          <span>점</span>
                        </div>
                      </div>

                      <div className="advisorRankActions">
                        <button
                          type="button"
                          className="secondaryButton"
                          onClick={() => setExpandedId(expanded ? "" : item.id)}
                        >
                          {expanded ? "세부 점수 닫기" : "세부 점수 보기"}
                        </button>
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="primaryButton"
                        >
                          상품 페이지 보기
                        </a>
                      </div>

                      {expanded ? (
                        <div className="advisorBreakdownTable">
                          {item.criterionBreakdown.map((criterion) => (
                            <div key={criterion.key}>
                              <span>{criterion.label}</span>
                              <b>{criterion.score === null ? "정보 없음" : `${criterion.score}점`}</b>
                              <small>중요도 {criterion.weight}/10</small>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>

            <div className="advisorResultActions">
              <Link href="/advisor?category=캠핑용%20에어컨" className="secondaryButton">
                중요도 다시 설정
              </Link>
              <Link href="/advisor/questions?category=캠핑용%20에어컨" className="primaryButton">
                질문 다시 답하기
              </Link>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
