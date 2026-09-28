import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const route = read("app/api/generate-product-scores/route.ts");
const helper = read("lib/project-d-product-score-prompt.ts");

let checks = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

check(
  route.includes("project-d-product-score-v3-recommendation-pool-compact-evidence"),
  true,
  "pipeline version bumped",
);
check(
  route.includes("buildProductScoreEvidenceProducts"),
  true,
  "route uses compact evidence builder",
);
check(
  route.includes("buildProductScorePrompt"),
  true,
  "route uses shared compact prompt builder",
);
check(
  route.includes("promptCharacters >") &&
    route.includes("PRODUCT_SCORE_PROMPT_CHAR_LIMIT"),
  true,
  "pre-call prompt character guard exists",
);
check(
  route.includes("promptWithinSafeLimit:") &&
    route.includes("promptUtf8Bytes"),
  true,
  "dry-run exposes prompt-size diagnostics",
);
check(
  route.indexOf("paidApiCalls += 1;") >
    route.indexOf("promptCharacters >"),
  true,
  "paid counter occurs after prompt-size guard",
);
check(
  helper.includes("officialEvidence") &&
    helper.includes("reviewEvidence"),
  true,
  "prompt evidence is criteria-focused",
);
check(
  helper.includes("productDetailAnalysis"),
  false,
  "full product detail analysis is not copied into prompt",
);
check(
  helper.includes("evidenceReviewNumbers"),
  false,
  "large review-number arrays are not copied into prompt",
);
check(
  helper.includes("PRODUCT_SCORE_PROMPT_CHAR_LIMIT =\n  140_000"),
  true,
  "conservative prompt limit configured",
);
check(
  helper.includes("무선청소기") || helper.includes("280000"),
  false,
  "no category-specific one-off rule",
);
const paidCounterMatches =
  route.match(
    /paidApiCalls\s*\+=\s*1\s*;/g,
  ) ?? [];

check(
  paidCounterMatches.length,
  1,
  "single paid score request remains",
);

const paidCounterIndex =
  route.search(
    /paidApiCalls\s*\+=\s*1\s*;/,
  );

const responseCreateIndex =
  route.indexOf(
    "client.responses.create(",
  );

check(
  paidCounterIndex >= 0 &&
    responseCreateIndex >
      paidCounterIndex,
  true,
  "paid counter immediately guards the single OpenAI score request path",
);

console.log(
  `Product score compact-context regression PASS: ${checks} assertions; paid calls 0; DB writes 0.`,
);
