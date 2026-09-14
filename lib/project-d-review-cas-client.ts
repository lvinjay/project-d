import { supabase } from "./supabase";
import { UUID_PATTERN } from "./project-d-selected-five-manifest";

export type ReviewAnalysisSnapshot = Record<string, unknown> | null;
type ReviewIdentity = { category: string; dbProductId: string; originProductNo: number; productName: string };
function validateIdentity(identity: ReviewIdentity) {
  if (!UUID_PATTERN.test(identity.dbProductId) || !Number.isSafeInteger(identity.originProductNo) ||
      identity.originProductNo <= 0 || !identity.category.trim() || !identity.productName.trim()) {
    throw new Error("리뷰 저장 제품 identity가 유효하지 않습니다.");
  }
}
export async function fetchCurrentReviewAnalysisSnapshot(identity: ReviewIdentity): Promise<ReviewAnalysisSnapshot> {
  validateIdentity(identity);
  const { data, error } = await supabase.from("products")
    .select("id, category, product_name, origin_product_no, review_analysis")
    .eq("category", identity.category).eq("id", identity.dbProductId)
    .eq("origin_product_no", identity.originProductNo).eq("product_name", identity.productName)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.id !== identity.dbProductId || data.category !== identity.category ||
      data.origin_product_no !== identity.originProductNo || data.product_name !== identity.productName) {
    throw new Error("현재 리뷰 분석 snapshot의 제품 identity가 정확히 일치하지 않습니다.");
  }
  if (data.review_analysis === null) return null;
  if (typeof data.review_analysis !== "object" || Array.isArray(data.review_analysis)) {
    throw new Error("현재 review_analysis snapshot 형식이 잘못되었습니다.");
  }
  return structuredClone(data.review_analysis) as Record<string, unknown>;
}
export async function saveReviewAnalysisCas(input: ReviewIdentity & {
  expectedReviewAnalysis: ReviewAnalysisSnapshot; analysis: object;
}): Promise<void> {
  validateIdentity(input);
  const { category, dbProductId, originProductNo, productName, expectedReviewAnalysis, analysis } = input;
  const response = await fetch("/api/save-review-analysis-only", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, products: [{ dbProductId, originProductNo, productName, expectedReviewAnalysis, analysis }] }),
  });
  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  if (data?.casConflict === true || results.some((r: { casConflict?: boolean } | null) => r?.casConflict === true)) {
    throw new ReviewAnalysisCasError("CAS conflict: 유료 분석 중 최신 리뷰 분석이 저장되어 이전 snapshot 기반 저장을 거부했습니다. 자동 재시도하지 않습니다.", true);
  }
  if (!response.ok || data?.success !== true || data.successCount !== 1 || data.failureCount !== 0 ||
      data.reviewRawDataTouched !== false || results.length !== 1 || results[0]?.success !== true ||
      results[0]?.dbWrite !== true || results[0]?.casVerified !== true) {
    throw new Error(data?.message || "리뷰 분석 CAS 저장 결과를 검증하지 못했습니다.");
  }
}

export class ReviewAnalysisCasError extends Error {
  constructor(message: string, public readonly casConflict = false) { super(message); this.name = "ReviewAnalysisCasError"; }
}
export type StoredReviewAnalysisPersistenceRetry = ReviewIdentity & {
  schemaVersion: 1; expectedReviewAnalysis: ReviewAnalysisSnapshot; analysis: Record<string, unknown>;
  inputFingerprint: string; savedAt: string;
};
const RETRY_PREFIX = "projectDReviewPersistenceRetry:v1:";
function retryKey(identity: ReviewIdentity) {
  validateIdentity(identity);
  return RETRY_PREFIX + JSON.stringify([identity.category, identity.dbProductId, identity.originProductNo, identity.productName]);
}
function validateRetry(value: unknown, identity: ReviewIdentity, fingerprint: string): StoredReviewAnalysisPersistenceRetry {
  const r = value as StoredReviewAnalysisPersistenceRetry | null;
  const object = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!r || r.schemaVersion !== 1 || r.category !== identity.category || r.dbProductId !== identity.dbProductId ||
      r.originProductNo !== identity.originProductNo || r.productName !== identity.productName ||
      !/^[a-f0-9]{64}$/.test(fingerprint) || r.inputFingerprint !== fingerprint || !object(r.analysis) ||
      !(r.expectedReviewAnalysis === null || object(r.expectedReviewAnalysis)) ||
      typeof r.savedAt !== "string" || !Number.isFinite(Date.parse(r.savedAt))) {
    throw new ReviewAnalysisCasError("보관된 AI 결과의 identity/fingerprint가 현재 입력과 다릅니다. 저장 및 새 유료 분석을 중단합니다.");
  }
  return r;
}
async function persistStored(row: StoredReviewAnalysisPersistenceRetry) {
  const key = retryKey(row);
  try {
    await saveReviewAnalysisCas(row);
  } catch (error) {
    if (error instanceof ReviewAnalysisCasError && error.casConflict) {
      window.sessionStorage.removeItem(key);
      throw error;
    }
    throw new ReviewAnalysisCasError("AI 결과는 보관됨. OpenAI 재호출 없이 저장만 재시도할 수 있습니다. " +
      (error instanceof Error ? error.message : String(error)));
  }
  window.sessionStorage.removeItem(key);
  return { analysis: row.analysis, paidApiCalls: 0 as const };
}
export async function storeAndSaveReviewAnalysis(input: ReviewIdentity & {
  expectedReviewAnalysis: ReviewAnalysisSnapshot; analysis: object; inputFingerprint: string;
}) {
  const row = validateRetry({ ...input, schemaVersion: 1, savedAt: new Date().toISOString() }, input, input.inputFingerprint);
  // Preserve the validated paid result before the first persistence attempt.
  window.sessionStorage.setItem(retryKey(input), JSON.stringify(row));
  return persistStored(row);
}
export async function retryStoredReviewAnalysisPersistence(identity: ReviewIdentity, inputFingerprint: string) {
  const raw = window.sessionStorage.getItem(retryKey(identity));
  if (raw === null) return null;
  const row = validateRetry(JSON.parse(raw), identity, inputFingerprint);
  return persistStored(row);
}
