"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import ScoreBar from "../../components/ScoreBar";
import { getProductsByIds } from "../../lib/products";
import { getRecommendation } from "../../lib/recommendation";

export default function ResultPage() {
  const params = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").map(Number).filter(Boolean);
  const budget = Number(params.get("budget")) || 0;
  const options = {
    budget,
    cooling: Number(params.get("cooling")) || 3,
    quietness: Number(params.get("quietness")) || 3,
    portability: Number(params.get("portability")) || 3,
    battery: Number(params.get("battery")) || 3,
    afterService: Number(params.get("afterService")) || 3,
  };

  const selectedProducts = getProductsByIds(ids);
  const result = getRecommendation(selectedProducts, options);

  if (ids.length < 2) {
    return (
      <main>
        <Header />
        <section className="container emptyState">
          <h1>비교할 제품 정보가 없습니다.</h1>
          <p className="sectionLead">제품을 2개 이상 선택한 뒤 다시 진행해 주세요.</p>
          <Link href="/search" className="primaryButton">제품 선택으로 이동</Link>
        </section>
      </main>
    );
  }

  return (
    <main>
      <Header />
      <section className="container">
        <div className="resultHero">
          <span className="heroBadge" style={{ background: "rgba(255,255,255,.15)", color: "white" }}>AI 비교 완료</span>
          <h1 style={{ fontSize: 40, marginBottom: 8 }}>{result[0]?.name}이 가장 잘 맞습니다.</h1>
          <p>{result.length}개 제품의 스펙, 예산 적합도, 리뷰 만족도를 함께 반영한 결과입니다.</p>
        </div>

        {result.map((item, index) => (
          <article className="card" key={item.id} style={{ marginBottom: 22 }}>
            <div className="rankCard">
              <div className="rankBadge">{index + 1}위</div>
              <div>
                <span className="pill">{item.brand}</span>
                <h2 style={{ fontSize: 28, margin: "10px 0 6px" }}>{item.name}</h2>
                <p style={{ margin: 0 }}>{item.price.toLocaleString()}원 · {item.weightKg}kg · 리뷰 {item.reviewCount.toLocaleString()}건</p>
              </div>
              <div className="resultScore"><span>적합도</span><strong>{item.score}점</strong></div>
            </div>

            <div className="productGrid" style={{ marginTop: 24 }}>
              <div>
                <ScoreBar label="냉방 성능" value={item.cooling} />
                <ScoreBar label="저소음" value={item.quietness} />
                <ScoreBar label="휴대성" value={item.portability} />
                <ScoreBar label="배터리" value={item.battery} />
                <ScoreBar label="A/S" value={item.afterService} />
              </div>
              <div>
                <div className="reasonBox">
                  <h4>이 제품을 추천하는 이유</h4>
                  <ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </div>
                <div className="warningBox">
                  <strong>구매 전 확인</strong>
                  <ul>{item.cautions.map((caution) => <li key={caution}>{caution}</li>)}</ul>
                </div>
              </div>
            </div>

            <div className="evidence" id="reviews">
              <strong>리뷰 분석 근거</strong>
              <ul>{item.reviewEvidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
            </div>
          </article>
        ))}

        <div className="heroActions" style={{ marginTop: 30 }}>
          <Link href="/search" className="secondaryButton">다른 제품 비교</Link>
          <Link href={`/question?ids=${ids.join(",")}`} className="primaryButton">조건 다시 설정</Link>
        </div>
      </section>
    </main>
  );
}
