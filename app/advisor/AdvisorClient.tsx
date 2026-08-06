"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../components/Header";

type Criterion = {
  key: string;
  label: string;
  shortDescription: string;
  helpTitle: string;
  helpText: string;
  sourceType: string;
  defaultWeight: number;
};

type UseCase = {
  key: string;
  label: string;
  description: string;
};

type CategoryProfile = {
  id: string;
  category: string;
  title: string;
  introduction: string;
  criteria: Criterion[];
  use_cases: UseCase[];
  candidate_limit: number;
};

type ProfileResponse = {
  success: boolean;
  profile?: CategoryProfile;
  message?: string;
};

const DEFAULT_CATEGORY = "캠핑용 에어컨";

function clampWeight(value: number) {
  return Math.max(0, Math.min(10, Math.round(value)));
}

export default function AdvisorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") ?? DEFAULT_CATEGORY;

  const [categoryInput, setCategoryInput] = useState(initialCategory);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [profile, setProfile] = useState<CategoryProfile | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [selectedUseCase, setSelectedUseCase] = useState("");
  const [openHelpKey, setOpenHelpKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      setIsLoading(true);
      setErrorMessage("");
      setProfile(null);
      setOpenHelpKey("");

      try {
        const response = await fetch(
          `/api/category-profile?category=${encodeURIComponent(activeCategory)}`,
          { cache: "no-store", signal: controller.signal },
        );

        const result = (await response.json()) as ProfileResponse;

        if (!response.ok || !result.success || !result.profile) {
          throw new Error(
            result.message ?? "카테고리 구매 가이드를 불러오지 못했습니다.",
          );
        }

        const nextProfile = result.profile;
        const nextWeights = Object.fromEntries(
          nextProfile.criteria.map((criterion) => [
            criterion.key,
            clampWeight(criterion.defaultWeight),
          ]),
        );

        setProfile(nextProfile);
        setWeights(nextWeights);
        setSelectedUseCase(nextProfile.use_cases[0]?.key ?? "");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "카테고리 구매 가이드를 불러오지 못했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();
    return () => controller.abort();
  }, [activeCategory]);

  const topPriorities = useMemo(() => {
    if (!profile) return [];

    return [...profile.criteria]
      .sort(
        (a, b) =>
          (weights[b.key] ?? b.defaultWeight) -
          (weights[a.key] ?? a.defaultWeight),
      )
      .slice(0, 3);
  }, [profile, weights]);

  function searchCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = categoryInput.trim();
    if (!normalized) return;

    setActiveCategory(normalized);
    router.replace(`/advisor?category=${encodeURIComponent(normalized)}`);
  }

  function continueToQuestions() {
    if (!profile) return;

    const params = new URLSearchParams({
      category: profile.category,
      useCase: selectedUseCase,
      weights: JSON.stringify(weights),
    });

    router.push(`/advisor/questions?${params.toString()}`);
  }

  return (
    <main>
      <Header />

      <section className="advisorHero">
        <div className="advisorHeroInner">
          <span className="heroBadge">AI 구매 컨설턴트</span>
          <h1>무엇을 봐야 할지부터 알려드릴게요.</h1>
          <p>
            제품을 잘 몰라도 괜찮습니다. 구매할 때 중요한 기준을 먼저 이해하고,
            나에게 중요한 정도를 정하면 맞춤 추천을 준비합니다.
          </p>

          <form className="advisorSearch" onSubmit={searchCategory}>
            <input
              aria-label="구매 카테고리"
              value={categoryInput}
              onChange={(event) => setCategoryInput(event.target.value)}
              placeholder="예: 캠핑용 에어컨"
            />
            <button type="submit">구매 가이드 보기</button>
          </form>
        </div>
      </section>

      <section className="container advisorContainer">
        {isLoading ? (
          <div className="card emptyState">구매 가이드를 준비하고 있습니다.</div>
        ) : errorMessage ? (
          <div className="advisorError">
            <strong>{errorMessage}</strong>
            <p>현재 체험 가능한 카테고리는 ‘캠핑용 에어컨’입니다.</p>
          </div>
        ) : profile ? (
          <>
            <section className="advisorIntroCard">
              <div>
                <span className="eyebrow">BUYING GUIDE</span>
                <h2>{profile.title}</h2>
                <p>{profile.introduction}</p>
              </div>
              <div className="advisorSummaryBox">
                <small>현재 가장 중요한 기준</small>
                {topPriorities.map((criterion, index) => (
                  <strong key={criterion.key}>
                    {index + 1}. {criterion.label}
                  </strong>
                ))}
              </div>
            </section>

            <section className="advisorSection">
              <div className="advisorSectionHeading">
                <div>
                  <span className="eyebrow">STEP 1</span>
                  <h2>이 제품군에서는 이런 점을 비교해야 합니다.</h2>
                </div>
                <p>모르는 용어는 ‘쉽게 설명’ 버튼으로 바로 확인할 수 있습니다.</p>
              </div>

              <div className="criteriaGrid">
                {profile.criteria.map((criterion) => {
                  const isOpen = openHelpKey === criterion.key;
                  const weight = weights[criterion.key] ?? criterion.defaultWeight;

                  return (
                    <article className="criterionCard" key={criterion.key}>
                      <div className="criterionHeader">
                        <div>
                          <h3>{criterion.label}</h3>
                          <p>{criterion.shortDescription}</p>
                        </div>
                        <span className="criterionWeight">중요도 {weight}</span>
                      </div>

                      <button
                        type="button"
                        className="helpToggle"
                        onClick={() =>
                          setOpenHelpKey(isOpen ? "" : criterion.key)
                        }
                      >
                        {isOpen ? "설명 닫기" : "쉽게 설명"}
                      </button>

                      {isOpen ? (
                        <div className="criterionHelp">
                          <strong>{criterion.helpTitle}</strong>
                          <p>{criterion.helpText}</p>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="advisorSection">
              <div className="advisorSectionHeading">
                <div>
                  <span className="eyebrow">STEP 2</span>
                  <h2>주로 어디에서 사용할 예정인가요?</h2>
                </div>
                <p>사용 환경에 따라 추천 기준의 기본값이 달라집니다.</p>
              </div>

              <div className="useCaseGrid">
                {profile.use_cases.map((useCase) => (
                  <button
                    type="button"
                    key={useCase.key}
                    className={`useCaseCard ${
                      selectedUseCase === useCase.key ? "selected" : ""
                    }`}
                    onClick={() => setSelectedUseCase(useCase.key)}
                  >
                    <strong>{useCase.label}</strong>
                    <span>{useCase.description}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="advisorSection">
              <div className="advisorSectionHeading">
                <div>
                  <span className="eyebrow">STEP 3</span>
                  <h2>나에게 중요한 정도를 조절하세요.</h2>
                </div>
                <p>0은 신경 쓰지 않음, 10은 반드시 중요함을 뜻합니다.</p>
              </div>

              <div className="weightPanel">
                {profile.criteria.map((criterion) => {
                  const value = weights[criterion.key] ?? criterion.defaultWeight;

                  return (
                    <label className="weightRow" key={criterion.key}>
                      <span>
                        <strong>{criterion.label}</strong>
                        <small>{criterion.shortDescription}</small>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={value}
                        onChange={(event) =>
                          setWeights((current) => ({
                            ...current,
                            [criterion.key]: Number(event.target.value),
                          }))
                        }
                      />
                      <b>{value}</b>
                    </label>
                  );
                })}
              </div>
            </section>

            <div className="advisorStickyAction">
              <div>
                <strong>다음 단계: 사용 조건 질문</strong>
                <span>
                  사용 인원, 전원 환경과 예산을 확인해 추천 기준을 더 정확히
                  조정합니다.
                </span>
              </div>
              <button type="button" onClick={continueToQuestions}>
                맞춤 질문 시작 →
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
