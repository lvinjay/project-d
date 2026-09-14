export const SELECTED_FIVE_KEY = "projectDSelectedFiveManifest";
export const CURRENT_RUN_KEY = "projectDCurrentSelectionRun";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SelectionRun = { runId: string; category: string };
export type SelectedProduct = {
  dbProductId: string; originProductNo: number; productName: string;
  readiness: { runId: string; reviewCount: number; reviewAnalysisSaved: true;
    analysisFingerprint: string; rawCorpusPersisted: false };
};
export type SelectedFiveManifest = SelectionRun & {
  schemaVersion: 1; profileRevision: string; products: SelectedProduct[];
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("선택 manifest 형식이 잘못되었습니다.");
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return "{" + Object.keys(row).sort().map(key => JSON.stringify(key) + ":" + canonical(row[key])).join(",") + "}";
  }
  return JSON.stringify(value ?? null);
}
// Exact canonical content identity, not a lossy hash or timestamp-only revision.
export function categoryProfileRevision(value: unknown): string {
  const row = object(value);
  if (!text(row.id) || !text(row.category) || !text(row.updated_at) ||
      !Array.isArray(row.criteria) || row.criteria.length !== 5) throw new Error("유효한 카테고리 프로필 revision이 없습니다.");
  return canonical(Object.fromEntries(["id", "category", "updated_at", "title", "introduction", "criteria",
    "personalization_questions", "use_cases", "candidate_limit"].map(key => [key, row[key]])));
}
export function validateSelectedFive(value: unknown, run: SelectionRun, revision?: string): SelectedFiveManifest {
  const row = object(value);
  if (row.schemaVersion !== 1 || !UUID_PATTERN.test(String(row.runId)) || row.runId !== run.runId ||
      !text(row.category) || row.category !== run.category || !text(row.profileRevision) ||
      (revision !== undefined && row.profileRevision !== revision) ||
      !Array.isArray(row.products) || row.products.length !== 5) {
    throw new Error("현재 실행·카테고리·프로필에 맞는 최종 5개가 없습니다. 다시 준비해 주세요.");
  }
  const ids = new Set<string>(), origins = new Set<number>();
  for (const item of row.products) {
    const p = object(item), ready = object(p.readiness);
    if (typeof p.dbProductId !== "string" || !UUID_PATTERN.test(p.dbProductId) ||
        ids.has(p.dbProductId.toLowerCase()) || typeof p.originProductNo !== "number" ||
        !Number.isSafeInteger(p.originProductNo) || p.originProductNo <= 0 || origins.has(p.originProductNo) ||
        !text(p.productName) || ready.runId !== run.runId || ready.reviewAnalysisSaved !== true ||
        ready.rawCorpusPersisted !== false || !Number.isSafeInteger(ready.reviewCount) ||
        Number(ready.reviewCount) < 30 || Number(ready.reviewCount) > 1000 ||
        typeof ready.analysisFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(ready.analysisFingerprint)) {
      throw new Error("최종 5개 제품의 UUID·원상품 번호·현재 실행 준비 상태가 잘못되었습니다.");
    }
    ids.add(p.dbProductId.toLowerCase()); origins.add(p.originProductNo);
  }
  return row as SelectedFiveManifest;
}
export function beginSelectionRun(storage: Store, category: string): SelectionRun {
  if (!text(category)) throw new Error("카테고리가 필요합니다.");
  const run = { runId: crypto.randomUUID(), category };
  for (const key of [SELECTED_FIVE_KEY, "projectDAutomationProductNames", "projectDAdvisorAnswers",
    "projectDPersonalPreferenceCache"]) storage.removeItem(key);
  storage.setItem(CURRENT_RUN_KEY, JSON.stringify(run));
  return run;
}
export function assertSelectionRun(storage: Store, run: SelectionRun) {
  const current = object(JSON.parse(storage.getItem(CURRENT_RUN_KEY) ?? "null"));
  if (current.runId !== run.runId || current.category !== run.category) throw new Error("실행이 변경되었습니다. 현재 작업을 중단합니다.");
}
export function readSelectedFive(storage: Store, category?: string) {
  const run = object(JSON.parse(storage.getItem(CURRENT_RUN_KEY) ?? "null"));
  if (!text(run.runId) || !text(run.category) || (category && run.category !== category)) throw new Error("현재 선택 실행이 없습니다.");
  return validateSelectedFive(JSON.parse(storage.getItem(SELECTED_FIVE_KEY) ?? "null"), run as SelectionRun);
}
export function selectedFiveIdentity(manifest: SelectedFiveManifest) { return canonical(manifest); }
export function selectedFiveIds(manifest: SelectedFiveManifest) { return manifest.products.map(p => p.dbProductId); }
export function assertSameSelectedIds(ids: readonly string[] | undefined, manifest: SelectedFiveManifest) {
  if (!ids || canonical(ids) !== canonical(selectedFiveIds(manifest))) throw new Error("승인한 최종 5개 UUID와 요청 제품이 다릅니다.");
}
export function publishSelectedFive(storage: Store, manifest: SelectedFiveManifest) {
  assertSelectionRun(storage, manifest);
  validateSelectedFive(manifest, manifest);
  storage.setItem(SELECTED_FIVE_KEY, JSON.stringify(manifest));
}
export function selectEligibleFive<T extends SelectionRun & {
  dbProductId: string; originProductNo: number; productName: string; reviews: string[];
}>(pool: T[], run: SelectionRun): T[] {
  const ids = new Set<string>(), origins = new Set<number>(), selected: T[] = [];
  for (const p of pool) {
    if (p.runId !== run.runId || p.category !== run.category || !UUID_PATTERN.test(p.dbProductId) ||
        !Number.isSafeInteger(p.originProductNo) || p.originProductNo <= 0 || !text(p.productName) ||
        !Array.isArray(p.reviews) || p.reviews.length < 30 || p.reviews.length > 1000 ||
        p.reviews.some(r => typeof r !== "string" || !r.trim()) ||
        ids.has(p.dbProductId.toLowerCase()) || origins.has(p.originProductNo)) continue;
    selected.push(p); ids.add(p.dbProductId.toLowerCase()); origins.add(p.originProductNo);
    if (selected.length === 5) return selected;
  }
  throw new Error("현재 실행에서 DB 매핑과 리뷰가 준비된 고유 제품 5개를 확보하지 못했습니다.");
}
export async function fetchCategoryProfile(category: string): Promise<Record<string, unknown>> {
  const response = await fetch("/api/category-profile?category=" + encodeURIComponent(category), { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data.success !== true || data.profile?.category !== category) throw new Error(data.message ?? "프로필을 확인하지 못했습니다.");
  categoryProfileRevision(data.profile);
  return data.profile;
}
export type SelectedCatalogProduct = {
  id: string; originProductNo: number; category: string; productName: string;
  sourceUrl: string; price: string; representativeImageUrl: string; analyzed: boolean;
};
export async function loadSelectedFiveContext(storage: Store, category?: string, expectedIdentity?: string) {
  const manifest = readSelectedFive(storage, category);
  const identity = selectedFiveIdentity(manifest);
  if (expectedIdentity !== undefined && identity !== expectedIdentity) throw new Error("최종 5개 선택이 변경되었습니다. 다시 시작해 주세요.");
  const profile = await fetchCategoryProfile(manifest.category);
  validateSelectedFive(manifest, manifest, categoryProfileRevision(profile));
  const params = new URLSearchParams({ category: manifest.category, analyzedOnly: "true", productIds: selectedFiveIds(manifest).join(",") });
  const response = await fetch("/api/catalog-products?" + params, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data.success !== true || !Array.isArray(data.products) || data.products.length !== 5) throw new Error(data.message ?? "최종 제품을 확인하지 못했습니다.");
  const rows = data.products as SelectedCatalogProduct[];
  const products = manifest.products.map(p => {
    const matches = rows.filter(row => row.id === p.dbProductId);
    if (matches.length !== 1 || matches[0].category !== manifest.category ||
        matches[0].originProductNo !== p.originProductNo || matches[0].productName !== p.productName ||
        matches[0].analyzed !== true) throw new Error("최종 제품의 DB identity 또는 준비 상태가 변경되었습니다.");
    return matches[0];
  });
  if (selectedFiveIdentity(readSelectedFive(storage, manifest.category)) !== identity) throw new Error("확인 도중 선택 실행이 변경되었습니다.");
  return { manifest, identity, profile, products };
}
