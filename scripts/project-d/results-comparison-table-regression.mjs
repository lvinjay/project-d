import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs
  .readFileSync(
    "app/advisor/results/ResultsClient.tsx",
    "utf8",
  )
  .replace(/\r\n/g, "\n");

const checks = [
  [
    source.includes(
      'data-marker="PICKVIZE_RESULTS_COMPARISON_TABLE"',
    ),
    "comparison table marker",
  ],
  [
    source.includes(
      "{comparisonProducts.length}개 제품 한눈에 비교",
    ),
    "comparison heading",
  ],
  [
    source.includes(
      "리뷰 기반 실사용 비교",
    ),
    "review-based comparison disclosure",
  ],
  [
    source.includes(
      "직접 실험한 측정값이 아니라",
    ),
    "no fabricated test measurement disclosure",
  ],
  [
    source.includes(
      "recommendations.slice(\n          0,\n          5,",
    ),
    "top five products only",
  ],
  [
    source.includes(
      "comparisonCriteria",
    ),
    "dynamic category criteria",
  ],
  [
    source.includes(
      "comparisonSpecs",
    ),
    "shared key specs",
  ],
  [
    source.includes(
      'overflowX:\n                      "auto"',
    ),
    "mobile horizontal scroll",
  ],
  [
    source.includes(
      '"min(1380px, calc(100vw - 32px))"',
    ),
    "wide desktop comparison breakout",
  ],
  [
    source.includes(
      "isCordlessVacuum",
    ),
    "wireless vacuum preferred specs",
  ],
  [
    source.includes(
      "summary.length > 72",
    ),
    "compact comparison evidence",
  ],
  [
    source.includes(
      'index ===\n                                  0\n                                    ? "#eff6ff"',
    ),
    "winner column highlight",
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
  `Results comparison table regression PASS: ${checks.length} assertions; external/paid calls 0; DB writes 0.`,
);
