import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const category = String(process.argv[2] ?? "").trim();
const expectedCount = Number(process.argv[3] ?? 15);
const approvedMaxCalls = Number(process.argv[4] ?? 1);

if (!category) {
  throw new Error("category argument is required.");
}
if (!Number.isSafeInteger(expectedCount) || expectedCount < 5 || expectedCount > 15) {
  throw new Error("expectedCount must be 5..15.");
}
if (!Number.isSafeInteger(approvedMaxCalls) || approvedMaxCalls < 0 || approvedMaxCalls > 1) {
  throw new Error("approvedMaxCalls must be 0 or 1.");
}

const baseUrl =
  process.env.PROJECT_D_BASE_URL?.trim() ||
  "http://localhost:3000";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numericPrice(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

async function jsonFetch(path, init) {
  const response = await fetch(baseUrl + path, init);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${path}: non-JSON response ${response.status}: ${text.slice(0, 500)}`);
  }
  return { response, data };
}

function loadPlanner() {
  const source = fs.readFileSync(
    "lib/project-d-recommendation-pool.ts",
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const exports = {};
  vm.runInNewContext(output, {
    exports,
    module: { exports },
    console,
  });
  return exports.planRecommendationPool;
}

const planRecommendationPool = loadPlanner();

console.log("===== APPROVED RECOMMENDATION POOL SCORE EXECUTION =====");
console.log(`CATEGORY=${category}`);
console.log(`EXPECTED_POOL=${expectedCount}`);
console.log(`APPROVED_OPENAI_MAX=${approvedMaxCalls}`);

if (expectedCount !== 15) {
  throw new Error("PAID CALL BLOCKED: approved Recommendation Pool must contain exactly 15 products.");
}

const manifestResult = await jsonFetch(
  "/api/selected-five-manifest?category=" + encodeURIComponent(category),
  { cache: "no-store" },
);

if (
  !manifestResult.response.ok ||
  manifestResult.data?.success !== true ||
  !manifestResult.data?.manifest ||
  !Array.isArray(manifestResult.data.manifest.products) ||
  manifestResult.data.manifest.products.length !== expectedCount
) {
  throw new Error(
    manifestResult.data?.message ||
      "Published Recommendation Pool manifest is not ready.",
  );
}

const recommendationPoolManifest =
  manifestResult.data.manifest;

const poolProducts =
  recommendationPoolManifest.products;

const poolIds =
  poolProducts.map(
    (product) =>
      cleanText(
        product?.dbProductId,
      ),
  );

const normalizedPoolIds =
  poolIds.map(
    (id) =>
      id.toLowerCase(),
  );

if (
  poolIds.length !== expectedCount ||
  poolIds.some((id) => !id) ||
  new Set(normalizedPoolIds).size !== expectedCount
) {
  throw new Error("PAID CALL BLOCKED: published Recommendation Pool identity is invalid.");
}

const catalogResult = await jsonFetch(
  "/api/catalog-products?category=" + encodeURIComponent(category),
  { cache: "no-store" },
);

if (
  !catalogResult.response.ok ||
  catalogResult.data?.success !== true ||
  !Array.isArray(catalogResult.data.products)
) {
  throw new Error(
    catalogResult.data?.message ||
      "Catalog products are not available.",
  );
}

const analyzedCatalogIds =
  new Set(
    catalogResult.data.products
      .filter(
        (product) =>
          product?.analyzed === true,
      )
      .map(
        (product) =>
          cleanText(
            product?.id,
          ).toLowerCase(),
      )
      .filter(Boolean),
  );

for (const poolId of poolIds) {
  if (
    !analyzedCatalogIds.has(
      poolId.toLowerCase(),
    )
  ) {
    throw new Error(
      `PAID CALL BLOCKED: Recommendation Pool product is not analyzed: ${poolId}`,
    );
  }
}



console.log(
  `POOL_PUBLISHED=${poolIds.length} | low=${plan.lowCount} mid=${plan.midCount} high=${plan.highCount}`,
);

const dryRunResult = await jsonFetch(
  "/api/generate-product-scores",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category,
      productIds: poolIds,
      dryRun: true,
    }),
  },
);

const estimated = Number(
  dryRunResult.data?.estimatedOpenAiCalls ?? -1,
);
const fingerprint = cleanText(
  dryRunResult.data?.inputFingerprint,
);

if (
  !dryRunResult.response.ok ||
  dryRunResult.data?.success !== true ||
  dryRunResult.data?.dryRun !== true ||
  Number(dryRunResult.data?.paidApiCalls ?? -1) !== 0 ||
  Number(dryRunResult.data?.productCount ?? -1) !== expectedCount ||
  !Number.isSafeInteger(estimated) ||
  estimated < 0 ||
  estimated > approvedMaxCalls ||
  !/^[a-f0-9]{64}$/i.test(fingerprint)
) {
  throw new Error(
    dryRunResult.data?.message ||
      `PAID CALL BLOCKED: score preflight mismatch (count=${dryRunResult.data?.productCount}, calls=${estimated}).`,
  );
}

console.log(
  `SCORE_PREFLIGHT=PASS | pool=${expectedCount} | cacheHit=${dryRunResult.data.cacheHit === true ? "YES" : "NO"} | OpenAI max=${estimated}`,
);

if (estimated === 0 && dryRunResult.data.cacheHit === true) {
  console.log("SCORE_EXECUTION_SKIPPED=cache already ready");
} else {
  console.log(
    `APPROVED_PAID_EXECUTION_START | OpenAI max=${estimated}`,
  );

  const executeResult = await jsonFetch(
    "/api/generate-product-scores",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        productIds: poolIds,
        inputFingerprint: fingerprint,
      }),
    },
  );

  if (
    !executeResult.response.ok ||
    executeResult.data?.success !== true ||
    Number(executeResult.data?.productCount ?? -1) !== expectedCount
  ) {
    throw new Error(
      executeResult.data?.message ||
        "Approved product-score execution failed.",
    );
  }

  console.log(
    `SCORE_EXECUTION=PASS | productCount=${executeResult.data.productCount}`,
  );
}

const verifyResult = await jsonFetch(
  "/api/generate-product-scores",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category,
      productIds: poolIds,
      dryRun: true,
    }),
  },
);

if (
  !verifyResult.response.ok ||
  verifyResult.data?.success !== true ||
  verifyResult.data?.dryRun !== true ||
  verifyResult.data?.cacheHit !== true ||
  Number(verifyResult.data?.estimatedOpenAiCalls ?? -1) !== 0 ||
  Number(verifyResult.data?.paidApiCalls ?? -1) !== 0 ||
  Number(verifyResult.data?.productCount ?? -1) !== expectedCount
) {
  throw new Error(
    verifyResult.data?.message ||
      "Post-score cache verification failed.",
  );
}

const publishedVerify = await jsonFetch(
  "/api/selected-five-manifest?category=" + encodeURIComponent(category),
  { cache: "no-store" },
);

const publishedProducts =
  publishedVerify.data?.manifest?.products;

const publishedIds =
  Array.isArray(publishedProducts)
    ? publishedProducts.map(
        (product) =>
          cleanText(
            product?.dbProductId,
          ),
      )
    : [];

if (
  !publishedVerify.response.ok ||
  publishedVerify.data?.success !== true ||
  publishedIds.length !== expectedCount ||
  publishedIds.some(
    (id, index) =>
      id.toLowerCase() !==
      poolIds[index]?.toLowerCase(),
  )
) {
  throw new Error("Published Recommendation Pool verification failed.");
}



console.log("");
console.log("===== RECOMMENDATION POOL SCORE READY =====");
console.log(`CATEGORY=${category}`);
console.log(`POOL=${expectedCount}`);
console.log("SCORE_CACHE=HIT");
console.log("NEXT_OPENAI_CALLS=0");
