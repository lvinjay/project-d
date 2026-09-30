import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const panel = fs
  .readFileSync(
    "components/ProjectDAutomationPanel.tsx",
    "utf8",
  )
  .replace(/\r\n/g, "\n");

const helperSource = fs
  .readFileSync(
    "lib/project-d-full-category-one-approval.ts",
    "utf8",
  )
  .replace(/\r\n/g, "\n");

const transpiled =
  ts.transpileModule(
    helperSource,
    {
      compilerOptions: {
        module:
          ts.ModuleKind.CommonJS,
        target:
          ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

const exportsObject = {};
vm.runInNewContext(
  transpiled,
  {
    exports:
      exportsObject,
  },
);

const buildPlan =
  exportsObject
    .buildFullCategoryOneApprovalPlan;

assert.equal(
  typeof buildPlan,
  "function",
  "V4 helper export must load",
);

let checks = 1;

function check(
  actual,
  expected,
  label,
) {
  assert.deepEqual(
    actual,
    expected,
    label,
  );
  checks += 1;
}

const legacy =
  buildPlan({
    category:
      "test-category",
    resolverMaxCalls:
      0,
    brightDataMaxCalls:
      0,
  });

check(
  legacy.precisePlan,
  false,
  "legacy V3 plan stays conservative",
);

check(
  legacy.reviewMaxOpenAiCalls,
  30,
  "fallback full-category review ceiling follows V6 30-call maximum",
);

check(
  legacy.totalMaxOpenAiCalls,
  32,
  "fallback full-category total ceiling follows V6 32-call maximum",
);

const preciseReviewPlans =
  Array.from(
    {
      length:
        15,
    },
    (_, index) => {
      if (index < 5) {
        return {
          productName:
            `reused-${index}`,
          reviewCount:
            0,
          estimatedOpenAiCalls:
            0,
          reusable:
            true,
        };
      }

      if (index < 10) {
        return {
          productName:
            `short-${index}`,
          reviewCount:
            40,
          estimatedOpenAiCalls:
            2,
          reusable:
            false,
        };
      }

      return {
        productName:
          `long-${index}`,
        reviewCount:
          100,
        estimatedOpenAiCalls:
          2,
        reusable:
          false,
      };
    },
  );

const precise =
  buildPlan({
    category:
      "test-category",
    resolverMaxCalls:
      0,
    brightDataMaxCalls:
      0,
    criteriaMaxOpenAiCalls:
      1,
    preciseReviewPlans,
    scoreMaxOpenAiCalls:
      1,
  });

check(
  precise.precisePlan,
  true,
  "V4 plan marks precise mode",
);

check(
  precise.reviewProductMax,
  15,
  "V4 precise plan keeps 15-product pool",
);

check(
  precise.reviewMaxOpenAiCalls,
  20,
  "V4 precise plan sums current V6 per-product review ceilings",
);

check(
  precise.totalMaxOpenAiCalls,
  22,
  "V4 precise plan totals criteria + V6 reviews + score",
);

check(
  precise.approvalLines.some(
    (line) =>
      line.includes(
        "기존 분석 재사용 5개",
      ),
  ),
  true,
  "V4 approval explains reusable count",
);

check(
  precise.approvalLines.some(
    (line) =>
      line.includes(
        "제품별 무료 사전계획",
      ),
  ),
  true,
  "V4 approval includes per-product free plan",
);

check(
  panel.includes(
    "FULL_CATEGORY_ONE_APPROVAL_V4_PRECISE_PLAN",
  ),
  true,
  "V4 precise precheck marker exists",
);

check(
  panel.includes(
    "allowMissingCriteria?: boolean",
  ) &&
    !panel.includes(
      "selectedFiveIds?: string[]",
    ),
  true,
  "pool precheck accepts pool-only planning inputs",
);

check(
  panel.includes(
    "explicitSelectedFiveIds",
  ),
  false,
  "precise planning no longer anchors a selected-five subset",
);

check(
  panel.includes(
    "options?.allowMissingCriteria ===\n          true",
  ) &&
    panel.includes(
      "Math.ceil(\n              reviews.length /\n                100",
    ),
  true,
  "missing-criteria review ceiling comes from actual fixed corpus size",
);

check(
  panel.includes(
    "fullCategoryOneApprovalMode\n              ? true\n              : await requestApproval",
  ),
  true,
  "zero-paid market path defers the full paid approval",
);

check(
  panel.includes(
    "V4 정밀 비용계획 승인 전에 시장 유료 호출이 감지되어 중단합니다.",
  ),
  true,
  "deferred approval path fails closed on any market paid call",
);

check(
  panel.includes(
    "await runRecommendationPoolPrecheck({",
  ) &&
    panel.includes(
      "allowMissingCriteria:",
    ) &&
    panel.includes(
      "planningOnly:",
    ),
  true,
  "full-category run performs precise pool-only free precheck before OpenAI",
);

check(
  panel.includes(
    "criteriaMaxOpenAiCalls:\n                fullCategoryCriteriaAlreadyAvailable\n                  ? 0\n                  : 1",
  ),
  true,
  "criteria approval is 0 or 1 from current category state",
);

check(
  panel.includes(
    'title:\n            precise\n              ? "카테고리 전체 정밀 비용계획 1회 승인"',
  ),
  true,
  "V4 uses a single precise approval dialog",
);

check(
  panel.includes(
    "? await ensureFullCategoryApproval(\n                  0,\n                  0,",
  ),
  false,
  "zero-paid market branch no longer opens the old 77-call approval",
);

check(
  panel.includes(
    "무선청소기",
  ) ||
    panel.includes(
      "280000",
    ),
  false,
  "V4 source remains category and budget generic",
);

console.log(
  `Full category one-approval V4 precise-plan regression PASS: ${checks} assertions; paid calls 0; DB writes 0.`,
);
