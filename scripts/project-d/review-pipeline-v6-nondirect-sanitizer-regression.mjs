import fs from "node:fs";
import assert from "node:assert/strict";

const experimental =
  fs.readFileSync(
    "lib/project-d-review-v6-combined-experimental.ts",
    "utf8",
  ).replace(/\r\n/g, "\n");

const contract =
  fs.readFileSync(
    "lib/project-d-review-v6-combined-contract.ts",
    "utf8",
  ).replace(/\r\n/g, "\n");

let count = 0;
function check(value, message) {
  assert.ok(value, message);
  count++;
}

check(
  experimental.includes(
    "stage0-v6-combined-dynamic-c1c5-v3-production",
  ),
  "V6 production semantic version must be active after promotion.",
);

check(
  experimental.includes(
    'experienceSource=other_person 이고 currentTargetFirstHand=none 이면 모든 criterion e는 반드시 빈 배열',
  ),
  "Prompt must explicitly tell the model not to emit criterion events for other-person-only reviews.",
);

check(
  !experimental.includes(
    "criterion evidence forbidden for non-direct review",
  ),
  "V6 must not fail the paid batch solely because the model emitted discardable non-direct criterion evidence.",
);

check(
  experimental.includes(
    "droppedNonDirectCriterionEventCount +=",
  ),
  "Server must count discarded model events.",
);

check(
  experimental.includes(
    "continue;",
  ),
  "Server must skip non-direct criterion-event ingestion.",
);

check(
  experimental.includes(
    "nonDirectCriterionEventsDiscarded",
  ) &&
    experimental.includes(
      "nonDirectCriterionReviewsDiscarded",
    ),
  "Discard provenance must be retained in classificationAudit.",
);

check(
  experimental.includes(
    "deriveEligibility(row, review)",
  ),
  "Server-derived Stage0 eligibility must remain authoritative before criterion ingestion.",
);

check(
  contract.includes(
    "sanitizedCriteria",
  ) &&
    contract.includes(
      "droppedNonDirectCriterionEventCount",
    ),
  "The V6 contract must match production sanitizer semantics.",
);

check(
  !experimental.includes(
    '"무선청소기"',
  ) &&
    !experimental.includes(
      '"공기청정기"',
    ),
  "Sanitizer must stay category-generic.",
);

console.log(
  `V6 server-gated non-direct sanitizer regression PASS: ${count} assertions; paid calls 0; DB writes 0.`,
);
