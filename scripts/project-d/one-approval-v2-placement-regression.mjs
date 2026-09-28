import assert from "node:assert/strict";
import fs from "node:fs";

const source =
  fs.readFileSync(
    "components/ProjectDAutomationPanel.tsx",
    "utf8",
  ).replace(/\r\n/g, "\n");

const reviewStart =
  source.indexOf(
    "async function runRecommendationPoolReviewExecution(",
  );

const marker =
  source.indexOf(
    "// ONE_APPROVAL_EXECUTION_OPTIONS",
    reviewStart,
  );

const orchestrator =
  source.indexOf(
    "async function runOneApprovalRecommendationPoolBuild()",
    reviewStart,
  );

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
  reviewStart >= 0,
  true,
  "review execution function exists",
);

check(
  marker > reviewStart,
  true,
  "review execution body marker exists",
);

check(
  /}\s*,\s*\n\s*\)\s*\{/.test(
    source.slice(
      reviewStart,
      marker,
    ),
  ),
  true,
  "typed options signature closes before function body",
);

check(
  orchestrator > marker,
  true,
  "one-approval orchestrator is no longer inside the typed signature",
);

check(
  source.indexOf(
    "async function runOneApprovalRecommendationPoolBuild()",
    orchestrator + 1,
  ),
  -1,
  "one-approval orchestrator is unique",
);

check(
  /options\?\.reviewPlans\s*\?\?\s*poolReviewPlans/.test(
    source,
  ),
  true,
  "review fallback still uses poolReviewPlans",
);

check(
  /options\?\.preparedProductIds\s*\?\?\s*poolPreparedProductIds/.test(
    source,
  ),
  true,
  "prepared-id fallback still uses poolPreparedProductIds",
);

check(
  source.includes(
    'data-marker="PROJECT_D_ONE_APPROVAL_CATEGORY_BUILD"',
  ),
  true,
  "one-approval admin button remains present",
);

console.log(
  "One-approval V2 placement regression PASS: " +
    checks +
    " assertions; paid calls 0; DB writes 0.",
);
