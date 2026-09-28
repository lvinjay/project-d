import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs
  .readFileSync(
    "lib/project-d-recommendation-pool.ts",
    "utf8",
  )
  .replace(/\r\n/g, "\n");

const transpiled =
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

const exports = {};

vm.runInNewContext(
  transpiled,
  {
    exports,
    module: {
      exports,
    },
    console,
  },
);

const {
  planRecommendationPool,
  RECOMMENDATION_POOL_TARGET,
} = exports;

assert.equal(
  RECOMMENDATION_POOL_TARGET,
  15,
  "target pool must be 15",
);

const ids = Array.from(
  { length: 26 },
  (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

const prices = [
  47800,
  89000,
  123020,
  168000,
  168500,
  169000,
  186500,
  187400,
  261000,
  262370,
  280030,
  362990,
  469231,
  593810,
  672310,
  769000,
  810000,
  850000,
  900000,
  950000,
  1000000,
  1100000,
  1200000,
  1300000,
  1400000,
  1500000,
];

const candidates =
  prices.map(
    (price, index) => ({
      dbProductId:
        ids[index],
      originProductNo:
        1000 + index,
      productName:
        `fixture-${index + 1}`,
      price,
    }),
  );

const plan =
  planRecommendationPool(
    candidates,
    {
      selectedFiveIds: [
        ids[5],
        ids[10],
        ids[12],
        ids[14],
        ids[15],
      ],
    },
  );

assert.equal(
  plan.sourceCount,
  26,
);
assert.equal(
  plan.selectedCount,
  15,
);
assert.equal(
  plan.lowCount,
  5,
);
assert.equal(
  plan.midCount,
  5,
);
assert.equal(
  plan.highCount,
  5,
);

assert.equal(
  new Set(
    plan.products.map(
      (row) =>
        row.dbProductId,
    ),
  ).size,
  15,
  "pool ids must be unique",
);

assert.equal(
  new Set(
    plan.products.map(
      (row) =>
        row.originProductNo,
    ),
  ).size,
  15,
  "pool origins must be unique",
);

const under280 =
  plan.products.filter(
    (row) =>
      row.price <= 280000,
  );

assert.ok(
  under280.length >= 5,
  "wireless-vacuum-like fixture should retain at least five <=280k products",
);

assert.ok(
  plan.products.some(
    (row) =>
      row.dbProductId ===
        ids[5] &&
      row.selectedFiveAnchor ===
        true,
  ),
  "eligible selected-five anchor should be preserved",
);

const small =
  planRecommendationPool(
    candidates.slice(0, 7),
  );

assert.equal(
  small.selectedCount,
  7,
  "small valid pools should keep all candidates",
);

console.log(
  "Recommendation pool regression PASS: 11 assertions; paid/external calls 0; DB writes 0.",
);
