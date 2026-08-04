"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import { getProductsByIds } from "../../lib/products";

const sliders = [
  ["cooling", "냉방 성능", "선풍기 수준보다 확실한 찬바람이 중요해요"],
  ["quietness", "저소음", "취침 중에도 사용할 수 있을 만큼 조용해야 해요"],
  ["portability", "휴대성", "무게와 이동 편의성이 중요해요"],
  ["battery", "배터리", "외부 전원 없이 오래 사용하고 싶어요"],
  ["afterService", "A/S", "수리와 고객지원 접근성이 중요해요"],
] as const;

function QuestionContent() {
  const router = useRouter();
  const params = useSearchParams();

  const idsText = params.get("ids") ?? "";

  const ids = idsText
    .split(",")
    .map(Number)
    .filter(Boolean);

  const selectedProducts = getProductsByIds(ids);

  const [budget, setBudget] = useState(500000);

  const [values, setValues] = useState({
    cooling: 5,
    quietness: 4,
    portability: 4,
    battery: 3,
    afterService: 3,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function submit() {
    if (selectedProducts.length < 2) {
      alert("먼저 비교할 제품을 2개 이상 선택하세요.");
      router.push("/search");
      return;
    }

    setIsLoading(true);
    setAiResult("");
    setErrorMessage("");

    const productInformation = selectedProducts
      .map(
        (product, index) => `
${index + 1}. ${product.name}
- 브랜드: ${product.brand}
- 가격: ${product.price.toLocaleString()}원
- 냉방 성능: ${product.cooling}/100
- 저소음: ${product.quietness}/100
- 휴대성: ${product.portability}/100
- 배터리: ${product.battery}/100
- A/S: ${product.afterService}/100
- 리뷰 점수: ${product.reviewScore}/5
- 리뷰 수: ${product.reviewCount.toLocaleString()}건
- 주요 장점: ${product.pros.join(", ")}
- 주요 단점: ${product.cons.join(", ")}
`,
      )
      .join("\n");

    const prompt = `
당신은 광고나 협찬에 영향을 받지 않는 한국어 AI 구매 의사결정 전문가입니다.

아래 제품들을 사용자의 조건에 따라 비교해 주세요.

[사용자 조건]
- 최대 예산: ${
      budget === 0 ? "제한 없음" : `${budget.toLocaleString()}원`
    }
- 냉방 성능 중요도: ${values.cooling}/5
- 저소음 중요도: ${values.quietness}/5
- 휴대성 중요도: ${values.portability}/5
- 배터리 중요도: ${values.battery}/5
- A/S 중요도: ${values.afterService}/5

[비교 제품]
${productInformation}

다음 형식으로 답변해 주세요.

1. 최종 추천 제품
2. 추천 적합도 점수(100점 만점)
3. 이 제품을 추천하는 핵심 이유 3가지
4. 다른 제품보다 유리한 점
5. 구매 전에 반드시 확인할 단점
6. 다른 제품이 더 적합할 수 있는 사용자
7. 최종 결론

확인할 수 없는 정보는 사실처럼 만들지 말고, 제공된 데이터만 근거로 판단하세요.
`;

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "AI 분석 요청에 실패했습니다.");
      }

      setAiResult(data.result);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "AI 분석 중 알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main>
      <Header />

      <section className="container">
        <div className="card formCard">
          <span className="heroBadge">2단계 · 구매 조건</span>

          <h1
            className="sectionTitle"
            style={{
              marginTop: 18,
            }}
          >
            무엇을 가장 중요하게 보시나요?
          </h1>

          <p className="sectionLead">
            중요도를 다르게 설정하면 AI의 추천 결과와 이유가 달라집니다.
          </p>

          <div
            style={{
              marginBottom: 28,
              padding: 20,
              borderRadius: 16,
              background: "#f5f7fb",
            }}
          >
            <strong>비교할 제품</strong>

            <ul
              style={{
                marginBottom: 0,
                paddingLeft: 22,
              }}
            >
              {selectedProducts.map((product) => (
                <li key={product.id}>
                  {product.name} · {product.price.toLocaleString()}원
                </li>
              ))}
            </ul>
          </div>

          <div className="field">
            <label>
              <span>최대 예산</span>

              <strong>
                {budget === 0
                  ? "제한 없음"
                  : `${budget.toLocaleString()}원`}
              </strong>
            </label>

            <select
              className="selectInput"
              value={budget}
              onChange={(event) =>
                setBudget(Number(event.target.value))
              }
            >
              <option value={300000}>30만원</option>
              <option value={500000}>50만원</option>
              <option value={700000}>70만원</option>
              <option value={1000000}>100만원</option>
              <option value={1500000}>150만원</option>
              <option value={0}>가격 제한 없음</option>
            </select>
          </div>

          {sliders.map(([key, label, help]) => (
            <div className="field" key={key}>
              <label>
                <span>{label}</span>
                <strong>{values[key]} / 5</strong>
              </label>

              <input
                className="range"
                type="range"
                min={1}
                max={5}
                value={values[key]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [key]: Number(event.target.value),
                  }))
                }
              />

              <div className="rangeHelp">
                <span>덜 중요</span>
                <span>{help}</span>
                <span>매우 중요</span>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="primaryButton"
            style={{
              width: "100%",
              opacity: isLoading ? 0.7 : 1,
            }}
            onClick={submit}
            disabled={isLoading}
          >
            {isLoading ? "AI가 제품을 분석하고 있습니다..." : "AI 추천 결과 보기"}
          </button>

          {errorMessage && (
            <div
              style={{
                marginTop: 24,
                padding: 20,
                borderRadius: 14,
                background: "#fff1f2",
                color: "#b42318",
                whiteSpace: "pre-wrap",
              }}
            >
              <strong>오류가 발생했습니다.</strong>
              <p style={{ marginBottom: 0 }}>{errorMessage}</p>
            </div>
          )}

          {aiResult && (
            <div
              style={{
                marginTop: 30,
                padding: 28,
                borderRadius: 18,
                background: "#eef4ff",
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
              }}
            >
              <span className="heroBadge">실시간 OpenAI 분석 결과</span>

              <h2
                style={{
                  marginTop: 18,
                  marginBottom: 18,
                }}
              >
                AI 구매 추천
              </h2>

              <div>{aiResult}</div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function QuestionLoading() {
  return (
    <main>
      <Header />

      <section className="container emptyState">
        <h1>구매 조건 화면을 불러오는 중입니다.</h1>
        <p className="sectionLead">잠시만 기다려 주세요.</p>
      </section>
    </main>
  );
}

export default function QuestionPage() {
  return (
    <Suspense fallback={<QuestionLoading />}>
      <QuestionContent />
    </Suspense>
  );
}