import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
let checks = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks += 1;
};

const ids = Array.from(
  { length: 5 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);

const manifest = {
  runId: "00000000-0000-4000-8000-000000000099",
  category: "fixture",
  products: ids.map((id) => ({ dbProductId: id })),
};

let fetchImpl = async () => {
  throw new Error("fetchImpl not configured");
};

const source = read("lib/project-d-public-readiness.ts");
const sandbox = {
  exports: {},
  console,
  Response,
  Request,
  URL,
  URLSearchParams,
  Set,
  fetch: (...args) => fetchImpl(...args),
  require(id) {
    if (id === "./project-d-selected-five-manifest") {
      return {
        fetchPublishedSelectedFive: async () => ({
          manifest,
          profile: {},
        }),
        selectedFiveIds: () => [...ids],
      };
    }
    throw new Error(`Unexpected import: ${id}`);
  },
};

vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  sandbox,
  { filename: "lib/project-d-public-readiness.ts" },
);

const api = sandbox.exports;

let lastBody = null;
fetchImpl = async (url, init) => {
  check(url, "/api/generate-product-scores", "ready path");
  lastBody = JSON.parse(String(init?.body ?? "{}"));
  return new Response(
    JSON.stringify({
      success: true,
      dryRun: true,
      cacheHit: true,
      inputFingerprint: "a".repeat(64),
      estimatedOpenAiCalls: 0,
      paidApiCalls: 0,
      message: "ready",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const ready = await api.checkPublicCategoryReadiness("fixture");
check(ready.ready, true, "ready category");
check(ready.cacheHit, true, "ready cache");
check(ready.estimatedOpenAiCalls, 0, "ready call count");
check(lastBody.category, "fixture", "ready category body");
check(lastBody.dryRun, true, "dry-run enforced");
check(lastBody.productIds.length, 5, "exact five body");

fetchImpl = async () =>
  new Response(
    JSON.stringify({
      success: true,
      dryRun: true,
      cacheHit: false,
      inputFingerprint: "b".repeat(64),
      estimatedOpenAiCalls: 1,
      paidApiCalls: 0,
      message: "stale",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const stale = await api.checkPublicCategoryReadiness("fixture");
check(stale.ready, false, "stale blocked");
check(stale.cacheHit, false, "stale cache miss");
check(stale.estimatedOpenAiCalls, 1, "stale planned call");

fetchImpl = async () =>
  new Response(
    JSON.stringify({
      success: true,
      dryRun: true,
      cacheHit: true,
      inputFingerprint: "c".repeat(64),
      estimatedOpenAiCalls: 0,
      paidApiCalls: 1,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const paid = await api.checkPublicCategoryReadiness("fixture");
check(paid.ready, false, "paid preflight rejected");

fetchImpl = async () =>
  new Response(
    JSON.stringify({
      success: false,
      dryRun: true,
      cacheHit: false,
      estimatedOpenAiCalls: 0,
      paidApiCalls: 0,
    }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );

const broken = await api.checkPublicCategoryReadiness("fixture");
check(broken.ready, false, "broken preflight blocked");

fetchImpl = async () =>
  new Response(
    JSON.stringify({
      success: true,
      dryRun: true,
      cacheHit: false,
      inputFingerprint: "d".repeat(64),
      estimatedOpenAiCalls: 1,
      paidApiCalls: 0,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

await assert.rejects(
  () => api.assertPublicCategoryReadiness("fixture", ids),
  /추천 데이터를 점검 중/,
);
checks += 1;

const page = read("app/page.tsx");
const advisor = read("app/advisor/AdvisorClient.tsx");
const results = read("app/advisor/results/ResultsClient.tsx");
const selectedFiveRoute = read("app/api/selected-five-manifest/route.ts");

check(
  page.includes("checkPublicCategoryReadiness"),
  true,
  "home readiness guard present",
);
check(
  page.includes('readiness === null'),
  true,
  "home pending state present",
);
check(
  page.includes('fetch("/api/selected-five-manifest"'),
  true,
  "home discovers published categories",
);
check(
  page.includes("buildHomeCategories"),
  true,
  "home merges planned and discovered categories",
);
check(
  page.includes('["무선청소기", "데이터 준비 중", false]'),
  false,
  "wireless vacuum is not hardcoded inactive",
);
check(
  page.includes("firstReadyCategory"),
  true,
  "primary CTA uses a dynamically ready category",
);
check(
  selectedFiveRoute.includes('"project_d_selected_five_publications"') &&
    selectedFiveRoute.includes('"category"') &&
    selectedFiveRoute.includes("categories,"),
  true,
  "selected-five GET exposes published category names",
);
check(
  advisor.includes("assertPublicCategoryReadiness"),
  true,
  "advisor readiness guard present",
);
check(
  results.includes("결과 화면에서는 유료 호출을 자동 실행하지 않습니다"),
  false,
  "internal paid wording removed",
);

console.log(
  `Public readiness regression PASS: ${checks} assertions; paid calls 0; DB writes 0.`,
);
