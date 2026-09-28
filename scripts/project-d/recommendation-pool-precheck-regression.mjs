import assert from "node:assert/strict";
import fs from "node:fs";

const component = fs
  .readFileSync(
    "components/ProjectDAutomationPanel.tsx",
    "utf8",
  )
  .replace(/\r\n/g, "\n");

const helper = fs
  .readFileSync(
    "lib/project-d-recommendation-pool.ts",
    "utf8",
  )
  .replace(/\r\n/g, "\n");

let checks = 0;

function check(
  actual,
  expected,
  label,
) {
  assert.deepEqual(
    actual,
    expected,
    label,
  );
  checks++;
}

const precheckStart =
  component.indexOf(
    "  async function runRecommendationPoolPrecheck() {",
  );

const executionStart =
  component.indexOf(
    "  async function runRecommendationPoolReviewExecution() {",
    precheckStart,
  );

const runStart =
  component.indexOf(
    "  async function run() {",
    precheckStart,
  );

check(
  precheckStart >= 0,
  true,
  "free precheck function present",
);

const precheckEnd =
  executionStart >= 0
    ? executionStart
    : runStart;

check(
  precheckEnd > precheckStart,
  true,
  "free precheck boundary resolved",
);

const precheck =
  component.slice(
    precheckStart,
    precheckEnd,
  );

check(
  component.includes(
    "planRecommendationPool",
  ),
  true,
  "pool planner imported",
);

check(
  precheck.includes(
    '"/api/catalog-products?category="',
  ),
  true,
  "catalog read used",
);

check(
  precheck.includes(
    "collectDeepNaverReviews(",
  ),
  true,
  "native review collector used",
);

check(
  precheck.includes(
    "reviewSourceUrl,\n            100,",
  ),
  true,
  "precheck caps collection at 100 reviews",
);

check(
  precheck.includes(
    '"/api/analyze-reviews"',
  ),
  true,
  "review analysis preflight endpoint used",
);

check(
  precheck.includes(
    "dryRun: true",
  ),
  true,
  "review analysis remains dry-run in precheck",
);

check(
  precheck.includes(
    "inputFingerprint:\n            fingerprint",
  ),
  true,
  "precheck retains approved fingerprint for later execution",
);

check(
  precheck.includes(
    "/api/save-review-",
  ),
  false,
  "free precheck has no review DB save",
);

check(
  precheck.includes(
    "plan.inputFingerprint",
  ),
  false,
  "free precheck does not execute a paid fingerprint-bound request",
);

check(
  precheck.includes(
    "market-candidates",
  ) ||
    precheck.includes(
      "brightdata",
    ) ||
    precheck.includes(
      "serpapi",
    ),
  false,
  "free precheck has no paid data-provider path",
);

check(
  component.includes(
    'data-marker="PROJECT_D_RECOMMENDATION_POOL_PRECHECK"',
  ),
  true,
  "precheck result UI present",
);

check(
  helper.includes(
    "RECOMMENDATION_POOL_TARGET = 15",
  ),
  true,
  "pool target remains 15",
);

check(
  helper.includes("무선청소기") ||
    helper.includes("280000"),
  false,
  "shared pool helper has no one-off category/budget hardcode",
);

console.log(
  `Recommendation pool precheck regression V3 PASS: ${checks} assertions; free precheck paid calls 0; DB writes 0.`,
);
