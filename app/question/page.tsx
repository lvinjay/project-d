"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Header from "../../components/Header";

const sliders = [
  ["cooling", "냉방 성능", "선풍기 수준보다 확실한 찬바람이 중요해요"],
  ["quietness", "저소음", "취침 중에도 사용할 수 있을 만큼 조용해야 해요"],
  ["portability", "휴대성", "무게와 이동 편의성이 중요해요"],
  ["battery", "배터리", "외부 전원 없이 오래 사용하고 싶어요"],
  ["afterService", "A/S", "수리와 고객지원 접근성이 중요해요"],
] as const;

export default function QuestionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const ids = params.get("ids") ?? "";
  const [budget, setBudget] = useState(500000);
  const [values, setValues] = useState({ cooling: 5, quietness: 4, portability: 4, battery: 3, afterService: 3 });

  function submit() {
    if (!ids) {
      alert("먼저 비교할 제품을 선택하세요.");
      router.push("/search");
      return;
    }
    const nextParams = new URLSearchParams({ ids, budget: String(budget), ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])) });
    router.push(`/result?${nextParams.toString()}`);
  }

  return (
    <main>
      <Header />
      <section className="container">
        <div className="card formCard">
          <span className="heroBadge">2단계 · 구매 조건</span>
          <h1 className="sectionTitle" style={{ marginTop: 18 }}>무엇을 가장 중요하게 보시나요?</h1>
          <p className="sectionLead">중요도를 다르게 설정하면 제품 순위와 추천 이유가 달라집니다.</p>

          <div className="field">
            <label><span>최대 예산</span><strong>{budget === 0 ? "제한 없음" : `${budget.toLocaleString()}원`}</strong></label>
            <select className="selectInput" value={budget} onChange={(event) => setBudget(Number(event.target.value))}>
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
              <label><span>{label}</span><strong>{values[key]} / 5</strong></label>
              <input className="range" type="range" min={1} max={5} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: Number(event.target.value) }))} />
              <div className="rangeHelp"><span>덜 중요</span><span>{help}</span><span>매우 중요</span></div>
            </div>
          ))}

          <button type="button" className="primaryButton" style={{ width: "100%" }} onClick={submit}>AI 추천 결과 보기</button>
        </div>
      </section>
    </main>
  );
}
