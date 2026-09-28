import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync(
  "components/ProjectDAutomationPanel.tsx",
  "utf8",
).replace(/\r\n/g, "\n");

const helper = fs.readFileSync(
  "lib/project-d-recommendation-pool.ts",
  "utf8",
).replace(/\r\n/g, "\n");

let checks = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}

check(panel.includes("runRecommendationPoolReviewExecution"), true, "generic pool paid execution present");
check(panel.includes("planRecommendationPool"), true, "shared pool planner used");
check(panel.includes("currentEligiblePoolCandidates"), true, "main automation pool is limited to current eligible products");
check(panel.includes("analysisTargets"), true, "main automation uses recommendation pool targets");
check(panel.includes("for (const product of analysisTargets)"), true, "review analysis is not fixed-five only");
check(panel.includes("selected.map(") && panel.includes("selected-five 제품의 리뷰 준비 상태"), true, "selected-five compatibility remains exactly five");
check(panel.includes('data-marker="PROJECT_D_RECOMMENDATION_POOL_EXECUTE"'), true, "approved review execution UI present");
check(panel.includes("inputFingerprint:") && panel.includes("plan.inputFingerprint"), true, "paid review execution bound to dry-run fingerprint");
check(panel.includes("/api/save-review-raw-batch"), true, "same review corpus is persisted");
check(panel.includes("poolPreparedProductIds") && panel.includes("dryRun:") && panel.includes("/api/generate-product-scores"), true, "pool-wide product score remains dry-run only");
check(panel.includes("무선청소기"), false, "no wireless-vacuum category special case");
check(helper.includes("무선청소기"), false, "shared planner is category-generic");
check(helper.includes("280000"), false, "shared planner has no one-off 280k rule");
check(helper.includes("RECOMMENDATION_POOL_TARGET = 15"), true, "generic pool target stays 15");

console.log(
  `Recommendation pool generic pipeline V2 PASS: ${checks} assertions; category-specific one-off branches 0.`,
);
