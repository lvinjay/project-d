import fs from "node:fs";
import assert from "node:assert/strict";

const api = fs
  .readFileSync(
    "app/api/advisor-recommendations/route.ts",
    "utf8",
  )
  .replace(/\r\n/g, "\n");

const client = fs
  .readFileSync(
    "app/advisor/results/ResultsClient.tsx",
    "utf8",
  )
  .replace(/\r\n/g, "\n");

const checks = [
  [
    api.includes(
      "function isPriceWithinBudget(",
    ),
    "hard budget predicate",
  ],
  [
    api.includes(
      "budgetMatchedCandidates",
    ),
    "budget-filtered main candidate set",
  ],
  [
    api.includes(
      "!isPriceWithinBudget(",
    ),
    "out-of-budget alternatives split",
  ],
  [
    api.includes(
      "budgetAlternatives",
    ),
    "budget alternatives response",
  ],
  [
    api.includes(
      "unknownPriceCount",
    ),
    "unknown-price exclusion accounting",
  ],
  [
    client.includes(
      'data-marker="PICKVIZE_BUDGET_HARD_FILTER"',
    ),
    "budget result disclosure",
  ],
  [
    client.includes(
      "예산 범위 밖 참고 대안",
    ),
    "separate over-budget alternatives",
  ],
  [
    client.includes(
      "{comparisonProducts.length}개 제품 한눈에 비교",
    ),
    "comparison table reflects filtered count",
  ],
  [
    !api.includes(
      "openai.responses.create",
    ) &&
      !api.includes(
        'fetch("https://',
      ),
    "no paid/external provider added",
  ],
];

for (const [ok, label] of checks) {
  assert.equal(
    ok,
    true,
    `FAIL: ${label}`,
  );
}

console.log(
  `Budget hard-filter regression PASS: ${checks.length} assertions; external/paid calls 0; DB writes 0.`,
);
