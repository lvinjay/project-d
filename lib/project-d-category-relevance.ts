export const CATEGORY_RELEVANCE_POLICY_VERSION = "category-relevance-v1";
export type RelevanceInput = {
  category: string; marketName?: unknown; detailTitle?: unknown; detailModelName?: unknown;
  keySpecs?: unknown; evaluationEvidence?: unknown;
};
export type RelevanceResult = {
  status: "eligible" | "excluded" | "needs-review";
  reason: string; matchedPositiveSignals: string[]; matchedNegativeSignals: string[];
  evidence: Array<{ field: string; text: string; signal: string; polarity: "positive" | "negative" }>;
  policyVersion: string; policyApplied: boolean;
};
const clean = (v: unknown) => typeof v === "string" ? v.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

function campingAirConditioner(input: RelevanceInput): RelevanceResult {
  const fields: Array<{ field: string; text: string; powerSpec?: boolean }> = [];
  for (const field of ["marketName", "detailTitle", "detailModelName"] as const) {
    const text = clean(input[field]); if (text) fields.push({ field, text });
  }
  for (const [key, value] of Object.entries(record(input.keySpecs))) {
    const text = typeof value === "number" && Number.isFinite(value) ? String(value) : clean(value);
    if (text) fields.push({ field: "keySpecs." + key, text: clean(key) + ": " + text,
      powerSpec: /전원|입력.*전압|정격.*전압|사용.*전압|power\s*supply|input\s*voltage/i.test(key) });
  }
  for (const [key, values] of Object.entries(record(input.evaluationEvidence))) {
    if (Array.isArray(values)) for (const value of values) {
      const text = clean(value); if (text) fields.push({ field: "evaluationEvidence." + key, text });
    }
  }
  const evidence: RelevanceResult["evidence"] = [];
  const positives = ["캠핑", "차박", "차량용", "휴대용", "텐트", "무시동"];
  const negatives = ["산업용", "공업용", "공장용", "업소용", "주방용", "식당용"];
  for (const entry of fields) {
    for (const signal of positives) if (entry.text.includes(signal)) evidence.push({ field: entry.field, text: entry.text, signal, polarity: "positive" });
    for (const signal of negatives) if (entry.text.includes(signal)) evidence.push({ field: entry.field, text: entry.text, signal, polarity: "negative" });
    // Only actual power-input specs count; a DC motor or title voltage alone is not power-source evidence.
    if (entry.powerSpec && /\bDC\s*[-:]?\s*(?:12|24|48)\s*V\b|\b(?:12|24|48)\s*V\s*DC\b/i.test(entry.text)) {
      evidence.push({ field: entry.field, text: entry.text, signal: "DC 12/24/48V 전원", polarity: "positive" });
    }
  }
  const matchedPositiveSignals = [...new Set(evidence.filter(e => e.polarity === "positive").map(e => e.signal))];
  const matchedNegativeSignals = [...new Set(evidence.filter(e => e.polarity === "negative").map(e => e.signal))];
  const status = matchedNegativeSignals.length ? "excluded" : matchedPositiveSignals.length ? "eligible" : "needs-review";
  return { status, matchedPositiveSignals, matchedNegativeSignals, evidence,
    reason: matchedNegativeSignals.length
      ? (matchedPositiveSignals.length ? "캠핑 관련 신호와 산업/상업 용도 신호가 충돌하여 보수적으로 제외합니다." : "산업/상업 용도 신호가 확인되어 캠핑용 후보에서 제외합니다.")
      : matchedPositiveSignals.length ? "캠핑·휴대·차량 용도 또는 DC 전원 근거가 확인되었습니다."
      : "캠핑 용도 근거가 부족합니다. 이동식 표기나 브랜드명만으로 자동 승인하지 않습니다.",
    policyVersion: CATEGORY_RELEVANCE_POLICY_VERSION, policyApplied: true };
}
const policies: Readonly<Record<string, (input: RelevanceInput) => RelevanceResult>> = {
  "캠핑용 에어컨": campingAirConditioner,
};
export function evaluateCategoryRelevance(input: RelevanceInput): RelevanceResult {
  const policy = Object.prototype.hasOwnProperty.call(policies, clean(input.category)) ? policies[clean(input.category)] : undefined;
  return policy ? policy(input) : {
    status: "eligible", reason: "이 제품군에는 V1 relevance 정책을 적용하지 않습니다.",
    matchedPositiveSignals: [], matchedNegativeSignals: [], evidence: [],
    policyVersion: CATEGORY_RELEVANCE_POLICY_VERSION, policyApplied: false,
  };
}
