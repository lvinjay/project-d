"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../components/Header";

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
        <div className="sectionHeadingRow">
          <div>
            <span className="eyebrow">WHY PROJECT D</span>
            <h2 className="sectionTitle">검색 결과가 아니라, 구매 결론을 제공합니다.</h2>
          </div>
          <p className="sectionLead compactLead">
            더 많은 제품을 보여주는 것이 아니라 후보를 좁히고, 선택 근거를 이해하기 쉽게 설명합니다.
          </p>
        </div>

        <div className="featureGrid">
          {features.map((feature) => (
            <article className="card featureCard" key={feature.title}>
              <div className="iconBox">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="processSection" id="how">
        <div className="container processContainer">
          <span className="eyebrow">HOW IT WORKS</span>
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
            </button>
          ))}
        </div>
      </section>

      <section className="ctaSection">
        <div>
          <span className="eyebrow lightEyebrow">DECISION AI</span>
          <h2>후회 없는 구매를 위한 첫 비교를 시작하세요.</h2>
          <p>현재 고민 중인 제품 2개만 있어도 바로 비교할 수 있습니다.</p>
        </div>
        <button type="button" onClick={() => router.push("/search?q=캠핑용%20에어컨")}>무료로 체험하기</button>
      </section>

      <footer className="siteFooter">
        <strong>Project D</strong>
        <span>AI Product Decision Platform · MVP v3.1</span>
      </footer>
    </main>
  );
}
