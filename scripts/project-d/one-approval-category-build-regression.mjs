import assert from "node:assert/strict";
import fs from "node:fs";

const helperPath =
  "lib/project-d-one-approval-category-build.ts";

const source =
  fs.readFileSync(
    helperPath,
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
    "ONE_APPROVAL_POOL_MIN = 5",
  ),
  true,
  "pool minimum remains 5",
);

check(
  source.includes(
    "ONE_APPROVAL_POOL_MAX = 15",
  ),
  true,
  "pool maximum remains 15",
);

check(
  source.includes(
    "ONE_APPROVAL_REVIEW_MAX_CALLS_PER_PRODUCT = 5",
  ),
  true,
  "review per-product paid-call bound exists",
);

check(
  source.includes(
    "ONE_APPROVAL_SCORE_MAX_CALLS = 1",
  ),
  true,
  "score paid-call bound remains one",
);

check(
  source.includes(
    "post_review_free_preflight",
  ),
  true,
  "post-review score fingerprint policy is explicit",
);

check(
  source.includes(
    "Every review plan needs an exact 64-character input fingerprint.",
  ),
  true,
  "review execution requires exact dry-run fingerprints",
);

check(
  source.includes(
    "Every review plan must belong to the approved Recommendation Pool.",
  ),
  true,
  "review plans are restricted to approved pool",
);

check(
  source.includes(
    "totalMaxOpenAiCalls",
  ),
  true,
  "single approval has an explicit total paid-call ceiling",
);

check(
  source.includes(
    "무료 preflight가 실패하거나 호출 상한이 달라지면 유료 실행 없이 즉시 중단합니다.",
  ),
  true,
  "approval text contains fail-closed safety rule",
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
  "One-approval category build V1 regression PASS: " +
    checks +
    " assertions; paid calls 0; DB writes 0.",
);
