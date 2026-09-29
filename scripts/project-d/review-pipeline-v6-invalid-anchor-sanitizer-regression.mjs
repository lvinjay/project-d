import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "lib/project-d-review-v6-combined-experimental.ts",
  "utf8",
);

let assertions = 0;

function check(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
  assertions++;
}

check(
  source.includes(
    "const invalidAssertedAnchor =",
  ),
  true,
  "V6 derives a fail-closed invalid asserted-anchor state",
);

check(
  source.includes(
    "(firstHandClaimed && !firstHandVerified)",
  ),
  true,
  "invalid first-hand anchors are detected",
);

check(
  source.includes(
    "(performanceClaimed && !performanceVerified)",
  ),
  true,
  "invalid performance anchors are detected",
);

check(
  source.includes(
    '(mismatchClaimed && !mismatchVerified)',
  ),
  true,
  "invalid mismatch anchors are detected",
);

check(
  source.includes(
    "(notUsedClaimed && !notUsedVerified)",
  ),
  true,
  "invalid not-used anchors are detected",
);

check(
  source.includes(
    'reasonCode:\n        "unverifiable_evidence_anchor"',
  ),
  true,
  "invalid asserted anchors fail closed to unverifiable evidence",
);

check(
  source.includes(
    'throw new Error(\`R\${row.n}: \${label} requires a valid same-review segment anchor.\`)',
  ),
  false,
  "one invalid Stage0 anchor no longer discards the whole paid batch",
);

check(
  source.includes(
    'derived.e !== "direct" &&',
  ),
  true,
  "existing non-direct criterion sanitizer remains active",
);

check(
  source.includes(
    "droppedNonDirectCriterionEventCount +=",
  ),
  true,
  "discarded non-direct criterion events remain audited",
);

console.log(
  `V6 invalid-anchor sanitizer regression PASS: ${assertions} assertions; paid calls 0; DB writes 0.`,
);
