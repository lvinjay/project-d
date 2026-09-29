import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/analyze-reviews/route.ts", "utf8").replace(/\r\n/g, "\n");
const legacyPipeline = fs.readFileSync("lib/project-d-review-production-pipeline.ts", "utf8").replace(/\r\n/g, "\n");
const v6 = fs.readFileSync("lib/project-d-review-v6-combined-experimental.ts", "utf8").replace(/\r\n/g, "\n");
const panel = fs.readFileSync("components/ProjectDAutomationPanel.tsx", "utf8").replace(/\r\n/g, "\n");
const fullHelper = fs.readFileSync("lib/project-d-full-category-one-approval.ts", "utf8").replace(/\r\n/g, "\n");

let checks = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks += 1;
}

check(route.includes("const REVIEW_BATCH_SIZE = 100;"), true,
  "production review route keeps 100-review batches");
check(route.includes("const useV6Production =\n      true as const;"), true,
  "V6 combined pipeline is the production default");
check(route.includes("runExperimentalV6CombinedBatch"), true,
  "validated combined V6 batch engine is wired into production");
check(route.includes("if (useV6Production)"), true,
  "batch response uses the combined production result");
check(
  /useV6Production\s*\?\s*executionMode ===\s*"batch"\s*\|\|\s*executionMode ===\s*"aggregate"\s*\?\s*1\s*:\s*batches\.length \+\s*1/s.test(route),
  true,
  "V6 production dry-run charges one call per combined batch plus one aggregate",
);
check(route.includes("reviewTextLimits:\n          useV6Production"), true,
  "production dry-run advertises the combined text limit");
check(route.includes("replayAvailable:\n          !useV6Production"), true,
  "legacy replay is disabled for the V6 production fingerprint");
check(v6.includes("stage0-v6-combined-dynamic-c1c5-v4-production"), true,
  "V6 production semantic version is distinct from canary fingerprints");
check((v6.match(/await client\.responses\.create\(/g) ?? []).length, 1,
  "combined V6 stage has one direct OpenAI call site");
check(v6.includes("nonDirectCriterionEventsDiscarded"), true,
  "server-gated non-direct sanitizer remains active");
check(v6.includes("maxRetries: 0"), true,
  "V6 combined transport retries remain disabled");
check(route.includes("REVIEW_AGGREGATE_MODEL"), true,
  "aggregate stage remains intact");
check(route.includes("maxRetries: 0"), true,
  "route aggregate client retries remain disabled");

check(fullHelper.includes("FULL_CATEGORY_REVIEW_MAX_CALLS_PER_PRODUCT = 2"), true,
  "full-category fallback ceiling is two review calls per 100-review product");
check(panel.includes("2 * Math.ceil(product.reviews.length / 100) + 1"), false,
  "V5 three-call execution guard is removed");
check(panel.includes("maximum > Math.ceil(product.reviews.length / 100) + 1"), true,
  "final execution guard uses V6 combined-batch-plus-aggregate ceiling");
check(panel.includes("2 *\n              Math.ceil(\n                reviews.length /\n                  100"), false,
  "V5 three-call planning formula is removed");
check(panel.includes("maximum =\n            Math.ceil(\n              reviews.length /\n                100,\n            ) +\n            1;"), true,
  "missing-criteria planning uses the V6 two-call ceiling");

check(panel.includes("PROJECT_D_V6_REVIEW_CANARY"), false,
  "temporary V6 combined diagnostic button is removed");
check(panel.includes("PROJECT_D_V6_AGGREGATE_ONLY_CANARY"), false,
  "temporary V6 aggregate-only button is removed");
check(panel.includes("runV6CombinedReviewCanary"), false,
  "temporary V6 combined diagnostic function is removed");
check(panel.includes("runV6AggregateFromDiagnosticFile"), false,
  "temporary V6 aggregate diagnostic function is removed");

const estimate = reviewCount => Math.ceil(reviewCount / 100) + 1;
check(estimate(100), 2, "100 reviews cost at most 2 OpenAI calls");
check(estimate(33), 2, "33 reviews cost at most 2 OpenAI calls");
check(estimate(101), 3, "101 reviews split into two combined batches plus aggregate");
check(15 * estimate(100), 30, "15 new 100-review products cap at 30 review calls");
check(1 + 15 * estimate(100) + 1, 32,
  "new-category criteria + 15 reviews + score cap at 32 OpenAI calls");

check(legacyPipeline.includes("Stage0V5Core") && legacyPipeline.includes("CriteriaV14Core"), true,
  "legacy V5 core remains available for historical compatibility");
check(panel.includes('"무선청소기"') || panel.includes('"공기청정기"') || panel.includes("280000"), false,
  "production promotion remains category and budget generic");

console.log(
  `Review pipeline V6 production promotion regression PASS: ${checks} assertions; paid calls 0; DB writes 0.`,
);
