import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import { AsyncLocalStorage } from 'node:async_hooks';
// Next normally installs this global during server bootstrap.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { NextRequest, NextResponse } = await import('next/server.js');
const { default: nextTesting } = await import('next/experimental/testing/server.js');
// Next 16.2.12 still exports this matcher test utility under its legacy name.
const { unstable_doesMiddlewareMatch: unstable_doesProxyMatch } = nextTesting;

// Entire current API inventory. Unknown/new routes are denied by default.
const publicSafe = ['category-profile', 'selected-five-manifest', 'catalog-products',
  'advisor-recommendations', 'generate-product-scores', 'analyze-personal-preferences'];
const debugTest = ['brightdata-test', 'debug-capture-list', 'debug-current-five-reviews',
  'debug-jonr-seller-url', 'debug-jonr-serp-raw', 'debug-lg-google-serp-raw',
  'debug-lg-individual-sellers', 'debug-lg-samjung', 'debug-lg-seller-serp-raw',
  'debug-lg-serp-raw', 'debug-q11-resolver', 'debug-q11-review-source',
  'debug-review-identifiers', 'debug-review-source-search', 'debug-robot-products',
  'debug-robot-shopping-structure', 'robot-ranking-test', 'test-source',
  'review-criteria-diagnostic', 'review-eligibility-diagnostic'];
const adminOnly = ['analyze-product-detail', 'analyze-reviews', 'auto-register-product',
  'detail-bookmarklet', 'extract-product', 'fetch-reviews', 'generate-category-criteria',
  'import-market-candidates', 'market-candidates-enriched', 'market-candidates',
  'naver-capture', 'naver-product-detail', 'project-d-pool-cleanup', 'recommend',
  'resolve-naver-product-url', 'review-bookmarklet', 'review-storage-status',
  'save-review-analysis-batch', 'save-review-analysis-only', 'save-review-raw-batch',
  'search-products', 'update-product-source'];
let count = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); count++; }
const read = path => fs.readFileSync(path, 'utf8');
check(fs.readdirSync('app/api').filter(p => fs.existsSync(`app/api/${p}/route.ts`)).sort(),
  [...publicSafe, ...debugTest, ...adminOnly].sort());

function compile(path, environment, imports = {}) {
  const sandbox = { exports: {}, process: { env: { NODE_ENV: environment } }, console,
    URL, URLSearchParams, Request, Response,
    require(id) {
      if (id === 'next/server') return { NextResponse };
      if (id === 'node:crypto') return crypto;
      if (Object.hasOwn(imports, id)) return imports[id];
      throw new Error(`Unmocked import blocked: ${id}`);
    },
    fetch() { throw new Error('Network forbidden'); },
  };
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, sandbox, { filename: path });
  return sandbox.exports;
}
for (const environment of ['production', 'development']) {
  const { proxy, config } = compile('proxy.ts', environment);
  for (const path of ['/admin', '/admin/review', '/admin/naver-capture',
    ...[...debugTest, ...adminOnly, 'future-unlisted-route'].map(p => `/api/${p}`)]) {
    check(unstable_doesProxyMatch({ config, nextConfig: {}, url: path }), true);
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = proxy(new NextRequest(`http://fixture.invalid${path}`, { method }));
      check(response.status, environment === 'production' ? (path.startsWith('/admin') ? 404 : 403) : 200);
    }
  }
  for (const path of publicSafe) {
    const allowed = ['category-profile', 'selected-five-manifest', 'catalog-products'].includes(path) ? 'GET' : 'POST';
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      check(proxy(new NextRequest(`http://fixture.invalid/api/${path}`, { method })).status,
        environment === 'production' && method !== allowed ? 403 : 200);
    }
  }
  for (const path of ['/', '/advisor', '/advisor/questions', '/advisor/results', '/_next/static/app.js']) {
    check(unstable_doesProxyMatch({ config, nextConfig: {}, url: path }), false);
  }
}

// Execute actual mixed handlers with in-memory SELECT fixtures only.
// Never import Supabase clients or construct a provider client.
let reads = 0;
let forbiddenCalls = 0;
function forbidden() { forbiddenCalls++; throw new Error('Paid/write operation forbidden'); }
const criteria = Array.from({ length: 5 }, (_, i) => ({ key: `c${i + 1}`, label: `Criterion ${i + 1}` }));
const profile = { category: 'fixture', criteria, common_cautions: [], score_generation_fingerprint: null };
const products = Array.from({ length: 5 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  product_name: `Fixture ${i + 1}`, category: 'fixture', source_url: 'https://fixture.invalid/product',
  review_analysis: { reviewCount: 100, summary: 'fixture' },
  product_detail_analysis: { price: 100000 * (i + 1) },
  criterion_scores: Object.fromEntries(criteria.map(c => [c.key, 80])),
}));
const db = {
  from(table) {
    reads++;
    assert.ok(['products', 'category_profiles'].includes(table));
    const result = { data: table === 'products' ? products : profile, error: null };
    const query = { select() { return query; }, eq() { return query; }, not() { return query; }, in() { return query; },
      order() { return query; }, maybeSingle() { return query; },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      insert: forbidden, update: forbidden, upsert: forbidden, delete: forbidden };
    return query;
  }, rpc: forbidden,
};
const imports = {
  openai: { default: class { constructor() { forbidden(); } } },
  '../../../lib/supabaseAdmin': { supabaseAdmin: db },
  '../../../lib/supabase': { supabase: db },
  '../../../lib/project-d-selected-five-manifest': { UUID_PATTERN: /^[a-f0-9-]{36}$/ },
};
async function post(handler, body) {
  return handler(new Request('http://fixture.invalid', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}
const scores = compile('app/api/generate-product-scores/route.ts', 'production', imports).POST;
const personal = compile('app/api/analyze-personal-preferences/route.ts', 'production', imports).POST;
for (const body of [{}, { dryRun: false }, { dryRun: 'true' },
  { persistenceOnly: true }, { dryRun: true, persistenceOnly: true }]) {
  const before = reads;
  check((await post(scores, body)).status, 403);
  check(reads, before);
}
for (const body of [{}, { dryRun: false, customPreference: 'quiet' }, { dryRun: 'true' },
  { mode: 'execute', inputFingerprint: 'a'.repeat(64) }]) {
  const before = reads;
  check((await post(personal, body)).status, 400);
  check(reads, before);
}
const input = { category: 'fixture', productIds: products.map(p => p.id), dryRun: true };
const miss = await (await post(scores, input)).json();
check(miss.success, true); check(miss.cacheHit, false); check(miss.paidApiCalls, 0);
check(miss.estimatedOpenAiCalls, 1); check(miss.dbWrites, 0);
profile.score_generation_fingerprint = miss.inputFingerprint;
const hit = await (await post(scores, input)).json();
check(hit.success, true); check(hit.cacheHit, true); check(hit.estimatedOpenAiCalls, 0);
check(hit.paidApiCalls, 0); check(hit.dbWrites, 0);
const budget = await (await post(personal, { ...input, dryRun: false, mode: 'budget_options' })).json();
check(budget.success, true); check(budget.budgetOptions.length, 4); check(budget.paidApiCalls, 0);
for (const customPreference of ['', 'quiet']) {
  const result = await (await post(personal, { ...input, customPreference })).json();
  check(result.success, true); check(result.paidApiCalls, 0);
  check(result.estimatedOpenAiCalls, customPreference ? 1 : 0);
}
const customPrecheck = await (await post(personal, { ...input, customPreference: 'quiet' })).json();
const beforeUnconfirmed = reads;
const unconfirmed = await post(personal, {
  category: 'fixture',
  productIds: products.map(p => p.id),
  customPreference: 'quiet',
  inputFingerprint: customPrecheck.inputFingerprint,
});
check(unconfirmed.status, 400);
check(reads, beforeUnconfirmed);
const unconfirmedBody = await unconfirmed.json();
check(unconfirmedBody.paidApiCalls, 0);
check(unconfirmedBody.dbWrites, 0);
const recommend = compile('app/api/advisor-recommendations/route.ts', 'production', imports).POST;
const recommendationResponse = await post(recommend, { ...input, budgetChoice: 'no_limit',
  weights: Object.fromEntries(criteria.map(c => [c.key, 5])) });
check(recommendationResponse.status, 200);
const recommendation = await recommendationResponse.json();
check(recommendation.success, true);
check(recommendation.recommendations.length, 5);
for (const path of ['generate-product-scores', 'analyze-personal-preferences']) {
  const handler = compile(`app/api/${path}/route.ts`, 'development', imports).POST;
  check((await post(handler, {})).status, 400); // Existing validation, not production 403.
}
check(forbiddenCalls, 0);

// Public customer feature gates: additional free-text conditions are visible in
// production, while execution remains explicit and fingerprint-bound.
const questionsSource = read('app/advisor/questions/QuestionsClient.tsx');
const resultsSource = read('app/advisor/results/ResultsClient.tsx');
const personalSource = read('app/api/analyze-personal-preferences/route.ts');
check(questionsSource.includes('customPreference: normalizedCustomPreference,'), true);
check(questionsSource.includes('{process.env.NODE_ENV !== "production" && <section'), false);
check(resultsSource.includes('process.env.NODE_ENV === "production" ? "" : (stored.customPreference ?? "")'), false);
check(resultsSource.includes('if (cachedRaw) {'), true);
check(resultsSource.includes('confirmCustomPreferenceAnalysis: true'), true);
check(resultsSource.includes('mode: "custom_preference_execute"'), true);
check(personalSource.includes('body.confirmCustomPreferenceAnalysis !== true'), true);
check(personalSource.includes('mode !== "custom_preference_execute"'), true);
check(personalSource.includes('public production never generates AI output'), false);
console.log(`Production boundary regression PASS: ${count} assertions; external/paid calls 0; DB writes 0.`);
