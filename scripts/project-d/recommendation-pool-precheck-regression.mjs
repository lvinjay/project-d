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
    "  async function runRecommendationPoolPrecheck(",
  );

const executionStart =
  component.indexOf(
    "  async function runRecommendationPoolReviewExecution(",
    precheckStart,
  );

check(
  precheckStart >= 0,
  true,
  "free precheck function present",
);

check(
  executionStart > precheckStart,
  true,
  "free precheck boundary resolved",
);

const precheck =
  component.slice(
    precheckStart,
    executionStart,
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
  "review analysis remains dry-run in normal precheck",
);

check(
  precheck.includes(
    "allowMissingCriteria",
  ) &&
    precheck.includes(
      "Math.ceil(",
    ) &&
    precheck
      .replace(/\s+/g, " ")
      .includes(
        "reviews.length / 100",
      ),
  true,
  "V4 can calculate review cost from the fixed corpus before criteria exists",
);

check(
  precheck.includes(
    "selectedFiveIds",
  ) &&
    precheck.includes(
      "explicitSelectedFiveIds",
    ),
  true,
  "V4 precise precheck can anchor the current selected five",
);

check(
  precheck.includes(
    "inputFingerprint:\n            fingerprint",
  ),
  true,
  "normal precheck retains exact fingerprint for later execution",
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
  `Recommendation pool precheck regression V4 PASS: ${checks} assertions; free precheck paid calls 0; DB writes 0.`,
);
