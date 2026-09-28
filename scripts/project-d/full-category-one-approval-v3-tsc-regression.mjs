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

const properties = [
  "resolverMaxCalls",
  "brightDataMaxCalls",
  "criteriaMaxOpenAiCalls",
  "reviewMaxOpenAiCalls",
];

for (const property of properties) {
  check(
    source.includes(
      "fullApprovalPlan." +
        property,
    ),
    false,
    "direct closure-narrowed access removed: " +
      property,
  );

  check(
    source.includes(
      "(fullApprovalPlan as ReturnType<typeof buildFullCategoryOneApprovalPlan>)." +
        property,
    ),
    true,
    "explicit V3 plan type retained: " +
      property,
  );
}

check(
  source.includes(
    "runFullCategoryOneApprovalBuild",
  ),
  true,
  "V3 orchestrator remains present",
);

check(
  source.includes(
    'data-marker="PROJECT_D_FULL_CATEGORY_ONE_APPROVAL_BUILD"',
  ),
  true,
  "V3 admin button remains present",
);

console.log(
  "Full category one-approval V3 TSC regression PASS: " +
    checks +
    " assertions; paid calls 0; DB writes 0.",
);
