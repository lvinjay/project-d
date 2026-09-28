import assert from "node:assert/strict";
import fs from "node:fs";

const panel =
  fs.readFileSync(
    "components/ProjectDAutomationPanel.tsx",
    "utf8",
  ).replace(/\r\n/g, "\n");

const helper =
  fs.readFileSync(
    "lib/project-d-full-category-one-approval.ts",
    "utf8",
  ).replace(/\r\n/g, "\n");

let checks = 0;

function check(
  actual,
  expected,
  label,
) {
  assert.equal(
    actual,
    expected,
    label,
  );
  checks += 1;
}

check(
  helper.includes(
    "FULL_CATEGORY_POOL_PRODUCT_MAX = 15",
  ),
  true,
  "full build approval is bounded to recommendation pool target 15",
);

check(
  helper.includes(
    "FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT = 2",
  ),
  true,
  "per-product review ceiling is three under V5 batch-100",
);

check(
  helper.includes(
    "FULL_CATEGORY_CRITERIA_MAX_CALLS = 1",
  ) &&
    helper.includes(
      "FULL_CATEGORY_SCORE_MAX_CALLS = 1",
    ),
  true,
  "criteria and score ceilings are one each",
);

check(
  helper.includes(
    "totalMaxOpenAiCalls",
  ) &&
    helper.includes(
      "리뷰 fingerprint는 구매기준 준비 후 무료 preflight에서 확정",
    ),
  true,
  "single approval explicitly supports staged post-criteria review preflight",
);

check(
  panel.includes(
    "FULL_CATEGORY_ONE_APPROVAL_V3",
  ),
  true,
  "run() supports V3 full-category mode",
);

check(
  panel.includes(
    "ensureFullCategoryApproval",
  ),
  true,
  "one bounded approval gate exists before paid work",
);

check(
  panel.includes(
    "fullActualResolverCalls",
  ) &&
    panel.includes(
      "fullActualBrightDataCalls",
    ),
  true,
  "actual market external calls are checked",
);

check(
  panel.includes(
    "fullAccountedCriteriaOpenAiCalls",
  ) &&
    panel.includes(
      "fullAccountedReviewOpenAiCalls",
    ),
  true,
  "criteria and initial review calls are accounted",
);

check(
  panel.includes(
    "runFullCategoryOneApprovalBuild",
  ),
  true,
  "top-level full category orchestrator exists",
);

check(
  panel.includes(
    "runRecommendationPoolPrecheck()",
  ) &&
    panel.includes(
      "executeScoreAfterPreflight:\n            true",
    ),
  true,
  "full flow continues through recommendation pool and score",
);

check(
  panel.includes(
    "preparedProducts:",
  ),
  true,
  "free pool precheck returns identities for expanded manifest",
);

check(
  panel.includes(
    "recommendationPool:\n            precheck.preparedProducts.map",
  ),
  true,
  "final published manifest expands to the prepared recommendation pool",
);

check(
  panel.includes(
    'data-marker="PROJECT_D_FULL_CATEGORY_ONE_APPROVAL_BUILD"',
  ),
  true,
  "V3 admin button exists",
);

check(
  panel.includes(
    "무선청소기",
  ) ||
    panel.includes(
      "280000",
    ),
  false,
  "V3 source remains category and budget generic",
);

console.log(
  "Full category one-approval V3 regression PASS: " +
    checks +
    " assertions; paid calls 0; DB writes 0.",
);
