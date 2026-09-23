import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
let count = 0;
const check = (value, message) => {
  assert.ok(value, message);
  count += 1;
};

const questions = read("app/advisor/questions/QuestionsClient.tsx");
const results = read("app/advisor/results/ResultsClient.tsx");
const personal = read("app/api/analyze-personal-preferences/route.ts");

check(questions.includes("<h2>추가로 원하는 조건이 있나요?</h2>"), "custom condition UI missing");
check(questions.includes("customPreference: normalizedCustomPreference,"), "custom condition not persisted");
check(!questions.includes('process.env.NODE_ENV !== "production" && <section'), "custom condition still hidden in production");

check(results.includes('if (cachedRaw) {'), "production cache reuse missing");
check(results.includes('mode: "custom_preference_execute"'), "explicit execute mode missing");
check(results.includes("confirmCustomPreferenceAnalysis: true"), "explicit customer confirmation missing");
check(results.includes("추가 조건 반영하고 추천 보기"), "customer execution button missing");
check(!results.includes("예상 OpenAI 호출 최대"), "internal provider call count exposed");
check(!results.includes("1회의 유료 AI 분석"), "internal paid-call copy exposed");

check(personal.includes('mode !== "custom_preference_execute"'), "server execute-mode guard missing");
check(personal.includes("body.confirmCustomPreferenceAnalysis !== true"), "server explicit-confirmation guard missing");
check(personal.includes("maxRetries: 0"), "provider retry guard missing");
check(personal.includes("paidApiCalls += 1"), "single-call audit counter missing");
check(!personal.includes("public production never generates AI output"), "old production blanket block remains");


const advisor = read("app/advisor/AdvisorClient.tsx");
check(questions.includes("confirmCustomPreferenceAnalysis: true"), "questions does not explicitly confirm custom analysis");
check(questions.includes('"projectDPersonalPreferenceCache"'), "questions does not persist completed custom analysis");
check(questions.includes("submittingRef.current"), "questions double-submit guard missing");
check(results.includes("추가 조건 분석 결과가 없습니다. 맞춤 질문부터 다시 진행해 주세요."), "results still pauses for second confirmation");
check(advisor.includes("PICKVIZE_CATEGORY_AUTOSTART"), "preselected category autostart missing");
check(advisor.includes("advisorSearchFormRef.current?.requestSubmit()"), "advisor autostart does not submit guide form");

console.log(`Public customer features regression PASS: ${count} assertions; no external calls executed.`);
