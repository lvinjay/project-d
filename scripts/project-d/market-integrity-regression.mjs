import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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
