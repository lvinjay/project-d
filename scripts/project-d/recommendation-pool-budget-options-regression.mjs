import assert from "node:assert/strict";
import fs from "node:fs";

const route =
  fs.readFileSync(
    "app/api/analyze-personal-preferences/route.ts",
    "utf8",
  ).replace(/\r\n/g, "\n");

const questions =
  fs.readFileSync(
    "app/advisor/questions/QuestionsClient.tsx",
    "utf8",
  ).replace(/\r\n/g, "\n");

let checks = 0;

function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}

check(
  route.includes('mode === "budget_options"'),
  true,
  "budget_options mode remains",
);

check(
  route.includes("rawBudgetProductIds.length < 5"),
  true,
  "budget options minimum is 5",
);

check(
  route.includes("rawBudgetProductIds.length > 15"),
  true,
  "budget options maximum is 15",
);

check(
  route.includes(
    "products.length !== budgetProductIds.length",
  ),
  true,
  "DB membership count follows actual Recommendation Pool size",
);

check(
  route.includes(
    "new Set(\n          products.map(",
  ),
  true,
  "DB membership uniqueness is checked dynamically",
);

check(
  route.includes(
    "선택한 5개 제품의 카테고리와 UUID가 모두 일치해야 합니다.",
  ),
  false,
  "legacy exact-five membership error removed",
);

check(
  route.includes(
    "선택한 추천 준비 풀 제품의 카테고리와 UUID가 모두 일치해야 합니다.",
  ),
  true,
  "generic pool membership error installed",
);

check(
  route.includes(
    "예산 선택지는 정확히 5개의 제품 UUID가 필요합니다.",
  ),
  false,
  "legacy exact-five input error removed",
);

check(
  route.includes(
    "예산 선택지는 5~15개의 제품 UUID가 필요합니다.",
  ),
  true,
  "5..15 input contract installed",
);

check(
  questions.includes("recommendationPoolIds"),
  true,
  "Questions requests budget options for Recommendation Pool",
);

check(
  /\bselectedFiveIds\s*\(/.test(questions),
  false,
  "Questions no longer sends legacy selected-five scope",
);

check(
  route.includes("무선청소기") ||
    route.includes("280000") ||
    questions.includes("무선청소기") ||
    questions.includes("280000"),
  false,
  "no category-specific one-off behavior",
);

console.log(
  `Recommendation Pool budget-options regression PASS: ${checks} assertions; paid calls 0; DB writes 0.`,
);
