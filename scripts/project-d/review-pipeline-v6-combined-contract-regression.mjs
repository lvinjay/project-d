import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";

const path =
  "lib/project-d-review-v6-combined-contract.ts";
const source =
  fs.readFileSync(
    path,
    "utf8",
  );

const output =
  ts.transpileModule(
    source,
    {
      compilerOptions: {
        module:
          ts.ModuleKind.CommonJS,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

const sandbox = {
  exports: {},
};

vm.runInNewContext(
  output,
  sandbox,
  {
    filename:
      path,
  },
);

const {
  V6_EXPERIMENTAL_ONLY,
  buildV6ReviewCostPlan,
  buildV6CategoryUpperBound,
  validateV6CombinedFixture,
} =
  sandbox.exports;

let count =
  0;

function check(
  actual,
  expected,
) {
  assert.deepEqual(
    actual,
    expected,
  );
  count++;
}

check(
  V6_EXPERIMENTAL_ONLY,
  true,
);

const plan100 =
  buildV6ReviewCostPlan(
    100,
  );

check(
  plan100.batchCount,
  1,
);
check(
  plan100.combinedBatchMaxOpenAiCalls,
  1,
);
check(
  plan100.aggregateMaxOpenAiCalls,
  1,
);
check(
  plan100.reviewMaxOpenAiCalls,
  2,
);

const categoryPlan =
  buildV6CategoryUpperBound(
    Array.from(
      {
        length:
          15,
      },
      () =>
        100,
    ),
    1,
    1,
  );

check(
  categoryPlan.reviewMaxOpenAiCalls,
  30,
);
check(
  categoryPlan.totalMaxOpenAiCalls,
  32,
);

const emptySlots =
  () =>
    [
      "c1",
      "c2",
      "c3",
      "c4",
      "c5",
    ].map(
      c => ({
        c,
        positiveSegmentIds:
          [],
        negativeSegmentIds:
          [],
        neutralSegmentIds:
          [],
      }),
    );

const directSlots =
  emptySlots();

directSlots[0]
  .positiveSegmentIds
  .push(
    "R1C1S1",
  );

const directStage0 = {
  explicitCurrentProductMismatch:
    "none",
  mismatchAnchorVerified:
    false,
  currentTargetFirstHand:
    "operation",
  firstHandAnchorVerified:
    true,
  experienceSource:
    "author",
  concretePerformanceResult:
    "present",
  performanceAnchorVerified:
    true,
  explicitNotUsedCurrentProduct:
    "none",
  notUsedAnchorVerified:
    false,
};

const specStage0 = {
  explicitCurrentProductMismatch:
    "none",
  mismatchAnchorVerified:
    false,
  currentTargetFirstHand:
    "none",
  firstHandAnchorVerified:
    false,
  experienceSource:
    "author",
  concretePerformanceResult:
    "none",
  performanceAnchorVerified:
    false,
  explicitNotUsedCurrentProduct:
    "none",
  notUsedAnchorVerified:
    false,
};

const rows =
  Array.from(
    {
      length:
        100,
    },
    (
      _,
      index,
    ) => ({
      n:
        index +
        1,
      stage0:
        index ===
          0
          ? directStage0
          : specStage0,
      criteria:
        index ===
          0
          ? directSlots
          : emptySlots(),
    }),
  );

const validated =
  validateV6CombinedFixture(
    rows,
    1,
    100,
  );

check(
  validated.length,
  100,
);
check(
  validated[0].eligibility,
  "direct",
);
check(
  validated[1].eligibility,
  "spec_only",
);

const invalidNonDirect =
  structuredClone(
    rows,
  );

invalidNonDirect[1]
  .criteria[0]
  .negativeSegmentIds
  .push(
    "R2C1S1",
  );

const sanitizedNonDirect =
  validateV6CombinedFixture(
    invalidNonDirect,
    1,
    100,
  );

check(
  sanitizedNonDirect[1]
    .eligibility,
  "spec_only",
);

check(
  sanitizedNonDirect[1]
    .droppedNonDirectCriterionEventCount,
  1,
);

check(
  sanitizedNonDirect[1]
    .criteria[0]
    .negativeSegmentIds
    .length,
  0,
);

const duplicate =
  structuredClone(
    rows,
  );

duplicate[1].n =
  1;

assert.throws(
  () =>
    validateV6CombinedFixture(
      duplicate,
      1,
      100,
    ),
  /unique/,
);
count++;

const missingSlot =
  structuredClone(
    rows,
  );

missingSlot[0]
  .criteria
  .pop();

assert.throws(
  () =>
    validateV6CombinedFixture(
      missingSlot,
      1,
      100,
    ),
  /exactly five/,
);
count++;

console.log(
  `V6 combined Stage0+criteria contract regression PASS: ${count} assertions; server-gated non-direct sanitizer active; experimental production wiring 0; paid calls 0; DB writes 0.`,
);
