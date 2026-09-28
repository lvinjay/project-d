import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

let checks = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

const manifest = read("lib/project-d-selected-five-manifest.ts");
const panel = read("components/ProjectDAutomationPanel.tsx");
const readiness = read("lib/project-d-public-readiness.ts");
const questions = read("app/advisor/questions/QuestionsClient.tsx");
const results = read("app/advisor/results/ResultsClient.tsx");
const catalog = read("app/api/catalog-products/route.ts");
const scores = read("app/api/generate-product-scores/route.ts");
const planner = read("lib/project-d-recommendation-pool.ts");

check(
  manifest.includes("products: SelectedProduct[];"),
  true,
  "selected-five exact anchor remains",
);
check(
  manifest.includes("recommendationPool?: RecommendationPoolProduct[];"),
  true,
  "optional recommendation pool manifest exists",
);
check(
  manifest.includes("row.recommendationPool.length < 5") &&
    manifest.includes("row.recommendationPool.length > 15"),
  true,
  "manifest pool validates 5..15",
);
check(
  manifest.includes("최종 5개는 추천 준비 풀 안에 모두 포함되어야 합니다."),
  true,
  "selected five must be subset of pool",
);
check(
  manifest.includes("export function recommendationPoolIds("),
  true,
  "pool id helper exists",
);
check(
  manifest.includes("return pool.length >= 5 && pool.length <= 15") &&
    manifest.includes(": selectedFiveIds(manifest);"),
  true,
  "legacy manifest falls back to selected five",
);
check(
  panel.includes("recommendationPool: analysisTargets.map("),
  true,
  "future automation publishes generic pool",
);
check(
  readiness.includes("recommendationPoolIds") &&
    !readiness.includes("uniqueFive("),
  true,
  "public readiness uses pool IDs",
);
check(
  questions.includes("recommendationPoolIds") &&
    questions.includes("productIds.length > 15"),
  true,
  "questions and budget options use pool",
);
check(
  results.includes("recommendationPoolIds") &&
    results.includes("assertSameRecommendationPoolIds"),
  true,
  "results use pool identity throughout",
);
check(
  catalog.includes("productIds.length > 15"),
  true,
  "catalog scoped reads support 15",
);
check(
  scores.includes("현재 5개 제품 사이에서"),
  false,
  "score prompt has no fixed-five comparison wording",
);
check(
  planner.includes("RECOMMENDATION_POOL_TARGET = 15"),
  true,
  "shared planner target remains 15",
);
check(
  planner.includes("무선청소기") || planner.includes("280000"),
  false,
  "shared planner has no one-off category or budget hardcode",
);

console.log(
  `Recommendation pool public bridge PASS: ${checks} assertions; paid calls 0; DB writes 0.`,
);
