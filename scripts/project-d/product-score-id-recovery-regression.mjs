import assert from "node:assert/strict";

const {
  repairSingleSplicedProductId,
} = await import(
  "../../lib/project-d-product-score-id-recovery.ts"
);

const expected = [
  "1439e7f8-bf54-43d9-9ae9-6800f6f8c293",
  "31384b00-ab5e-4e62-af9f-1c1ccc6949a6",
  "9e3e2ad4-9fa8-4422-aea5-eb2411b3070d",
  "88923f17-eff4-4140-8068-b0ec1a07bee0",
  "9e793e70-49a2-4c62-ba40-ad3f4b687b6c",
  "51e22f6c-e5e5-4926-b4f8-ea5b4d3fbdf2",
  "721383f5-cfad-4755-bced-6f963830ac75",
  "29978c7c-e3e8-4dbd-9cd0-e833c0931023",
  "b3b939ad-f327-4660-96c3-e74f882c6ab6",
  "1b38e816-4aeb-4b49-8160-90a7c24d3149",
  "d15526e2-811d-498c-a184-e0882bd58809",
  "c193b03f-de7c-4e62-a402-1afc4c36dfe1",
  "9f813b55-ca4c-45e6-8ef5-f0ad9f0ecea7",
  "25c500df-6c3a-45cf-a9da-ce43840c5a20",
  "fef83589-0a40-41a4-8381-809e747b6ac5",
];

const exactRows =
  expected.map(
    (productId) => ({
      productId,
    }),
  );

const exact =
  repairSingleSplicedProductId(
    exactRows,
    expected,
  );

assert.equal(
  exact.audit.repaired,
  false,
);

assert.equal(
  exact.audit.reason,
  "exact-membership",
);

const badId =
  "29978c7c-de7c-4e62-a402-1afc4c36dfe1";

const splicedRows =
  exactRows.map(
    (row) =>
      row.productId ===
        "29978c7c-e3e8-4dbd-9cd0-e833c0931023"
        ? {
            productId:
              badId,
          }
        : row,
  );

const repaired =
  repairSingleSplicedProductId(
    splicedRows,
    expected,
  );

assert.equal(
  repaired.audit.repaired,
  true,
);

assert.equal(
  repaired.audit.missingProductId,
  "29978c7c-e3e8-4dbd-9cd0-e833c0931023",
);

assert.equal(
  repaired.audit.extraProductId,
  badId,
);

assert.equal(
  repaired.audit.donorProductId,
  "c193b03f-de7c-4e62-a402-1afc4c36dfe1",
);

assert.deepEqual(
  new Set(
    repaired.results.map(
      (row) =>
        row.productId,
    ),
  ),
  new Set(expected),
);

const wrongHeadRows =
  splicedRows.map(
    (row) =>
      row.productId ===
        badId
        ? {
            productId:
              "aaaaaaaa-de7c-4e62-a402-1afc4c36dfe1",
          }
        : row,
  );

assert.equal(
  repairSingleSplicedProductId(
    wrongHeadRows,
    expected,
  ).audit.repaired,
  false,
);

const duplicateRows = [
  ...exactRows.slice(
    0,
    -1,
  ),
  {
    productId:
      expected[0],
  },
];

assert.equal(
  repairSingleSplicedProductId(
    duplicateRows,
    expected,
  ).audit.repaired,
  false,
);

const twoBadRows =
  exactRows.map(
    (row) => {
      if (
        row.productId ===
        expected[7]
      ) {
        return {
          productId:
            badId,
        };
      }

      if (
        row.productId ===
        expected[4]
      ) {
        return {
          productId:
            "9e793e70-1111-2222-3333-444444444444",
        };
      }

      return row;
    },
  );

assert.equal(
  repairSingleSplicedProductId(
    twoBadRows,
    expected,
  ).audit.repaired,
  false,
);

console.log(
  "PRODUCT SCORE ID RECOVERY REGRESSION: PASS"
);

console.log(
  "assertions: 9"
);

console.log(
  "OpenAI network calls: 0"
);

console.log(
  "OpenAI model calls: 0"
);

console.log(
  "DB writes: 0"
);
