"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../../components/Header";

type WeightMap = Record<string, number>;

type Choice = {
  value: string;
  label: string;
  description: string;
};

const PEOPLE_OPTIONS: Choice[] = [
  { value: "1", label: "1명", description: "차박이나 1인 캠핑 위주" },
  { value: "2", label: "2명", description: "커플·부부 캠핑" },
  { value: "3_4", label: "3~4명", description: "가족 캠핑" },
  { value: "5_plus", label: "5명 이상", description: "넓은 공간과 높은 냉방력이 필요" },
];

const SPACE_OPTIONS: Choice[] = [
  { value: "car", label: "차량 내부", description: "차박·SUV·승합차 내부" },
  { value: "small_tent", label: "소형 텐트", description: "1~2인 텐트 또는 작은 쉘터" },
  { value: "large_tent", label: "대형 텐트", description: "리빙쉘·거실형 텐트" },
  { value: "caravan", label: "카라반·캠핑카", description: "밀폐된 실내 공간에서 장시간 사용" },
];

const POWER_OPTIONS: Choice[] = [
  { value: "camp_site", label: "캠핑장 전기", description: "일반 220V 전원을 주로 사용" },
  { value: "power_station", label: "파워뱅크", description: "소비전력과 사용 시간을 중요하게 고려" },
  { value: "inverter", label: "차량 인버터", description: "순간 전력과 인버터 용량 확인 필요" },
  { value: "not_sure", label: "잘 모르겠어요", description: "안전한 기본 기준으로 추천" },
];

const BUDGET_OPTIONS: Choice[] = [
  { value: "under_300", label: "30만원 이하", description: "가격과 기본 성능의 균형" },
  { value: "under_500", label: "50만원 이하", description: "성능과 편의성까지 고려" },
  { value: "under_800", label: "80만원 이하", description: "냉방력과 내구성을 우선" },
  { value: "open", label: "예산 상관없음", description: "가격보다 적합성과 성능 우선" },
];

function safeParseWeights(raw: string | null): WeightMap {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value === "number")
        .map(([key, value]) => [key, Math.max(0, Math.min(10, Number(value)))])
    );
  } catch {
    return {};
  }
}

function addWeight(weights: WeightMap, key: string, amount: number) {
  const current = weights[key] ?? 0;
  weights[key] = Math.max(0, Math.min(10, current + amount));
}

function createAdjustedWeights(
  originalWeights: WeightMap,
  answers: {
    people: string;
    space: string;
    power: string;
    budget: string;
    sleepUse: boolean;
    frequentMove: boolean;
  },
) {
  const next = { ...originalWeights };

  if (answers.people === "3_4") {
    addWeight(next, "cooling_capacity", 1);
  }

  if (answers.people === "5_plus") {
    addWeight(next, "cooling_capacity", 2);
    addWeight(next, "power_consumption", 1);
  }

  if (answers.space === "car") {
    addWeight(next, "noise", 2);
    addWeight(next, "portability", 1);
    addWeight(next, "installation", 1);
  }

  if (answers.space === "large_tent") {
    addWeight(next, "cooling_capacity", 2);
    addWeight(next, "installation", 1);
  }

  if (answers.space === "caravan") {
    addWeight(next, "noise", 1);
    addWeight(next, "drainage", 1);
    addWeight(next, "durability_service", 1);
  }

  if (answers.power === "power_station") {
    addWeight(next, "power_consumption", 2);
    addWeight(next, "power_compatibility", 2);
  }

  if (answers.power === "inverter") {
    addWeight(next, "power_consumption", 1);
    addWeight(next, "power_compatibility", 2);
  }

  if (answers.power === "not_sure") {
    addWeight(next, "power_compatibility", 1);
  }

  if (answers.budget === "under_300") {
    addWeight(next, "value", 3);
  }

  if (answers.budget === "under_500") {
    addWeight(next, "value", 2);
  }

  if (answers.budget === "under_800") {
    addWeight(next, "value", 1);
  }

  if (answers.sleepUse) {
    addWeight(next, "noise", 2);
  }

  if (answers.frequentMove) {
    addWeight(next, "portability", 2);
    addWeight(next, "installation", 1);
  }

  return next;
}

function OptionGroup({
  title,
  description,
  options,
  value,
  onChange,
}: {
  title: string;
  description: string;
  options: Choice[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="questionBlock">
      <div className="questionHeading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      <div className="questionOptionGrid">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`questionOption ${value === option.value ? "selected" : ""}`}
            onClick={() => onChange(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function QuestionsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const category = searchParams.get("category") ?? "캠핑용 에어컨";
  const useCase = searchParams.get("useCase") ?? "not_sure";
  const initialWeights = useMemo(
    () => safeParseWeights(searchParams.get("weights")),
    [searchParams],
  );

  const [people, setPeople] = useState("2");
  const [space, setSpace] = useState(
    useCase === "car_camping"
      ? "car"
      : useCase === "tent_camping"
        ? "small_tent"
        : useCase === "caravan"
          ? "caravan"
          : "small_tent",
  );
  const [power, setPower] = useState("camp_site");
  const [budget, setBudget] = useState("under_500");
  const [sleepUse, setSleepUse] = useState(true);
  const [frequentMove, setFrequentMove] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const adjustedWeights = useMemo(
    () =>
      createAdjustedWeights(initialWeights, {
        people,
        space,
        power,
        budget,
        sleepUse,
        frequentMove,
      }),
    [initialWeights, people, space, power, budget, sleepUse, frequentMove],
  );

  const topWeights = useMemo(
    () =>
      Object.entries(adjustedWeights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
    [adjustedWeights],
  );

  function finishQuestions() {
    const payload = {
      category,
      useCase,
      answers: {
        people,
        space,
        power,
        budget,
        sleepUse,
        frequentMove,
      },
      weights: adjustedWeights,
    };

    window.sessionStorage.setItem(
      "projectDAdvisorAnswers",
      JSON.stringify(payload),
    );

    setShowSummary(true);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  return (
    <main>
      <Header />

      <section className="questionHero">
        <div className="questionHeroInner">
          <span className="heroBadge">맞춤 질문</span>
          <h1>사용 환경을 알면 추천이 훨씬 정확해집니다.</h1>
          <p>
            몇 가지 질문에 답하면 {category}를 고를 때 중요한 기준의 비중을
            자동으로 조정합니다.
          </p>
        </div>
      </section>

      <section className="container questionContainer">
        <button
          type="button"
          className="questionBackButton"
          onClick={() => router.back()}
        >
          ← 이전 단계로
        </button>

        <OptionGroup
          title="몇 명이 함께 사용하나요?"
          description="사용 인원과 공간이 커질수록 필요한 냉방 능력도 달라집니다."
          options={PEOPLE_OPTIONS}
          value={people}
          onChange={setPeople}
        />

        <OptionGroup
          title="주로 어떤 공간에서 사용하나요?"
          description="차량, 텐트, 카라반은 각각 중요하게 볼 기준이 다릅니다."
          options={SPACE_OPTIONS}
          value={space}
          onChange={setSpace}
        />

        <OptionGroup
          title="어떤 전원을 사용할 예정인가요?"
          description="전원 환경에 따라 사용할 수 있는 제품과 예상 사용 시간이 달라집니다."
          options={POWER_OPTIONS}
          value={power}
          onChange={setPower}
        />

        <OptionGroup
          title="생각하는 예산은 어느 정도인가요?"
          description="예산은 후보 제품을 고를 때 사용하고, 단순히 저렴한 제품만 추천하지는 않습니다."
          options={BUDGET_OPTIONS}
          value={budget}
          onChange={setBudget}
        />

        <section className="questionBlock">
          <div className="questionHeading">
            <h2>추가 사용 조건</h2>
            <p>해당되는 항목을 선택하면 추천 기준에 더 강하게 반영합니다.</p>
          </div>

          <div className="conditionList">
            <label className="conditionCard">
              <input
                type="checkbox"
                checked={sleepUse}
                onChange={(event) => setSleepUse(event.target.checked)}
              />
              <span>
                <strong>잠잘 때 사용할 예정이에요.</strong>
                <small>소음과 진동 관련 평가를 더 중요하게 반영합니다.</small>
              </span>
            </label>

            <label className="conditionCard">
              <input
                type="checkbox"
                checked={frequentMove}
                onChange={(event) => setFrequentMove(event.target.checked)}
              />
              <span>
                <strong>자주 옮기고 설치할 예정이에요.</strong>
                <small>무게, 이동 편의성과 설치 난이도를 더 중요하게 반영합니다.</small>
              </span>
            </label>
          </div>
        </section>

        <div className="questionActionBar">
          <div>
            <strong>답변을 추천 기준에 반영할까요?</strong>
            <span>선택한 조건으로 중요도를 자동 조정합니다.</span>
          </div>
          <button type="button" onClick={finishQuestions}>
            질문 반영하기 →
          </button>
        </div>

        {showSummary ? (
          <section className="questionSummary">
            <span className="eyebrow">PERSONALIZED PRIORITIES</span>
            <h2>당신에게 중요한 추천 기준이 정리됐습니다.</h2>
            <p>
              아래 기준을 중심으로 등록된 제품의 사양과 실제 리뷰를 비교하게 됩니다.
            </p>

            <div className="prioritySummaryGrid">
              {topWeights.map(([key, value], index) => (
                <article key={key}>
                  <small>{index + 1}순위</small>
                  <strong>{key}</strong>
                  <b>{value}/10</b>
                </article>
              ))}
            </div>

            <div className="nextStepNotice">
              <strong>맞춤 추천 준비 완료</strong>
              <p>
                저장된 제품별 리뷰 점수와 지금 정한 중요도를 결합해 실제 추천 순위를 계산합니다.
              </p>
              <button
                type="button"
                className="primaryButton"
                style={{ marginTop: 14 }}
                onClick={() => router.push("/advisor/results")}
              >
                나에게 맞는 제품 추천 보기 →
              </button>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
