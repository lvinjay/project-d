import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("app/api/analyze-reviews/route.ts", "utf8").replace(/\r\n/g, "\n");
const panel = fs.readFileSync("components/ProjectDAutomationPanel.tsx", "utf8").replace(/\r\n/g, "\n");
const helper = fs.readFileSync("lib/project-d-full-category-one-approval.ts", "utf8").replace(/\r\n/g, "\n");
const v6 = fs.readFileSync("lib/project-d-review-v6-combined-experimental.ts", "utf8").replace(/\r\n/g, "\n");

let count = 0;
const check = (value, message) => {
  assert.ok(value, message);
  count++;
};

check(route.includes("const useV6Production =\n      true as const;"), "V6 must be the default review route.");
check(route.includes("createExperimentalV6CombinedDryRun"), "V6 free preflight must be present.");
check(route.includes("createExperimentalV6CombinedFingerprint"), "V6 production fingerprint must be present.");
check(route.includes("runExperimentalV6CombinedBatch"), "V6 paid combined engine must be present.");
check(route.includes("activeReviewQualitySource"), "V6 checkpoint source validation must remain explicit.");
check(v6.includes("stage0-v6-combined-dynamic-c1c5-v3-production"), "V6 production semantic version missing.");
check(v6.includes("nonDirectCriterionEventsDiscarded"), "Non-direct sanitizer audit missing.");
check(v6.includes("invalidRejectedCandidateCount: 0"), "Sanitizer discards must remain separate from invalid candidate accounting.");
check(helper.includes("FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT = 2"), "Approval helper must cap 100-review products at two calls.");
check(panel.includes("maximum > Math.ceil(product.reviews.length / 100) + 1"), "Admin execution must fail closed above V6 cost ceiling.");
check(!panel.includes("PROJECT_D_V6_REVIEW_CANARY"), "Temporary combined canary UI must be removed.");
check(!panel.includes("PROJECT_D_V6_AGGREGATE_ONLY_CANARY"), "Temporary aggregate canary UI must be removed.");
check(!panel.includes('"무선청소기"') && !panel.includes('"공기청정기"'), "No category-specific production branch allowed.");

console.log(`V6 production promotion regression PASS: ${count} assertions; paid calls 0; DB writes 0.`);
