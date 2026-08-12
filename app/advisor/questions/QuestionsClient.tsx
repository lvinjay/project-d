"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../../components/Header";

type WeightMap = Record<string, number>;

type PersonalizationOption = {
  label: string;
  value: string;
  weightAdjustments?: Record<string, number>;
};

type PersonalizationQuestion = {
  key: string;
  question: string;
  reason?: string;
  options: PersonalizationOption[];
};

type Criterion = {
  key: string;
  label: string;
  shortDescription?: string;
  defaultWeight?: number;
};

type CategoryProfileResponse = {
  success?: boolean;
  message?: string;
  profile?: {
    personalization_questions?: PersonalizationQuestion[] | null;
    criteria?: Criterion[] | null;
  };
  budgetOptions?: Array<{ label: string; value: string }>;
};

function safeParseWeights(value: string | null): WeightMap {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, rawValue]) => [key, Number(rawValue)])
        .filter(([, numberValue]) => Number.isFinite(numberValue)),
    );
  } catch {
    return {};
  }
}

function applyQuestionAdjustments(
  initialWeights: WeightMap,
  questions: PersonalizationQuestion[],
  answers: Record<string, string>,
): WeightMap {
  const next = { ...initialWeights };

  for (const question of questions) {
    const selectedValue = answers[question.key];
    if (!selectedValue) continue;

    const selectedOption = question.options.find(
      (option) => option.value === selectedValue,
    );
    if (!selectedOption?.weightAdjustments) continue;

    for (const [criterionKey, adjustment] of Object.entries(
      selectedOption.weightAdjustments,
    )) {
      const amount = Number(adjustment);
      if (!Number.isFinite(amount)) continue;

      const current = Number(next[criterionKey] ?? 0);
      next[criterionKey] = Math.max(0, Math.min(10, current + amount));
    }
  }

  return next;
}

function QuestionGroup({
  question,
  value,
  onChange,
}: {
  question: PersonalizationQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="questionBlock">
      <div className="questionHeading">
        <h2>{question.question}</h2>
        {question.reason ? <p>{question.reason}</p> : null}
      </div>

      <div className="questionOptionGrid">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`questionOption ${value === option.value ? "selected" : ""}`}
            onClick={() => onChange(option.value)}
          >
            <strong>{option.label}</strong>
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
  const initialWeights = useMemo(
    () => safeParseWeights(searchParams.get("weights")),
    [searchParams],
  );

  const [questions, setQuestions] = useState<PersonalizationQuestion[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [editableWeights, setEditableWeights] = useState<WeightMap>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [budgetOptions, setBudgetOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [budgetChoice, setBudgetChoice] = useState("");
  const [customPreference, setCustomPreference] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadQuestions() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/category-profile?category=${encodeURIComponent(category)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as CategoryProfileResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ?? "맞춤 질문을 불러오지 못했습니다.",
          );
        }

        const loaded = Array.isArray(data.profile?.personalization_questions)
          ? data.profile.personalization_questions.filter(
              (question) =>
                question &&
                typeof question.key === "string" &&
                typeof question.question === "string" &&
                Array.isArray(question.options) &&
                question.options.length >= 2,
            )
          : [];

        if (loaded.length === 0) {
          throw new Error(
            "이 카테고리의 AI 맞춤 질문이 아직 생성되지 않았습니다.",
          );
        }

        if (cancelled) return;

        const activeQuestions = loaded.slice(0, 3);
        setQuestions(activeQuestions);

        const loadedCriteria = Array.isArray(data.profile?.criteria)
          ? data.profile.criteria
              .filter(
                (criterion) =>
                  criterion &&
                  typeof criterion.key === "string" &&
                  typeof criterion.label === "string",
              )
              .slice(0, 5)
          : [];
        setCriteria(loadedCriteria);

        let storedAnswers: Record<string, string> = {};
        let storedBudgetChoice = "";
        let storedCustomPreference = "";
        let storedWeights: WeightMap = {};

        try {
          const savedRaw = window.sessionStorage.getItem(
            "projectDAdvisorAnswers",
          );

          if (savedRaw) {
            const saved = JSON.parse(savedRaw) as {
              category?: unknown;
              answers?: unknown;
              budgetChoice?: unknown;
              customPreference?: unknown;
              weights?: unknown;
            };

            if (saved.category === category) {
              if (
                saved.answers &&
                typeof saved.answers === "object" &&
                !Array.isArray(saved.answers)
              ) {
                storedAnswers = saved.answers as Record<string, string>;
              }

              if (typeof saved.budgetChoice === "string") {
                storedBudgetChoice = saved.budgetChoice;
              }

              if (typeof saved.customPreference === "string") {
                storedCustomPreference = saved.customPreference.slice(0, 500);
              }

              if (
                saved.weights &&
                typeof saved.weights === "object" &&
                !Array.isArray(saved.weights)
              ) {
                storedWeights = Object.fromEntries(
                  Object.entries(saved.weights as Record<string, unknown>)
                    .map(([key, value]) => [key, Number(value)])
                    .filter(([, value]) => Number.isFinite(value))
                    .map(([key, value]) => [
                      key,
                      Math.max(
                        1,
                        Math.min(10, Math.round(Number(value))),
                      ),
                    ]),
                );
              }
            }
          }
        } catch {
          // 저장값이 손상된 경우 기본값으로 진행합니다.
        }

        setAnswers(
          Object.fromEntries(
            activeQuestions.map((question) => {
              const savedValue = storedAnswers[question.key];
              const savedIsValid = question.options.some(
                (option) => option.value === savedValue,
              );

              return [
                question.key,
                savedIsValid
                  ? savedValue
                  : question.options[0]?.value ?? "",
              ];
            }),
          ),
        );

        setCustomPreference(storedCustomPreference);

        const initialEditableWeights = Object.fromEntries(
          loadedCriteria.map((criterion) => {
            const saved = storedWeights[criterion.key];
            const adjusted = applyQuestionAdjustments(
              initialWeights,
              activeQuestions,
              Object.fromEntries(
                activeQuestions.map((question) => {
                  const savedValue = storedAnswers[question.key];
                  const savedIsValid = question.options.some(
                    (option) => option.value === savedValue,
                  );

                  return [
                    question.key,
                    savedIsValid
                      ? savedValue
                      : question.options[0]?.value ?? "",
                  ];
                }),
              ),
            )[criterion.key];

            const fallback = Number(criterion.defaultWeight ?? 5);

            return [
              criterion.key,
              Math.max(
                1,
                Math.min(
                  10,
                  Math.round(
                    Number.isFinite(saved)
                      ? saved
                      : Number.isFinite(adjusted)
                        ? adjusted
                        : fallback,
                  ),
                ),
              ),
            ];
          }),
        );

        setEditableWeights(initialEditableWeights);

        const budgetResponse = await fetch("/api/analyze-personal-preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            mode: "budget_options",
          }),
        });

        const budgetData = (await budgetResponse.json()) as {
          success?: boolean;
          message?: string;
          budgetOptions?: Array<{ label: string; value: string }>;
        };

        if (!budgetResponse.ok || !budgetData.success) {
          throw new Error(
            budgetData.message ?? "예산 구간을 불러오지 못했습니다.",
          );
        }

        const nextBudgetOptions = Array.isArray(budgetData.budgetOptions)
          ? budgetData.budgetOptions
          : [];

        setBudgetOptions(nextBudgetOptions);

        const savedBudgetIsValid = nextBudgetOptions.some(
          (option) => option.value === storedBudgetChoice,
        );

        setBudgetChoice(
          savedBudgetIsValid
            ? storedBudgetChoice
            : nextBudgetOptions.find(
                  (option) => option.value === "no_limit",
                )?.value ??
                nextBudgetOptions[0]?.value ??
                "",
        );
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "맞춤 질문을 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadQuestions();

    return () => {
      cancelled = true;
    };
  }, [category]);

  const questionAdjustedWeights = useMemo(
    () => applyQuestionAdjustments(initialWeights, questions, answers),
    [initialWeights, questions, answers],
  );

  useEffect(() => {
    if (criteria.length === 0) return;

    setEditableWeights((current) => {
      const next: WeightMap = {};

      for (const criterion of criteria) {
        const fromCurrent = current[criterion.key];
        const fromQuestion = questionAdjustedWeights[criterion.key];
        const fallback = Number(criterion.defaultWeight ?? 5);

        next[criterion.key] = Math.max(
          1,
          Math.min(
            10,
            Math.round(
              Number.isFinite(fromCurrent)
                ? fromCurrent
                : Number.isFinite(fromQuestion)
                  ? fromQuestion
                  : fallback,
            ),
          ),
        );
      }

      return next;
    });
  }, [criteria, questionAdjustedWeights]);

  function selectAnswer(questionKey: string, value: string) {
    setAnswers((current) => ({
      ...current,
      [questionKey]: value,
    }));
  }

  function finishQuestions() {
    if (questions.length === 0) return;

    const payload = {
      category,
      answers,
      weights: editableWeights,
      personalizationQuestions: questions,
      budgetChoice,
      budgetOptions,
      customPreference: customPreference.trim(),
    };

    window.sessionStorage.setItem(
      "projectDAdvisorAnswers",
      JSON.stringify(payload),
    );

    router.push("/advisor/results");
  }

  return (
    <main>
      <Header />

      <section className="questionHero">
        <div className="questionHeroInner">
          <span className="heroBadge">맞춤 질문</span>
          <h1>사용 환경을 알면 추천이 훨씬 정확해집니다.</h1>
          <p>
            AI가 이 제품군에서 추천 결과를 실제로 바꾸는 핵심 질문만
            확인합니다.
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

        {loading ? (
          <section className="questionBlock">
            <div className="questionHeading">
              <h2>맞춤 질문을 불러오는 중입니다.</h2>
              <p>잠시만 기다려주세요.</p>
            </div>
          </section>
        ) : null}

        {!loading && errorMessage ? (
          <section className="questionBlock">
            <div className="questionHeading">
              <h2>맞춤 질문을 불러오지 못했습니다.</h2>
              <p>{errorMessage}</p>
            </div>
          </section>
        ) : null}

        {!loading && !errorMessage
          ? questions.map((question) => (
              <QuestionGroup
                key={question.key}
                question={question}
                value={answers[question.key] ?? ""}
                onChange={(value) => selectAnswer(question.key, value)}
              />
            ))
          : null}

        {!loading && !errorMessage && questions.length > 0 ? (
          <>
            <section className="questionBlock">
              <div className="questionHeading">
                <h2>구매기준별 중요도를 정해주세요.</h2>
                <p>
                  앞에서 답한 맞춤 질문을 기준으로 기본값을 잡아두었습니다.
                  중요하지 않으면 낮추고, 꼭 중요하면 10에 가깝게 조정하세요.
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 14,
                }}
              >
                {criteria.map((criterion) => {
                  const value = editableWeights[criterion.key] ?? 5;

                  return (
                    <div
                      key={criterion.key}
                      style={{
                        padding: 18,
                        borderRadius: 16,
                        border: "1px solid #d8dfeb",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 16,
                        }}
                      >
                        <div>
                          <strong style={{ display: "block", marginBottom: 6 }}>
                            {criterion.label}
                          </strong>
                          {criterion.shortDescription ? (
                            <span style={{ color: "#667085", fontSize: 14 }}>
                              {criterion.shortDescription}
                            </span>
                          ) : null}
                        </div>

                        <strong
                          style={{
                            minWidth: 54,
                            textAlign: "right",
                            fontSize: 20,
                          }}
                        >
                          {value}/10
                        </strong>
                      </div>

                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={value}
                        onChange={(event) =>
                          setEditableWeights((current) => ({
                            ...current,
                            [criterion.key]: Number(event.target.value),
                          }))
                        }
                        style={{
                          width: "100%",
                          marginTop: 16,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="questionBlock">
              <div className="questionHeading">
                <h2>생각하는 예산은 어느 정도인가요?</h2>
                <p>
                  현재 비교 제품들의 실제 가격대를 바탕으로 선택지를 만들었습니다.
                  예산에 맞지 않는 제품은 추천에서 불리하게 반영됩니다.
                </p>
              </div>

              <div className="questionOptionGrid">
                {budgetOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`questionOption ${budgetChoice === option.value ? "selected" : ""}`}
                    onClick={() => setBudgetChoice(option.value)}
                  >
                    <strong>{option.label}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="questionBlock">
              <div className="questionHeading">
                <h2>추가로 원하는 조건이 있나요?</h2>
                <p>
                  선택사항입니다. 중요도와 예산으로 표현하기 어려운 조건이 있다면
                  자유롭게 적어주세요.
                </p>
              </div>

              <textarea
                value={customPreference}
                onChange={(event) => setCustomPreference(event.target.value)}
                maxLength={500}
                rows={5}
                placeholder="예: 조금 가벼웠으면 좋겠어요. 고장이 적고 A/S가 잘됐으면 좋겠어요. 가격이 조금 비싸도 괜찮아요."
                style={{
                  width: "100%",
                  resize: "vertical",
                  minHeight: 130,
                  padding: 18,
                  borderRadius: 16,
                  border: "1px solid #d8dfeb",
                  font: "inherit",
                  lineHeight: 1.6,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ marginTop: 8, textAlign: "right", color: "#6b7280", fontSize: 13 }}>
                {customPreference.length}/500
              </div>
            </section>
          </>
        ) : null}

        {!loading && !errorMessage && questions.length > 0 ? (
          <div className="questionActionBar">
            <div>
              <strong>추천 조건 확인 완료</strong>
              <span>
                맞춤 질문·중요도·예산·추가 조건을 모두 반영해 제품 순위를 계산합니다.
              </span>
            </div>
            <button type="button" onClick={finishQuestions}>
              내게 맞는 제품 추천받기 →
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
