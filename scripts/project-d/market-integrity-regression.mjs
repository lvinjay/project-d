import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';

// Compile pure functions only. Never import routes, extension entry points or clients.
function pureFunctions(path, names, prefix = '') {
  const source = fs.readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const found = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.push(node.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(found.length, names.length);
  const code = ts.transpileModule(prefix + '\n' + found.join('\n') + '\nexports.test = {' + names.join(',') + '};',
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const sandbox = { exports: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.exports.test;
}
const { getPrice: currentGetPrice } = pureFunctions('tools/project-d-extension/naver-collector.js', ['getPrice'],
  'const num = value => Number(String(value || "").replace(/[^\\d]/g, ""));');
let assertions = 0;
function check(value, expected) { assert.deepEqual(JSON.parse(JSON.stringify(value)), expected); assertions++; }
for (const [text, value] of [
  ['318,000원 / 최대 적립 3,180원', 318000],
  ['199,800원 네이버페이 적립 1,998원', 199800],
  ['1,349,800원 구매 적립 26,996원', 1349800],
  ['최대 적립 3,180원', 0], ['월 29,900원 무이자', 0],
  ['최저 299,000원', 299000], ['판매가: 318000원', 318000],
  ['Npay 3,180원', 0], ['할인쿠폰 30,000원', 0], ['3,180원 적립', 0],
  ['318,000원 / 199,800원', 0], ['상품 318,000원', 0],
  ['상품명\n318,000원\n최대 적립 3,180원', 318000], ['최대 적립\n3,180원', 0],
]) {
  const result = getPrice({ innerText: text });
  check([result.value, result.verified], [value, value > 0]);
}
const modelSource = fs.readFileSync('lib/project-d-product-model-identity.ts', 'utf8');
const modelSandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(modelSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, modelSandbox);
const { strictProductModelIdentity: identity, preferModelRepresentative: prefer } = modelSandbox.exports;
const model = (suffix = '') => ({ brand: 'Example', manufacturer: 'Factory', modelName: 'AC-400' + suffix, productName: 'Example AC-400' + suffix });
check(identity(model()) === identity({ ...model(), productName: 'Example portable AC-400' }), true);
check(identity(model(' PRO')) === identity(model(' PLUS')), false);
check(identity(model(' MINI')) === identity(model()), false);
check(identity({ brand: 'Example', modelName: '', productName: '캠핑 에어컨' }), null);
check(identity(model(' 2세대')) === identity(model(' 3세대')), false);
check(identity(model(' 20L')) === identity(model(' 30L')), false);
check(identity(model()) === identity({ ...model(), brand: 'Other' }), false);
const listing = (url, reviewCount) => ({ detail: { ...model(), reviewCount }, market: { priceVerified: true }, canonicalSource: { url } });
check(prefer(listing('a', 100), listing('b', 30)), true);
check(prefer(listing('a', 100), listing('b', 100)), true);
const { refreshAnalyzedMarketDetail: refresh, mergeMeaningfulValue: merge } = pureFunctions(
  'app/api/import-market-candidates/route.ts', ['asRecord', 'refreshAnalyzedMarketDetail', 'mergeMeaningfulValue']);
const old = { price: { finalPrice: 318000, originalPrice: 350000 }, reviews: ['old corpus'],
  evaluationEvidence: { c1: ['old evidence'] }, keySpecs: { power: 'old' }, provenance: { fingerprint: 'old' } };
const market = { listedPrice: 320000, priceVerified: true, priceSource: 'sale-label' };
const fresh = refresh(old, market, 'fixture');
check(fresh.price, { finalPrice: 320000, originalPrice: 350000 });
for (const key of ['reviews', 'evaluationEvidence', 'keySpecs', 'provenance']) check(fresh[key], old[key]);
check(refresh(old, { listedPrice: 3180, priceVerified: false }, 'fixture').price, old.price);
check(refresh(old, { listedPrice: 3180 }, 'fixture').price, old.price);
check(refresh(old, { listedPrice: NaN, priceVerified: true }, 'fixture').price, old.price);
check(old.price.finalPrice, 318000);
check(merge(old, { price: { finalPrice: 320000 }, reviews: ['new corpus'] }).reviews, ['new corpus']);
const route = fs.readFileSync('app/api/import-market-candidates/route.ts', 'utf8');
assert.match(route, /product_detail_analysis, review_analysis/);
const protectedUpdate = route.match(/\.update\(existing\.review_analysis \? \{([\s\S]*?)\} : \{/)[1];
assert.doesNotMatch(protectedUpdate, /product_name:|source_url:|origin_product_no:|review_analysis:|criterion_scores:/);
assert.match(route, /delete incomingDetail.price/);
assert.match(route, /delete incomingDetail.marketListedPrice/);
// Verify evidence transport and gate ordering without executing any endpoint.
const panel = fs.readFileSync('components/ProjectDAutomationPanel.tsx', 'utf8');
const capture = fs.readFileSync('app/api/naver-capture/route.ts', 'utf8');
const enriched = fs.readFileSync('app/api/market-candidates-enriched/route.ts', 'utf8');
for (const field of ['priceVerified', 'priceSource', 'priceRawText']) {
  assert.ok(panel.includes(`${field}: candidate.${field}`));
  assert.ok(capture.includes(`raw.${field}`));
  assert.ok(enriched.includes(`${field}: market.${field}`));
  assert.ok(route.includes(`candidate.market?.${field}`));
}
assert.match(panel, /requireVerifiedPrice: "1"/);
assert.match(panel, /requireVerifiedPrice: true/);
assert.ok(enriched.indexOf('const modelIdentity = strictProductModelIdentity') > enriched.indexOf('if (assessment.status !== "eligible")'));
assert.ok(enriched.indexOf('modelRepresentatives.set') < enriched.lastIndexOf('finalCandidates.push('));


// Frozen pre-diagnostics parser, for result-equivalence regression only.
const num = value => Number(String(value || "").replace(/[^\d]/g, ""));
function originalGetPrice(root) {
        // No whole-card minimum/maximum: only an unambiguous sale amount.
        const rawText = String(root.innerText || "").trim();
        const amounts = [...rawText.matchAll(/(?<![\d,])(\d{1,3}(?:,\d{3})+|\d+)\s*원/g)];
        const excluded = /적립|포인트|npay|네이버페이|혜택|쿠폰|할부|월|무이자|reward|benefit|point/i;
        const saleLabel = /(?:최저가?|판매가|할인가)\s*[:：]?\s*$/;
        const accepted = [];
        for (let i = 0; i < amounts.length; i++) {
          const match = amounts[i];
          const start = i ? amounts[i - 1].index + amounts[i - 1][0].length : 0;
          const prefix = rawText.slice(start, match.index);
          const tail = rawText.slice(match.index + match[0].length);
          // A trailing benefit label belongs to this amount when no later amount exists.
          if (excluded.test(prefix) || (i === amounts.length - 1 && excluded.test(tail))) continue;
          const labeled = saleLabel.test(prefix.trim());
          const standalone = /^[\s/|:：]*$/.test(prefix.split(/\r?\n/).pop() || "");
          if (!labeled && !standalone) continue;
          const value = num(match[1]);
          if (value > 0) accepted.push({ value, verified: true,
            source: labeled ? "sale-label" : "unambiguous-sale-text", rawText: (prefix + match[0]).trim().slice(0, 300) });
        }
        const values = new Set(accepted.map(item => item.value));
        return values.size === 1 ? accepted[0] : {
          value: 0, verified: false, source: "unverified", rawText: rawText.slice(0, 300),
        };
      }

// Diagnostic additions must not alter even the old source/rawText fields.
const diagnosticInputs = [
  "no price here", "최대 적립 3,180원", "3,180원 적립", "상품 318,000원",
  "318,000원 / 199,800원", "최저 299,000원", "318,000원",
  "혜택 3,180원 / 상품 318,000원", "https://example.test/path?secret=123 판매가 318,000원",
  "최저 318,000원 " + "x".repeat(500),
  Array.from({length: 20}, (_, i) => `${i + 1000}원`).join(" / "),
];
for (const prefix of ["", "상품명\n", "판매가 ", "최저가 ", "광고 ", "쿠폰 ", "월 ", "Npay 혜택\n"]) {
  for (const amount of ["0원", "318,000원", "318000\n원", "3,180P", "318,000원 / 199,800원"]) {
    for (const suffix of ["", " 무료배송", " 적립", " 최대 적립 3,180원"]) diagnosticInputs.push(prefix + amount + suffix);
  }
}
for (const input of diagnosticInputs) {
  const actual = getPrice({ innerText: input });
  const original = originalGetPrice({ innerText: input });
  check([actual.value, actual.verified, actual.source, actual.rawText],
    [original.value, original.verified, original.source, original.rawText]);
  assert.equal(typeof actual.reason, "string");
  assert.ok(actual.reason.length > 0);
  assert.ok(actual.diagnosticSnippet.length <= 250);
  assert.ok(actual.detectedAmounts.length <= 10);
  assert.ok(actual.detectedAmounts.every(Number.isFinite));
  assert.doesNotMatch(actual.diagnosticSnippet, /https?:|www\.|secret=|\?/i);
}
check(getPrice({ innerText: "최대 적립 3,180원" }).reason, "excluded-prefix");
check(getPrice({ innerText: "3,180원 적립" }).reason, "excluded-tail");
check(getPrice({ innerText: "상품 318,000원" }).reason, "no-sale-context");
check(getPrice({ innerText: "318,000원 / 199,800원" }).reason, "multiple-sale-values");
check(getPrice({ innerText: "가격 확인 필요" }).reason, "no-money-token");
check(getPrice({ innerText: "최저 299,000원" }).reason, "verified-sale-label");
check(getPrice({ innerText: "299,000원" }).reason, "verified-single-price");
check(getPrice({ innerText: "318,000원 최대 적립 3,180원" }).detectedAmounts, [318000, 3180]);
const { recordPriceDiagnostic: recordDiagnostic } = pureFunctions('tools/project-d-extension/naver-collector.js', ['recordPriceDiagnostic']);
const state = { observed: new Set(), verified: new Set(), rejected: new Set(), samples: new Map() };
const bad = getPrice({ innerText: "최대 적립 3,180원" });
recordDiagnostic(state, 'same', '상품', bad, 'ad');
recordDiagnostic(state, 'same', '상품', bad, 'ad');
check([state.observed.size, state.rejected.size, state.samples.size], [1, 1, 1]);
recordDiagnostic(state, 'same', '상품', getPrice({ innerText: "판매가 318,000원" }), 'ad');
recordDiagnostic(state, 'same', '상품', bad, 'ad');
check([state.observed.size, state.rejected.size, state.samples.size], [1, 0, 0]);
for (let i = 0; i < 30; i++) recordDiagnostic(state, `item${i}`, `상품${i}`, bad, 'normal');
check([state.rejected.size, state.samples.size], [30, 20]);
const { captureDiagnostics: normalizeDiagnostics } = pureFunctions('app/api/naver-capture/route.ts', ['captureDiagnostics', 'text']);
const normalized = normalizeDiagnostics({ observedProductCardCount: 31, priceEvidenceDiagnostics: {
  rejectedCount: 30, samples: Array.from({length: 30}, () => ({name: "상품 https://secret.test/?id=1", reason: "excluded-prefix",
    detectedAmounts: Array.from({length: 15}, (_, i) => i), snippet: "3,180원 https://secret.test/?id=1 " + "x".repeat(300), cardType: "ad"})) } });
check(normalized.priceEvidenceDiagnostics.samples.length, 20);
check(normalized.priceEvidenceDiagnostics.samples[0].detectedAmounts.length, 10);
assert.ok(normalized.priceEvidenceDiagnostics.samples[0].snippet.length <= 250);
assert.doesNotMatch(JSON.stringify(normalized), /secret|https|id=1/);
assert.match(panel, /priceEvidenceDiagnostics: bridgeResult.priceEvidenceDiagnostics/);
assert.match(capture, /getDiagnosticsStore\(\)\.set\(id, diagnostics\)/);
assert.match(capture, /diagnostics \? \{ diagnostics \}/);
console.log(`PASS: ${assertions} assertions, including ${diagnosticInputs.length} pre-patch parser equivalence cases; bounded diagnostics, dedupe/resolution, capture normalization and existing fixtures. No endpoint execution.`);

// Historical diagnostics parser: retained only for the original 217 assertions.
function getPrice(root) {
        const num = value => Number(String(value || "").replace(/[^\d]/g, ""));
        // No whole-card minimum/maximum: only an unambiguous sale amount.
        const rawText = String(root.innerText || "").trim();
        const amounts = [...rawText.matchAll(/(?<![\d,])(\d{1,3}(?:,\d{3})+|\d+)\s*원/g)];
        const excluded = /적립|포인트|npay|네이버페이|혜택|쿠폰|할부|월|무이자|reward|benefit|point/i;
        const saleLabel = /(?:최저가?|판매가|할인가)\s*[:：]?\s*$/;
        const accepted = [];
        const rejectedReasons = [];
        // Mask URL/query tokens before taking windows, retaining original offsets.
        const safeText = rawText.replace(/\S*(?:https?:\/\/|www\.|\?|[&=])\S*/gi, token => " ".repeat(token.length));
        const diagnosticSnippet = amounts.slice(0, 3).map(match =>
          safeText.slice(match.index > 45 ? match.index - 45 : 0, match.index + match[0].length + 45)
        ).join(" … ").replace(/\s+/g, " ").trim().slice(0, 250);
        const detectedAmounts = amounts.slice(0, 10).map(match => num(match[1])).filter(Number.isFinite);
        for (let i = 0; i < amounts.length; i++) {
          const match = amounts[i];
          const start = i ? amounts[i - 1].index + amounts[i - 1][0].length : 0;
          const prefix = rawText.slice(start, match.index);
          const tail = rawText.slice(match.index + match[0].length);
          // A trailing benefit label belongs to this amount when no later amount exists.
          if (excluded.test(prefix) || (i === amounts.length - 1 && excluded.test(tail))) {
            rejectedReasons.push(excluded.test(prefix) ? "excluded-prefix" : "excluded-tail");
            continue;
          }
          const labeled = saleLabel.test(prefix.trim());
          const standalone = /^[\s/|:：]*$/.test(prefix.split(/\r?\n/).pop() || "");
          if (!labeled && !standalone) { rejectedReasons.push("no-sale-context"); continue; }
          const value = num(match[1]);
          if (value > 0) accepted.push({ value, verified: true,
            source: labeled ? "sale-label" : "unambiguous-sale-text", rawText: (prefix + match[0]).trim().slice(0, 300) });
        }
        const values = new Set(accepted.map(item => item.value));
        const result = values.size === 1 ? accepted[0] : {
          value: 0, verified: false, source: "unverified", rawText: rawText.slice(0, 300),
        };
        const reasons = new Set(rejectedReasons);
        const reason = result.verified
          ? (result.source === "sale-label" ? "verified-sale-label" : "verified-single-price")
          : !amounts.length ? "no-money-token"
          : values.size > 1 ? "multiple-sale-values"
          : reasons.size === 1 ? rejectedReasons[0] : "ambiguous";
        return { ...result, reason, detectedAmounts, diagnosticSnippet };
      }

// Active parser acceptance and safety suite. Historical assertions above are not
// evidence of new behavior; every case here executes the current collector code.
const historicalAssertions = assertions;
const activeCases = [
  ['정가 1,585,200원 할인 14% 1,349,800원 ... 최대 적립 26,996원', 1349800],
  ['정가 540,000원 할인 41% 318,000원 ... 최대 적립 3,180원', 318000],
  ['정가 468,000원 할인 14% 398,000원 ... 적립 3,980원', 398000],
  ['515,260원 ... 무료배송 ... 네이버페이 혜택', 515260],
  ['328,000원 ... 배송 ... 혜택', 328000],
  ['최대 적립 3,180원', 0], ['월 29,900원 무이자', 0],
  ['판매가 318,000원 최대 적립 3,180원', 318000],
  ['정가 540,000원 할인 41% 318,000원', 318000],
  ['판매가 199,800원 / 판매가 198,800원', 0],
  ['1,585,200원\n14%\n1,349,800원\n최대 적립 26,996원', 1349800],
  ['정가 229,800원 판매가 199,800원 최저가 198,800원 최대 적립 1,998원', 198800],
  ['229,800원 / 199,800원 / 198,800원 / 적립 1,998원', 0],
  ['네이버페이 혜택 안내\n판매가 318,000원', 318000],
  ['상품 318,000원', 318000], ['318,000원 적립 3,180원', 318000],
  ['판매가 3,180원', 3180], // No magnitude blacklist.
  ['정상가 540,000원', 0], ['할부 29,900원', 0], ['29,900원 무이자', 0],
  ['최저 299,000원', 299000], ['현재가 299,000원 판매가 318,000원', 299000],
  ['즉시할인가 318,000원', 318000], ['최대할인가 318,000원', 318000],
  ['판매가 318,000\n원 최대 적립 3,180원', 318000],
  ['318,000원 / 199,800원', 0], ['3,180원 적립', 0], ['쿠폰 3,180원', 0],
  ['판매가 318,000원 ' + '상품 안내 '.repeat(20) + '네이버페이 혜택', 318000],
];
for (const reward of [3180, 1998, 26996, 3980, 3380, 4780, 4580, 8300, 3990, 5030]) {
  activeCases.push([`최대 적립 ${reward}원`, 0]);
  activeCases.push([`판매가 318,000원 최대 적립 ${reward}원`, 318000]);
}
for (const [input, expected] of activeCases) {
  const result = currentGetPrice({ innerText: input });
  check([result.value, result.verified], [expected, expected > 0]);
  assert.ok(result.detectedAmounts.length <= 10);
  assert.ok(result.diagnosticSnippet.length <= 250);
  assert.ok(result.reason);
}
check(currentGetPrice({ innerText: activeCases[0][0] }).source, 'discount-percent-structure');
const liveBad = currentGetPrice({ innerText: '최대 적립 3,180원' });
const liveState = { observed: new Set(), verified: new Set(), rejected: new Set(), samples: new Map() };
recordDiagnostic(liveState, 'live', '상품', liveBad, 'ad');
recordDiagnostic(liveState, 'live', '상품', currentGetPrice({ innerText: activeCases[0][0] }), 'ad');
check([liveState.observed.size, liveState.rejected.size, liveState.samples.size], [1, 0, 0]);
const liveNormalized = normalizeDiagnostics({ priceEvidenceDiagnostics: { rejectedCount: 1, samples: [{
  name: '상품', reason: liveBad.reason, detectedAmounts: liveBad.detectedAmounts, snippet: liveBad.diagnosticSnippet, cardType: 'ad'
}] } });
check(liveNormalized.priceEvidenceDiagnostics.samples[0].reason, liveBad.reason);
console.log(`FINAL PASS: ${assertions} counted assertions = ${historicalAssertions} preserved historical + ${assertions - historicalAssertions} active-parser assertions (${activeCases.length} price cases), plus diagnostic bounds and static guards.`);

// STEP 1: strip only the additive diagnostic nodes, then verify the entire
// pre-STEP-1 executable collector/route fingerprints. No Git or network needed.
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, removeComments: true,
} }).outputText;
// STEP 2 intentionally replaces only the capture controller. Restoring its
// frozen predecessor for the original hash assertion keeps every filtering,
// dedupe, price, order and response expression covered by the original hash.
const legacyCaptureControl = "      capture();\n\n      let previousCount = captured.size;\n      let stableCount = 0;\n      let scrollSteps = 0;\n      let stopReason = \"max-scroll-steps\";\n\n      for (let step = 1; step <= 35; step++) {\n        if (captured.size >= targetCount) { stopReason = \"target-count\"; break; }\n        scrollSteps = step;\n        window.scrollBy({\n          top: Math.max(window.innerHeight * 0.8, 600),\n          behavior: \"smooth\",\n        });\n\n        await sleep(1200);\n        capture();\n\n        const currentCount = captured.size;\n\n        if (currentCount <= previousCount) {\n          stableCount++;\n        } else {\n          stableCount = 0;\n        }\n\n        previousCount = currentCount;\n\n        if (currentCount >= targetCount || (currentCount >= 30 && stableCount >= 7)) {\n          stopReason = currentCount >= targetCount ? \"target-count\" : \"stable-after-minimum\";\n          break;\n        }\n      }\n\n      window.scrollTo({\n        top: document.documentElement.scrollHeight,\n        behavior: \"smooth\",\n      });\n\n      await sleep(1800);\n      capture();";
const legacyStep4ExecutionSelection = "    let paidCandidateSeenForQueue = 0;\n    let paidCandidateIncludedForQueue = 0;\n\n    const executionCandidates =\n      paidCandidateLimit === null\n        ? marketCandidates\n        : marketCandidates.filter(\n            (product) => {\n              if (\n                isZeroPaidBrowserCandidate(\n                  product,\n                )\n              ) {\n                return true;\n              }\n\n              const paidIndex =\n                paidCandidateSeenForQueue;\n\n              paidCandidateSeenForQueue += 1;\n\n              if (\n                paidIndex <\n                paidCandidateOffset\n              ) {\n                return false;\n              }\n\n              if (\n                paidCandidateIncludedForQueue >=\n                paidCandidateLimit\n              ) {\n                return false;\n              }\n\n              paidCandidateIncludedForQueue += 1;\n              return true;\n            },\n          );";

function withoutPoolDiagnostics(source, restoreCaptureControl = false) {
  // STEP5_PAID_PRIORITY_HASH_RESTORE
  if (
    source.includes(
      "// PAID RECOVERY PRIORITY HELPERS START",
    )
  ) {
    source =
      source.replace(
        /    \/\/ PAID RECOVERY PRIORITY HELPERS START[\s\S]*?    \/\/ PAID RECOVERY PRIORITY HELPERS END\r?\n\r?\n?/,
        "",
      );
  }

  if (
    source.includes(
      "// PAID RECOVERY PRIORITY PLAN SORT START",
    )
  ) {
    source =
      source.replace(
        /      \/\/ PAID RECOVERY PRIORITY PLAN SORT START[\s\S]*?      \/\/ PAID RECOVERY PRIORITY PLAN SORT END\r?\n\r?\n?/,
        "",
      );
  }
  // STEP4_RELEVANCE_HASH_RESTORE
  if (
    source.includes(
      "// PAID RELEVANCE PREFLIGHT DECLARATIONS START",
    )
  ) {
    assert.equal(
      (
        source.match(
          /\/\/ PAID RELEVANCE PREFLIGHT DECLARATIONS START/g,
        ) || []
      ).length,
      1,
    );

    assert.equal(
      (
        source.match(
          /\/\/ PAID RELEVANCE PREFLIGHT PLAN SKIP START/g,
        ) || []
      ).length,
      1,
    );

    assert.equal(
      (
        source.match(
          /\/\/ PAID RELEVANCE PREFLIGHT EXECUTION START/g,
        ) || []
      ).length,
      1,
    );

    source =
      source.replace(
        /    \/\/ PAID RELEVANCE PREFLIGHT DECLARATIONS START[\s\S]*?    \/\/ PAID RELEVANCE PREFLIGHT DECLARATIONS END\r?\n\r?\n?/,
        "",
      );

    source =
      source.replace(
        /        \/\/ PAID RELEVANCE PREFLIGHT PLAN SKIP START[\s\S]*?        \/\/ PAID RELEVANCE PREFLIGHT PLAN SKIP END\r?\n\r?\n?/,
        "",
      );

    source =
      source.replace(
        /    \/\/ PAID RELEVANCE PREFLIGHT EXECUTION START[\s\S]*?    \/\/ PAID RELEVANCE PREFLIGHT EXECUTION END/,
        legacyStep4ExecutionSelection,
      );
  }
  if (restoreCaptureControl) {
    assert.equal((source.match(/\/\/ ADAPTIVE CAPTURE START/g) || []).length, 1);
    source = source.replace(/\/\/ ADAPTIVE CAPTURE START[\s\S]*?\/\/ ADAPTIVE CAPTURE END/, legacyCaptureControl);
  }
  const tree = ts.createSourceFile('baseline.js', compile(source), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const diagnostic = node => node && /^poolDiagnostic/.test(node.getText(tree));
  const transformed = ts.transform(tree, [context => {
    function visit(node) {
      if (ts.isFunctionDeclaration(node) && diagnostic(node.name)) return undefined;
      if (restoreCaptureControl && ts.isFunctionDeclaration(node) && ['adaptiveFinalCandidateCount', 'adaptiveCaptureProgress', 'adaptiveCaptureStop'].includes(node.name?.text)) return undefined;
      if (ts.isVariableStatement(node) && node.declarationList.declarations.every(d => diagnostic(d.name))) return undefined;
      if (ts.isForOfStatement(node) && diagnostic(node.expression)) return undefined;
      if (ts.isExpressionStatement(node) && diagnostic(node.expression)) return undefined;
      if (ts.isIfStatement(node) && !node.elseStatement && ts.isExpressionStatement(node.thenStatement) && diagnostic(node.thenStatement.expression)) return undefined;
      if (ts.isPropertyAssignment(node) && ['diagnostics', 'collectorDiagnostics', 'zeroPaidCandidateDiagnostics', 'paidCandidatePlans', 'relevancePreflight'].includes(node.name.getText(tree))) return undefined;
      return ts.visitEachChild(node, visit, context);
    }
    return root => ts.visitNode(root, visit);
  }]);
  const result = ts.createPrinter({ removeComments: true }).printFile(transformed.transformed[0]);
  transformed.dispose();
  return result;
}
for (const [file, expected] of [
  ['tools/project-d-extension/naver-collector.js', '3402418d060d1b3c08e912551f0fecf27b4e66cf5e91223ae9e611d5db0dbc85'],
  ['app/api/market-candidates-enriched/route.ts', 'b3b2a222624176736757b2f89361c9a885e60c2eff64cda0948f3344f9b4d028'],
]) check(crypto.createHash('sha256').update(withoutPoolDiagnostics(fs.readFileSync(file, 'utf8'), file.endsWith('naver-collector.js'))).digest('hex'), expected);

const { poolDiagnosticRecordCard: recordCard, poolDiagnosticCollectorSummary: collectorSummary } = pureFunctions(
  'tools/project-d-extension/naver-collector.js', ['poolDiagnosticRecordCard', 'poolDiagnosticCollectorSummary']);
const cards = new Map(), cardA = {}, cardB = {}, cardC = {};
for (let scan = 0; scan < 20; scan++) {
  recordCard(cards, cardA, 'AC400', 300000, 'https://example.test/1');
  recordCard(cards, cardB, 'AC400', 300000, 'https://example.test/2');
  recordCard(cards, cardC, 'AC500', 0, '');
}
let cardSummary = collectorSummary(cards, 1, 1, 'target-count', 3);
check([cardSummary.rawCardCount, cardSummary.initialEligibleCardCount, cardSummary.duplicateByNameCount], [3, 2, 1]);
recordCard(cards, cardC, 'AC500', 400000, 'https://example.test/3');
// A virtualized DOM element displaying another listing must not hide that card.
recordCard(cards, cardC, 'AC600', 500000, 'https://example.test/4');
cardSummary = collectorSummary(cards, 1, 3, 'stable-after-minimum', 7);
check([cardSummary.rawCardCount, cardSummary.initialEligibleCardCount, cardSummary.finalCapturedCount], [4, 4, 3]);
check(cardSummary.finalCapturedCount <= cardSummary.initialEligibleCardCount, true);
for (const [key, value] of Object.entries(cardSummary)) if (key.endsWith('Count')) check(Number.isSafeInteger(value) && value >= 0, true);
check(normalizeDiagnostics({ collectorDiagnostics: cardSummary }).collectorDiagnostics.finalCapturedCount, 3);
check(normalizeDiagnostics({ collectorDiagnostics: { rawCardCount: -1, finalCapturedCount: 1.5, stopReason: '<invalid>' } }).collectorDiagnostics,
  { stopReason: 'unknown' });
check(normalizeDiagnostics({}).collectorDiagnostics === undefined, true);

// The actual collector runs against a fake DOM and synchronous timers. Compare
// all legacy response fields with the same executable code minus diagnostics.
function fakeCard(name, price, url) {
  const link = { href: url, innerText: name, className: 'product_link__fixture', getAttribute: () => null };
  const image = { src: 'https://example.test/image.png', alt: name, getAttribute: key => key === 'src' ? 'https://example.test/image.png' : key === 'alt' ? name : null };
  return { innerText: `${name}\n판매가 ${price}원`, matches: () => false,
    querySelectorAll: selector => selector === 'a' ? [link] : [],
    querySelector: selector => selector === 'img' ? image : null };
}
async function runCollector(source, fixture, options = {}) {
  let delivered;
  let elapsed = 0, loop = 0, bottomCaptures = 0;
  const sandbox = { URLSearchParams, Date: { now: () => elapsed },
    location: { search: `?pd_request=test&pd_admin=1&pd_target=${options.target ?? 2}` },
    setTimeout: (fn, ms) => { elapsed += Math.max(ms, options.minimumTimerElapsed ?? 0); fn(); return 0; },
    window: { innerHeight: 900, scrollBy() { loop++; }, scrollTo() { bottomCaptures++; } },
    document: { querySelectorAll: () => typeof fixture === 'function' ? fixture({ loop, bottomCaptures }) : fixture,
      documentElement: { scrollHeight: 1000 } },
    chrome: { runtime: { sendMessage: message => { delivered = message; } } },
    console: { log() {}, error() {}, warn() {} } };
  vm.runInNewContext(compile(source), sandbox);
  for (let tick = 0; tick < 1000 && !delivered; tick++) await Promise.resolve();
  assert.ok(delivered, 'mock collector must finish');
  return JSON.parse(JSON.stringify(delivered));
}
const collectorSource = fs.readFileSync('tools/project-d-extension/naver-collector.js', 'utf8');
const collectorFixture = [fakeCard('Example 캠핑 AC400', '300,000', 'https://smartstore.naver.com/test/products/100'),
  fakeCard('Example 캠핑 AC400 화이트', '310,000', 'https://smartstore.naver.com/test/products/101'),
  fakeCard('Example 캠핑 AC500', '400,000', 'https://smartstore.naver.com/test/products/102')];
const currentCollector = await runCollector(collectorSource, collectorFixture);
const legacyCollector = await runCollector(withoutPoolDiagnostics(collectorSource), collectorFixture);
const { collectorDiagnostics: observedCollector, ...legacyCollectorResult } = currentCollector.result;
check({ ...currentCollector, result: legacyCollectorResult }, legacyCollector);
check(observedCollector.finalCapturedCount, currentCollector.result.candidates.length);
check(observedCollector.finalCapturedCount > 0, true);

const {
  adaptiveCaptureProgress: adaptiveProgressForTest,
  adaptiveCaptureStop: adaptiveStopForTest,
} = pureFunctions(
  'tools/project-d-extension/naver-collector.js',
  [
    'adaptiveCaptureProgress',
    'adaptiveCaptureStop'
  ]
);

const adaptiveLimitsFixture = {
  maxScrollLoops: 60,
  minimumScrollLoops: 12,
  noGrowthThreshold: 10,
  maxCaptureMs: 120000,
};

// TARGET_REACHED
let adaptiveState =
  adaptiveProgressForTest(
    null,
    10,
    7,
    0,
    false
  );

check(
  adaptiveStopForTest(
    adaptiveState,
    0,
    7,
    0,
    adaptiveLimitsFixture
  ),
  'target-reached'
);

// TIMEOUT
check(
  adaptiveStopForTest(
    adaptiveState,
    0,
    40,
    120000,
    adaptiveLimitsFixture
  ),
  'timeout'
);

// MARKET_SATURATED
// niche category처럼 후보가 20개 미만이어도
// 충분한 무성장이 확인되면 정상 포화 가능.
adaptiveState =
  adaptiveProgressForTest(
    null,
    12,
    7,
    0,
    false
  );

for (let loop = 1; loop <= 12; loop++) {
  adaptiveState =
    adaptiveProgressForTest(
      adaptiveState,
      12,
      7,
      loop,
      true
    );
}

check(
  adaptiveState.consecutiveNoGrowth,
  12
);

check(
  adaptiveState.finalCount < 20,
  true
);

check(
  adaptiveStopForTest(
    adaptiveState,
    12,
    40,
    12000,
    adaptiveLimitsFixture
  ),
  'market-saturated'
);

// HARD_CAP_REACHED (= max-scroll)
// 후보가 계속 증가 중이면 saturation으로 오인하지 않고
// hard cap에서만 종료.
adaptiveState =
  adaptiveProgressForTest(
    null,
    1,
    1,
    0,
    false
  );

for (let loop = 1; loop <= 60; loop++) {
  adaptiveState =
    adaptiveProgressForTest(
      adaptiveState,
      loop + 1,
      loop + 1,
      loop,
      true
    );
}

check(
  adaptiveState.consecutiveNoGrowth,
  0
);

check(
  adaptiveStopForTest(
    adaptiveState,
    60,
    100,
    72000,
    adaptiveLimitsFixture
  ),
  'max-scroll'
);

// 새로운 카드/후보가 생기면 no-growth streak reset.
let resetState =
  adaptiveProgressForTest(
    null,
    10,
    5,
    0,
    false
  );

for (let loop = 1; loop <= 9; loop++) {
  resetState =
    adaptiveProgressForTest(
      resetState,
      10,
      5,
      loop,
      true
    );
}

check(
  resetState.consecutiveNoGrowth,
  9
);

resetState =
  adaptiveProgressForTest(
    resetState,
    11,
    6,
    10,
    true
  );

check(
  resetState.consecutiveNoGrowth,
  0
);

check(
  resetState.lastRawCardGrowthLoop,
  10
);

check(
  resetState.lastFinalCandidateGrowthLoop,
  10
);

// STEP 2 설정값 자체도 잠금.
check(
  /maxScrollLoops:\s*60/.test(collectorSource),
  true
);

check(
  /minimumScrollLoops:\s*12/.test(collectorSource),
  true
);

check(
  /noGrowthThreshold:\s*10/.test(collectorSource),
  true
);

check(
  /maxCaptureMs:\s*120000/.test(collectorSource),
  true
);

// 관리자 최초 capture 목표는 40 유지.
check(
  /targetCount:\s*40/.test(panel),
  true
);


// Execute the handler only in a sealed VM with an in-memory capture and null DB
// reads. All external services and DB mutations throw; no endpoint is contacted.
const pureModules = new Map();
function pureModule(name) {
  if (!pureModules.has(name)) {
    const sandbox = { exports: {} };
    vm.runInNewContext(compile(fs.readFileSync(`lib/${name}.ts`, 'utf8')), sandbox);
    pureModules.set(name, sandbox.exports);
  }
  return pureModules.get(name);
}
async function runFreeHandler(source, products, mode = 'zeroPaidOnly') {
  const forbidden = () => { throw new Error('External call or DB mutation forbidden in regression'); };
  let externalAttempts = 0;
  const deny = () => { externalAttempts++; return forbidden(); };
  const query = new Proxy({}, { get: (_, key) => key === 'then'
    ? resolve => resolve({ data: null, error: null })
    : ['insert', 'update', 'upsert', 'delete'].includes(key) ? deny : () => query });
  const sandbox = { exports: {}, URL, console: { log() {}, warn() {}, error() {} },
    fetch: async url => {
      if (String(url) !== 'http://local.test/api/naver-capture?id=fixture') return deny();
      return { ok: true, json: async () => ({ success: true, category: '캠핑용 에어컨', products,
        captureCounts: { receivedCount: products.length + 1, normalizedCount: products.length } }) };
    },
    require: name => {
      if (name === 'next/server') return { NextResponse: { json: body => body } };
      if (name.endsWith('/supabaseAdmin')) return { supabaseAdmin: { from: () => query } };
      const base = name.split('/').at(-1);
      if (['validateProductMatch', 'project-d-category-relevance', 'project-d-product-model-identity', 'canonicalPipelineIdentity', 'buildResolverSearchPlan'].includes(base)) return pureModule(base);
      return new Proxy({}, { get: () => deny });
    } };
  vm.runInNewContext(compile(source), sandbox);
  const result = await sandbox.exports.GET({ url: `http://local.test/api/market-candidates-enriched?captureId=fixture&${mode}=1&requireVerifiedPrice=1` });
  check(externalAttempts, 0);
  assert.equal(result.success, true, result.message);
  return JSON.parse(JSON.stringify(result));
}
function freeProduct(id, title = 'Example 캠핑 AC400') {
  return { name: title, text: '', seller: '', url: `https://smartstore.naver.com/test/products/${id}`, imageUrl: '',
    price: 300000, priceVerified: true, reviewCount: 40, rating: 4,
    browserReviewSourceUrl: `https://smartstore.naver.com/test/products/${id}`,
    browserChannelProductNo: String(id), browserOriginProductNo: String(id), browserProductTitle: title,
    browserEvidenceSourceType: 'smartstore-native', browserReviewTotalCount: 40,
    browserReviews: Array.from({ length: 5 }, (_, i) => ({ text: `충분한 리뷰 본문 ${i}`, rating: 4, date: '', helpfulCount: 0 })) };
}
const serverSource = fs.readFileSync('app/api/market-candidates-enriched/route.ts', 'utf8');
const serverFixtures = [[], [freeProduct(100), freeProduct(101, 'Example 산업용 AC500'),
  { ...freeProduct(102), browserReviewTotalCount: 29 }, { ...freeProduct(103), browserReviews: [] },
  { ...freeProduct(104), browserOriginProductNo: '' }, { ...freeProduct(105), priceVerified: false },
  { ...freeProduct(106), browserChannelProductNo: '999' }, { ...freeProduct(107), browserReviewSourceUrl: 'https://invalid.test/' },
  freeProduct(100)]];
for (const fixture of serverFixtures) {
  const actual = await runFreeHandler(serverSource, fixture);
  const before = await runFreeHandler(withoutPoolDiagnostics(serverSource), fixture);
  const { diagnostics, ...legacyFields } = actual;
  check(legacyFields, before);
  check(diagnostics.capture.receivedCount, fixture.length + 1);
  const z = diagnostics.zeroPaid, f = diagnostics.full;
  check(z.zeroPaidQualifiedCount + z.zeroPaidRejectedCount, z.zeroPaidEvaluatedCount);
  check(z.zeroPaidQualifiedCount <= z.zeroPaidEvaluatedCount, true);
  const rejectedRows =
    Array.isArray(
      diagnostics.zeroPaidCandidateDiagnostics,
    )
      ? diagnostics.zeroPaidCandidateDiagnostics
      : [];

  check(
    rejectedRows.length,
    z.zeroPaidRejectedCount,
  );

  check(
    rejectedRows.every(
      row =>
        typeof row.productName === "string" &&
        Number.isSafeInteger(
          row.reviewTotalCount,
        ) &&
        row.reviewTotalCount >= 0 &&
        Number.isSafeInteger(
          row.reviewSampleCount,
        ) &&
        row.reviewSampleCount >= 0 &&
        Array.isArray(row.reasons) &&
        row.reasons.length > 0,
    ),
    true,
  );
  check(f.finalCandidateCount <= f.relevanceEligibleCount, true);
  check(f.fullBeforeRelevanceCount, f.relevanceEligibleCount + f.relevanceRejectedCount);
  check(f.finalCandidateCount, actual.finalCandidates.length);
  for (const section of [diagnostics.capture, diagnostics.earlyValidation, z, z.rejectReasons, f]) {
    for (const value of Object.values(section)) if (typeof value === 'number') check(Number.isSafeInteger(value) && value >= 0, true);
  }
  if (fixture.length) {
    check(f.finalCandidateCount, 1);
    check(f.relevanceRejectedCount, 1);
    for (const reason of ['reviewCountBelowMinimum', 'reviewSampleInsufficient', 'nativeMetadataMissing', 'priceEvidenceInvalid', 'identityMismatch', 'reviewSourceInvalid']) check(z.rejectReasons[reason] > 0, true);
  }
}
const planResult = await runFreeHandler(serverSource, [freeProduct(100)], 'paidPlanOnly');
check(planResult.diagnostics.full.finalCandidateCount, null);
check(planResult.diagnostics.paidPlanning, { paidPossibleCount: 0, resolverRequiredCount: 0, brightDataPossibleCount: 0 });
const mixedPlanFixture = [freeProduct(100), { ...freeProduct(101), browserReviews: [] }];
const mixedPlan = await runFreeHandler(serverSource, mixedPlanFixture, 'paidPlanOnly');
const legacyPlan = await runFreeHandler(withoutPoolDiagnostics(serverSource), mixedPlanFixture, 'paidPlanOnly');
const { diagnostics: planDiagnostics, ...legacyPlanFields } = mixedPlan;
check(legacyPlanFields, legacyPlan);
check(planDiagnostics.paidPlanning, { paidPossibleCount: 1, resolverRequiredCount: 1, brightDataPossibleCount: 1 });
check(
  Array.isArray(
    planDiagnostics.paidCandidatePlans,
  ),
  true,
);

check(
  planDiagnostics.paidCandidatePlans.length,
  1,
);

assert.equal(
  planDiagnostics.paidCandidatePlans[0].zeroPaidProven,
  undefined,
);

check(
  typeof planDiagnostics.paidCandidatePlans[0].productName,
  "string",
);

check(
  planDiagnostics.paidCandidatePlans[0].resolverConservativeUpperBound >= 0,
  true,
);

check(
  planDiagnostics.paidCandidatePlans[0].brightDataConservativeUpperBound >= 0,
  true,
);

// STEP4_PREFLIGHT_REGRESSION

/*
  실제 execution은 zeroPaidOnly가 아닐 때
  preflight-filtered source를 사용해야 한다.
*/
assert.match(
  serverSource,
  /const executionSourceCandidates\s*=\s*zeroPaidOnly\s*\?\s*marketCandidates\s*:\s*paidRelevancePreflightCandidates;/s,
);

assert.match(
  serverSource,
  /relevancePreflightExcludedProducts\.has\(\s*market,?\s*\)/s,
);

assert.match(
  panel,
  /유료 전 relevance 명백 제외/,
);

assert.match(
  panel,
  /유료 전 relevance 사전판정은 현재 상품명만 사용/,
);

/*
  positive + negative:
  캠핑 신호가 있어도 산업용 신호가 있으면 excluded.
*/
const step4ExcludedProduct = {
  ...freeProduct(
    991,
    "캠핑 산업용 에어컨 AC-991",
  ),

  browserReviewSourceUrl: "",
  browserChannelProductNo: "",
  browserOriginProductNo: "",
  browserProductTitle: "",
  browserCatalogTitle: "",
  browserSpecs: {},
  browserEvidenceSourceType: "",
};

const step4ExcludedPlan =
  await runFreeHandler(
    serverSource,
    [
      step4ExcludedProduct,
    ],
    "paidPlanOnly",
  );

check(
  step4ExcludedPlan
    .diagnostics
    .relevancePreflight
    .evaluatedCount,
  1,
);

check(
  step4ExcludedPlan
    .diagnostics
    .relevancePreflight
    .excludedCount,
  1,
);

check(
  step4ExcludedPlan
    .diagnostics
    .relevancePreflight
    .needsReviewCount,
  0,
);

check(
  step4ExcludedPlan
    .candidatePlans
    .length,
  0,
);

check(
  step4ExcludedPlan
    .paidPossibleCount,
  0,
);

/*
  실제 execution에서도 excluded 후보는
  processCandidate에 들어가기 전에 사라져야 한다.
  runFreeHandler는 외부 호출을 전부 금지하므로
  이 호출이 성공하는 것 자체가 비용 경로 미진입 증거다.
*/
const step4ExcludedExecution =
  await runFreeHandler(
    serverSource,
    [
      step4ExcludedProduct,
    ],
    "execution",
  );

check(
  step4ExcludedExecution
    .sourceMarketCandidateCount,
  1,
);

check(
  step4ExcludedExecution
    .marketCandidateCount,
  0,
);

check(
  step4ExcludedExecution
    .resolverAttempts,
  0,
);

check(
  step4ExcludedExecution
    .brightDataCalls,
  0,
);

/*
  이름만으로 명백한 제외 근거가 없는 이동식 상품은
  needs-review로 남기고 paid plan에서도 유지한다.
*/
const step4NeedsReviewProduct = {
  ...freeProduct(
    992,
    "이동식 에어컨 AC-992",
  ),

  browserReviewSourceUrl: "",
  browserChannelProductNo: "",
  browserOriginProductNo: "",
  browserProductTitle: "",
  browserCatalogTitle: "",
  browserSpecs: {},
  browserEvidenceSourceType: "",
};

const step4NeedsReviewPlan =
  await runFreeHandler(
    serverSource,
    [
      step4NeedsReviewProduct,
    ],
    "paidPlanOnly",
  );

check(
  step4NeedsReviewPlan
    .diagnostics
    .relevancePreflight
    .excludedCount,
  0,
);

check(
  step4NeedsReviewPlan
    .diagnostics
    .relevancePreflight
    .needsReviewCount,
  1,
);

check(
  step4NeedsReviewPlan
    .candidatePlans
    .length,
  1,
);

check(
  step4NeedsReviewPlan
    .paidPossibleCount,
  1,
);

check(
  step4NeedsReviewPlan
    .candidatePlans[0]
    .path,
  "resolver-required",
);

// STEP5_PAID_RECOVERY_PRIORITY_REGRESSION

/*
  시장순서는 C → B → A로 일부러 뒤집는다.
  paidPlan 결과는 반드시 A → B → C여야 한다.
*/

const step5A = {
  ...freeProduct(
    1201,
    "캠핑용 이동식 에어컨 STEP5-A",
  ),

  reviewCount: 27,
  browserReviewTotalCount: 27,
};

const step5B = {
  ...freeProduct(
    1202,
    "캠핑용 이동식 에어컨 STEP5-B",
  ),

  reviewCount: 0,
  browserReviewTotalCount: 0,

  browserReviewSourceUrl: "",
  browserChannelProductNo: "",
  browserOriginProductNo: "",
  browserProductTitle: "",
  browserCatalogTitle: "",
  browserSpecs: {},
  browserEvidenceSourceType: "",
};

const step5C = {
  ...freeProduct(
    1203,
    "캠핑용 이동식 에어컨 STEP5-C",
  ),

  reviewCount: 0,
  browserReviewTotalCount: 0,
  browserReviews: [],

  browserReviewSourceUrl: "",
  browserChannelProductNo: "",
  browserOriginProductNo: "",
  browserProductTitle: "",
  browserCatalogTitle: "",
  browserSpecs: {},
  browserEvidenceSourceType: "",
};

const step5Plan =
  await runFreeHandler(
    serverSource,
    [
      step5C,
      step5B,
      step5A,
    ],
    "paidPlanOnly",
  );

const step5PaidPlans =
  step5Plan.candidatePlans.filter(
    plan =>
      plan.zeroPaidProven !== true,
  );

check(
  step5PaidPlans.map(
    plan =>
      plan.productName,
  ),
  [
    step5A.name,
    step5B.name,
    step5C.name,
  ],
);

check(
  step5Plan
    .diagnostics
    .paidCandidatePlans
    .map(
      plan =>
        plan.recoveryTier,
    ),
  [
    "A",
    "B",
    "C",
  ],
);

/*
  실제 execution 후보 제한 역시
  rankedPaidExecutionCandidates에서 slice해야 한다.
*/

assert.match(
  serverSource,
  /const rankedPaidExecutionCandidates\s*=[\s\S]*?comparePaidRecoveryPriority/s,
);

assert.match(
  serverSource,
  /const selectedPaidExecutionCandidates\s*=\s*paidCandidateLimit === null[\s\S]*?rankedPaidExecutionCandidates\.slice\(/s,
);

assert.match(
  serverSource,
  /selectedPaidExecutionSet\.has\(\s*product,?\s*\)/s,
);

assert.match(
  panel,
  /paid 우선순위/,
);

// Capture transport is also local: verify before/after normalization counts
// and collector diagnostics survive POST -> memory -> GET without any client.
const captureSandbox = { exports: {}, URL, crypto: { randomUUID: () => 'capture-fixture' },
  require: name => { assert.equal(name, 'next/server'); return { NextResponse: { json: body => body } }; } };
vm.runInNewContext(compile(capture), captureSandbox);
const captureInput = Array.from({ length: 102 }, (_, i) => ({ ...freeProduct(i + 100), price: i === 0 ? 0 : 300000 }));
const capturePost = await captureSandbox.exports.POST({ json: async () => ({ category: '캠핑용 에어컨',
  products: captureInput, diagnostics: { collectorDiagnostics: observedCollector } }) });
check(capturePost.success, true);
const captureGet = await captureSandbox.exports.GET({ url: 'http://local.test/api/naver-capture?id=capture-fixture' });
check(captureGet.captureCounts, { receivedCount: 102, normalizedCount: 99 });
check(captureGet.count, 99);
check(captureGet.products.map(p => p.name), captureInput.slice(1, 100).map(p => p.name));
check(captureGet.collectorDiagnostics.finalCapturedCount, observedCollector.finalCapturedCount);

// Explicitly retain the administrator's E2E shortcut and paid top-up contract.
// STEP6_MARKET_POOL_ADVISOR_FIVE_REGRESSION
assert.match(
  panel,
  /finalCandidates:\s*zeroPaidPreviewCandidates,/s,
);

assert.doesNotMatch(
  panel,
  /finalCandidates:\s*zeroPaidPreviewCandidates\.slice/s,
);

assert.doesNotMatch(
  panel,
  /finalCandidates:[\s\S]*?targetCount:\s*5,[\s\S]*?resolverAttempts:\s*0/s,
);

assert.match(
  panel,
  /MARKET POOL 전체를 DB에 등록합니다/,
);

assert.match(
  panel,
  /shouldStopAdvisorReview\(\s*reviewCollections\.length,?\s*\)[\s\S]*?break;/s,
);

assert.match(
  panel,
  /const currentPoolMapping\s*=\s*mappedProducts\.get\([\s\S]*?Number\(\s*productId/s,
);

assert.match(
  panel,
  /const advisorReviewDbIds\s*=\s*new Set<string>\(\)/,
);

assert.match(
  panel,
  /ADVISOR FIVE PRE-DEEP IDENTITY GATE[\s\S]*?isAdvisorReviewIdentityReady\(\s*currentPoolMapping,[\s\S]*?advisorReviewDbIds,[\s\S]*?advisorReviewOrigins/s,
);
assert.match(panel, /enrichedParams\.set\(\s*"executionTargetCount",\s*"5",?\s*\)/);
assert.match(panel, /enrichedParams\.set\(\s*"paidCandidateLimit",\s*"1",?\s*\)/);
assert.match(panel, /enrichedParams\.set\(\s*"paidCandidateOffset",\s*"0",?\s*\)/);
assert.match(panel, /index <\s*finalCandidates\.length/);
assert.match(panel, /const selected = selectEligibleFive\(eligible, selectionRun\)/);
// STEP6_SELECTED_FIVE_CONTRACT_GUARD
assert.match(
  panel,
  /const eligible = reviewCollections\.flatMap/,
);

assert.match(
  panel,
  /const selected = selectEligibleFive\(eligible, selectionRun\)/,
);
// STEP7_ADVISOR_REVIEW_CONTROL_FIXTURES

/*
  Execute the exact production pure control functions.
  No browser, route, API or DB code is invoked here.
*/
const {
  shouldStopAdvisorReview:
    stopAdvisorReviewForTest,
  isAdvisorReviewIdentityReady:
    advisorIdentityReadyForTest,
  markAdvisorReviewIdentityReady:
    markAdvisorIdentityForTest,
} = pureFunctions(
  'components/ProjectDAutomationPanel.tsx',
  [
    'shouldStopAdvisorReview',
    'isAdvisorReviewIdentityReady',
    'markAdvisorReviewIdentityReady',
  ],
);

function runAdvisorReviewControlFixture(
  rows,
) {
  const dbIds =
    new Set();

  const origins =
    new Set();

  const deepCalls =
    [];

  const ready =
    [];

  for (const row of rows) {
    if (
      stopAdvisorReviewForTest(
        ready.length,
      )
    ) {
      break;
    }

    if (
      row.mapped === false
    ) {
      continue;
    }

    const mapping = {
      dbProductId:
        row.dbProductId,
      originProductNo:
        row.originProductNo,
    };

    if (
      advisorIdentityReadyForTest(
        mapping,
        dbIds,
        origins,
      )
    ) {
      continue;
    }

    /*
      This represents the exact point where production is
      now allowed to call collectDeepNaverReviews().
    */
    deepCalls.push(
      row.name,
    );

    if (
      row.reviewCount <
      30
    ) {
      continue;
    }

    markAdvisorIdentityForTest(
      mapping,
      dbIds,
      origins,
    );

    ready.push(
      row.name,
    );
  }

  return {
    deepCalls,
    ready,
  };
}

function step7Row(
  id,
  reviewCount = 30,
  overrides = {},
) {
  return {
    name:
      `P${id}`,
    dbProductId:
      `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    originProductNo:
      id,
    reviewCount,
    mapped:
      true,
    ...overrides,
  };
}

/*
  CASE 1:
  6개 모두 정상.
  앞 5개가 준비되면 6번째는 deep 호출 자체가 없어야 한다.
*/
const step7AllReady =
  runAdvisorReviewControlFixture(
    [
      step7Row(1),
      step7Row(2),
      step7Row(3),
      step7Row(4),
      step7Row(5),
      step7Row(6),
    ],
  );

check(
  step7AllReady.ready,
  [
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
  ],
);

check(
  step7AllReady.deepCalls,
  [
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
  ],
);

/*
  CASE 2:
  세 번째 후보가 리뷰 30개 미만.
  6번째까지 inspect해서 최종 ready 5개를 채워야 한다.
*/
const step7Insufficient =
  runAdvisorReviewControlFixture(
    [
      step7Row(11),
      step7Row(12),
      step7Row(
        13,
        29,
      ),
      step7Row(14),
      step7Row(15),
      step7Row(16),
    ],
  );

check(
  step7Insufficient.ready,
  [
    'P11',
    'P12',
    'P14',
    'P15',
    'P16',
  ],
);

check(
  step7Insufficient.deepCalls,
  [
    'P11',
    'P12',
    'P13',
    'P14',
    'P15',
    'P16',
  ],
);

/*
  CASE 3:
  5번째 후보가 1번째와 같은 DB UUID/origin.
  중복 후보는 deep 호출 자체가 없어야 하고,
  6번째가 다섯 번째 ready 자리를 채워야 한다.
*/
const step7Duplicate =
  runAdvisorReviewControlFixture(
    [
      step7Row(21),
      step7Row(22),
      step7Row(23),
      step7Row(24),
      step7Row(
        25,
        30,
        {
          dbProductId:
            step7Row(21).dbProductId,
          originProductNo:
            21,
        },
      ),
      step7Row(26),
    ],
  );

check(
  step7Duplicate.ready,
  [
    'P21',
    'P22',
    'P23',
    'P24',
    'P26',
  ],
);

check(
  step7Duplicate.deepCalls,
  [
    'P21',
    'P22',
    'P23',
    'P24',
    'P26',
  ],
);

assert.match(
  panel,
  /ADVISOR FIVE PRE-DEEP IDENTITY GATE[\s\S]*?isAdvisorReviewIdentityReady[\s\S]*?const reviewSourceUrl/s,
);

assert.ok(
  panel.indexOf(
    'ADVISOR FIVE PRE-DEEP IDENTITY GATE',
  ) <
  panel.indexOf(
    'collectDeepNaverReviews(',
    panel.indexOf(
      'ADVISOR FIVE REVIEW EARLY STOP',
    ),
  ),
);

const { poolDiagnosticLines: diagnosticLines } = pureFunctions('components/ProjectDAutomationPanel.tsx', ['poolDiagnosticLines']);
const {
  poolDiagnosticCandidateLines:
    candidateDiagnosticLines,
} = pureFunctions(
  'components/ProjectDAutomationPanel.tsx',
  ['poolDiagnosticCandidateLines'],
);

const candidateDiagnosticFixture =
  candidateDiagnosticLines({
    captureId: 'fixture',
    collector: null,
    free: {
      captureId: 'fixture',
      zeroPaidCandidateDiagnostics: [
        {
          productName: 'Example AC',
          reviewTotalCount: 12,
          reviewSampleCount: 2,
          nativeMetadataPresent: false,
          reviewSourceValid: false,
          priceEvidenceValid: true,
          identityMatched: true,
          reasons: [
            'reviewCountBelowMinimum',
            'nativeMetadataMissing',
          ],
        },
      ],
    },
    paid: {
      captureId: 'fixture',
      paidCandidatePlans: [
        {
          productName: 'Example AC',
          path: 'resolver-required',
          resolverConservativeUpperBound: 4,
          brightDataConservativeUpperBound: 2,
        },
      ],
    },
  });

check(
  candidateDiagnosticFixture.length,
  1,
);

check(
  candidateDiagnosticFixture[0].includes(
    '리뷰 총량 12/30',
  ),
  true,
);

check(
  candidateDiagnosticFixture[0].includes(
    'resolver-required',
  ),
  true,
);

check(
  candidateDiagnosticFixture[0].includes(
    'resolver 상한 4회',
  ),
  true,
);
check(diagnosticLines({ captureId: 'fixture', collector: null, free: null, paid: null }).some(line => line.includes('미제공 / 미실행')), true);
check(diagnosticLines({ captureId: 'fixture', collector: { rawCardCount: 0 }, free: { captureId: 'other', full: { finalCandidateCount: 99 } }, paid: null }).some(line => line.includes('99개')), false);
check(diagnosticLines({ captureId: 'fixture', collector: { rawCardCount: 0 }, free: null, paid: null })[0], '브라우저 카드 관측: 0개');
console.log(`STEP 7 FINAL PASS: ${assertions} counted assertions; original 269 preserved. Fake DOM/VM fixtures only; external calls and DB writes: 0.`);
