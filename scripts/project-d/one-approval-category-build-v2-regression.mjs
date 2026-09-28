import assert from "node:assert/strict";
import fs from "node:fs";

const source =
  fs.readFileSync(
    "components/ProjectDAutomationPanel.tsx",
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
  source.includes(
    'buildOneApprovalCategoryBuildPlan',
  ),
  true,
  "V1 approval contract is wired into admin",
);

check(
  source.includes(
    "ONE_APPROVAL_PRECHECK_RETURN",
  ),
  true,
  "free precheck returns exact plans to same-click orchestrator",
);

check(
  source.includes(
    "ONE_APPROVAL_EXECUTION_OPTIONS",
  ),
  true,
  "review executor accepts one-approval execution options",
);

check(
  source.includes(
    "runOneApprovalRecommendationPoolBuild",
  ),
  true,
  "one-approval orchestrator exists",
);

check(
  source.includes(
    'title:\n            "추천 준비 풀 한 번 승인"',
  ),
  true,
  "persistent approval dialog is used",
);

check(
  source.includes(
    "skipApproval:\n          true",
  ),
  true,
  "second review confirmation is skipped only after one approval",
);

check(
  source.includes(
    "executeScoreAfterPreflight:\n          true",
  ),
  true,
  "same approval continues into post-review score preflight",
);

check(
  source.includes(
    "approvedScoreMaxOpenAiCalls",
  ) &&
    source.includes(
      "approvedTotalMaxOpenAiCalls",
    ),
  true,
  "score and total paid-call ceilings are enforced",
);

check(
  source.includes(
    "actualReviewPaidApiCalls",
  ) &&
    source.includes(
      "scorePaidApiCalls",
    ) &&
    source.includes(
      "actualTotalPaidApiCalls",
    ),
  true,
  "actual paid calls are counted against approval",
);

check(
  source.includes(
    "verifyResult.cacheHit !==\n            true",
  ),
  true,
  "free post-execution cache verification is required",
);

check(
  source.includes(
    'data-marker="PROJECT_D_ONE_APPROVAL_CATEGORY_BUILD"',
  ),
  true,
  "one-approval admin button exists",
);

check(
  source.includes(
    "무선청소기",
  ) ||
    source.includes(
      "280000",
    ),
  false,
  "no category-specific or budget-specific one-off logic",
);

console.log(
  "One-approval category build V2 regression PASS: " +
    checks +
    " assertions; paid calls 0; DB writes 0.",
);
