"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../components/Header";

<<<<<<< HEAD
const proofPoints = [
  ["스펙", "제조사 수치와 핵심 성능을 같은 기준으로 정규화"],
  ["리뷰", "반복되는 만족·불만 요소를 항목별로 구조화"],
  ["조건", "예산과 사용 환경, 중요도를 개인별로 반영"],
];

const steps = [
  ["01", "무엇을 살지 입력", "제품군이나 고민 중인 모델을 입력합니다."],
  ["02", "후보를 선택", "비교할 제품 2~5개를 선택합니다."],
  ["03", "내 기준을 설정", "예산과 성능, 소음, 무게 등 우선순위를 정합니다."],
  ["04", "근거 있는 결론 확인", "순위, 추천 이유, 단점과 주의점을 확인합니다."],
];

const categories = [
  ["캠핑용 에어컨", "현재 체험 가능", true],
  ["노트북", "데이터 준비 중", false],
  ["로봇청소기", "데이터 준비 중", false],
  ["유모차", "데이터 준비 중", false],
  ["공기청정기", "데이터 준비 중", false],
  ["무선청소기", "데이터 준비 중", false],
=======
const features = [
  {
    icon: "🧭",
    title: "조건부터 이해하는 추천",
    body: "예산, 사용 환경, 중요 기준을 먼저 묻고 제품 순위를 계산합니다.",
  },
  {
    icon: "🧾",
    title: "리뷰까지 반영한 근거",
    body: "제품 스펙뿐 아니라 반복되는 장점·단점과 실사용 체감을 함께 보여줍니다.",
  },
  {
    icon: "⚖️",
    title: "후보 제품끼리만 비교",
    body: "이미 고민 중인 2~5개 제품을 골라 짧은 시간 안에 결론을 얻습니다.",
  },
];

const steps = [
  ["01", "제품군 입력", "구매하려는 제품군이나 고민 중인 제품을 입력합니다."],
  ["02", "후보 선택", "이미 알아본 제품 중 2~5개를 비교 대상으로 선택합니다."],
  ["03", "조건 설정", "예산과 성능, 소음, 휴대성 등 중요도를 설정합니다."],
  ["04", "결론 확인", "추천 순위와 이유, 구매 전 주의점을 확인합니다."],
];

const categories = [
  { name: "캠핑용 에어컨", description: "현재 체험 가능", active: true },
  { name: "노트북", description: "데이터 확장 예정", active: false },
  { name: "무선청소기", description: "데이터 확장 예정", active: false },
  { name: "로봇청소기", description: "데이터 확장 예정", active: false },
>>>>>>> 3d0f10f30713289874d1e336ffce3052af5bf29c
];

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("캠핑용 에어컨");

  function startRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    router.push(`/search${normalized ? `?q=${encodeURIComponent(normalized)}` : ""}`);
  }

  return (
    <main>
      <Header />

<<<<<<< HEAD
      <section className="hero heroV32">
        <div className="heroGlow heroGlowOne" />
        <div className="heroGlow heroGlowTwo" />
        <div className="heroContent">
          <span className="heroBadge">AI PURCHASE DECISION PLATFORM</span>
          <h1>
            더 많이 검색하지 말고,
            <br />
            <em>더 정확하게 결정하세요.</em>
          </h1>
          <p>
            제품 스펙과 실제 사용자 리뷰를 함께 분석해
            <br className="desktopBreak" />
            당신의 조건에 가장 맞는 제품과 선택 근거를 보여드립니다.
          </p>

          <form className="decisionSearch decisionSearchV32" onSubmit={startRecommendation}>
            <div className="searchPrompt">
              <span>무엇을 구매하려고 하시나요?</span>
              <input
                aria-label="구매하려는 제품 입력"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="예: 노트북, 로봇청소기, 유모차"
              />
            </div>
            <button type="submit">AI 추천 시작 →</button>
          </form>

          <div className="heroTrust">
            <span>✓ 무료 체험</span>
            <span>✓ 회원가입 없이 시작</span>
            <span>✓ 추천 근거 공개</span>
          </div>
        </div>

        <aside className="decisionPreview" aria-label="추천 결과 예시">
          <div className="previewHeader">
            <span>AI 분석 미리보기</span>
            <strong>92%</strong>
          </div>
          <div className="previewWinner">
            <small>현재 조건 기준 1위</small>
            <h3>브리즈 캠핑 에어컨</h3>
            <p>예산 적합 · 높은 냉방 성능 · 우수한 휴대성</p>
          </div>
          <div className="previewBars">
            <div><span>조건 적합도</span><i style={{ width: "92%" }} /></div>
            <div><span>리뷰 신뢰도</span><i style={{ width: "86%" }} /></div>
            <div><span>가격 경쟁력</span><i style={{ width: "78%" }} /></div>
          </div>
          <div className="previewNote">구매 전 확인: 배터리 지속시간은 사용 환경에 따라 달라질 수 있습니다.</div>
        </aside>
      </section>

      <section className="container proofSection" id="value">
=======
      <section className="hero heroV31">
        <span className="heroBadge">AI 구매 의사결정 플랫폼</span>
        <h1>
          구매하기 전에,
          <br />
          AI에게 먼저 물어보세요.
        </h1>
        <p>
          제품 스펙과 실사용 리뷰를 함께 분석해
          <br className="desktopBreak" />
          나에게 맞는 제품과 그 이유를 한 번에 알려드립니다.
        </p>

        <form className="decisionSearch" onSubmit={startRecommendation}>
          <input
            aria-label="구매하려는 제품 입력"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 캠핑용 에어컨, 노트북, 로봇청소기"
          />
          <button type="submit">AI 추천 시작</button>
        </form>

        <div className="heroTrust">
          <span>✓ 제품 스펙 비교</span>
          <span>✓ 실사용 리뷰 근거</span>
          <span>✓ 개인 조건 반영</span>
        </div>
      </section>

      <section className="container" id="value">
>>>>>>> 3d0f10f30713289874d1e336ffce3052af5bf29c
        <div className="sectionHeadingRow">
          <div>
            <span className="eyebrow">WHY PROJECT D</span>
            <h2 className="sectionTitle">검색 결과가 아니라, 구매 결론을 제공합니다.</h2>
          </div>
          <p className="sectionLead compactLead">
<<<<<<< HEAD
            광고 순위나 인기순이 아니라, 개인 조건과 실제 사용 경험을 함께 반영해 선택 이유까지 설명합니다.
          </p>
        </div>

        <div className="proofGrid">
          {proofPoints.map(([title, body], index) => (
            <article className="proofCard" key={title}>
              <span>0{index + 1}</span>
              <h3>{title} 분석</h3>
              <p>{body}</p>
=======
            더 많은 제품을 보여주는 것이 아니라 후보를 좁히고, 선택 근거를 이해하기 쉽게 설명합니다.
          </p>
        </div>

        <div className="featureGrid">
          {features.map((feature) => (
            <article className="card featureCard" key={feature.title}>
              <div className="iconBox">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
>>>>>>> 3d0f10f30713289874d1e336ffce3052af5bf29c
            </article>
          ))}
        </div>
      </section>

      <section className="processSection" id="how">
        <div className="container processContainer">
<<<<<<< HEAD
          <span className="eyebrow lightEyebrow">HOW IT WORKS</span>
=======
          <span className="eyebrow">HOW IT WORKS</span>
>>>>>>> 3d0f10f30713289874d1e336ffce3052af5bf29c
          <h2 className="sectionTitle">4단계면 구매 결정을 끝낼 수 있습니다.</h2>
          <div className="stepGrid">
            {steps.map(([number, title, body]) => (
              <article className="stepCard" key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container" id="categories">
<<<<<<< HEAD
        <span className="eyebrow">EXPANDING CATEGORIES</span>
        <h2 className="sectionTitle">하나의 추천 엔진으로 모든 제품군을 확장합니다.</h2>
        <p className="sectionLead">현재는 캠핑용 에어컨으로 전체 추천 흐름을 체험할 수 있습니다.</p>

        <div className="categoryGrid categoryGridV32">
          {categories.map(([name, description, active]) => (
            <button
              type="button"
              key={String(name)}
              className={`categoryCard ${active ? "activeCategory" : ""}`}
              onClick={() => active && router.push(`/search?q=${encodeURIComponent(String(name))}`)}
              disabled={!active}
            >
              <span className="categoryIcon">{active ? "↗" : "·"}</span>
              <strong>{name}</strong>
              <small>{description}</small>
=======
        <span className="eyebrow">CATEGORIES</span>
        <h2 className="sectionTitle">하나의 방식으로 모든 제품군까지 확장합니다.</h2>
        <p className="sectionLead">
          현재는 캠핑용 에어컨으로 추천 흐름을 체험할 수 있으며, 동일한 구조로 제품군을 순차 확장합니다.
        </p>

        <div className="categoryGrid">
          {categories.map((category) => (
            <button
              type="button"
              key={category.name}
              className={`categoryCard ${category.active ? "activeCategory" : ""}`}
              onClick={() => {
                if (category.active) router.push(`/search?q=${encodeURIComponent(category.name)}`);
              }}
              disabled={!category.active}
            >
              <span className="pill">{category.active ? "체험 가능" : "준비 중"}</span>
              <strong>{category.name}</strong>
              <small>{category.description}</small>
>>>>>>> 3d0f10f30713289874d1e336ffce3052af5bf29c
            </button>
          ))}
        </div>
      </section>

<<<<<<< HEAD
      <section className="ctaSection ctaV32">
        <div>
          <span className="eyebrow lightEyebrow">START YOUR DECISION</span>
          <h2>후회 없는 구매를 위한 첫 비교를 시작하세요.</h2>
          <p>고민 중인 제품 2개만 있어도 바로 비교할 수 있습니다.</p>
=======
      <section className="ctaSection">
        <div>
          <span className="eyebrow lightEyebrow">DECISION AI</span>
          <h2>후회 없는 구매를 위한 첫 비교를 시작하세요.</h2>
          <p>현재 고민 중인 제품 2개만 있어도 바로 비교할 수 있습니다.</p>
>>>>>>> 3d0f10f30713289874d1e336ffce3052af5bf29c
        </div>
        <button type="button" onClick={() => router.push("/search?q=캠핑용%20에어컨")}>무료로 체험하기</button>
      </section>

      <footer className="siteFooter">
<<<<<<< HEAD
        <strong>Project D <small>Decision AI</small></strong>
        <span>AI Product Decision Platform · MVP v3.2</span>
=======
        <strong>Project D</strong>
        <span>AI Product Decision Platform · MVP v3.1</span>
>>>>>>> 3d0f10f30713289874d1e336ffce3052af5bf29c
      </footer>
    </main>
  );
}
