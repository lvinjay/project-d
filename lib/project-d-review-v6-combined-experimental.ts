import { createHash } from "node:crypto";
import OpenAI from "openai";
import {
  ProductionPipelineError,
  type ProductionDynamicCriterion,
  type ProductionUsage,
  type ProductionCriterionEvidence,
} from "./project-d-review-production-pipeline";

export const EXPERIMENTAL_V6_COMBINED_PIPELINE_VERSION =
  "stage0-v6-combined-dynamic-c1c5-v3-production";

export const EXPERIMENTAL_V6_REVIEW_QUALITY_SOURCE =
  "stage0-v6-combined-compatibility-mapping-v1";

export const EXPERIMENTAL_V6_COMBINED_MODEL =
  process.env.REVIEW_ANALYSIS_BATCH_MODEL?.trim() || "gpt-5-mini";

const REVIEW_TEXT_LIMIT = 5000;
const MAX_SEGMENT_LENGTH = 180;
const MAX_SELECTED_SEGMENTS_PER_POLARITY = 2;
const REQUIRED_CRITERION_COUNT = 5;

type EligibilityValue =
  | "direct"
  | "indirect"
  | "spec_only"
  | "product_mismatch"
  | "uncertain";

type EligibilityReasonCode =
  | "direct_current_target_firsthand_concrete"
  | "other_person_only"
  | "spec_or_expectation_only"
  | "current_product_mismatch"
  | "contradictory_current_use"
  | "unverifiable_evidence_anchor"
  | "uncertain_identity_or_evidence";

type Segment = { id: string; text: string };
type ReviewEvidence = { n: number; segments: Segment[] };

type RawRow = {
  n: number;
  explicitCurrentProductMismatch: "present" | "none" | "uncertain";
  mismatchEvidenceSegmentId: string;
  currentTargetFirstHand: "operation" | "observation" | "none" | "uncertain";
  firstHandEvidenceSegmentId: string;
  experienceSource: "author" | "other_person" | "mixed" | "uncertain";
  concretePerformanceResult: "present" | "none" | "uncertain";
  performanceEvidenceSegmentId: string;
  explicitNotUsedCurrentProduct: "present" | "none" | "uncertain";
  notUsedEvidenceSegmentId: string;
  confidence: "high" | "medium" | "low";
  a: Array<{
    c: "c1" | "c2" | "c3" | "c4" | "c5";
    e: Array<{ s: string; v: "+" | "-" | "neutral" }>;
  }>;
};

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeUsageCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function readUsage(response: Record<string, unknown>): ProductionUsage {
  const usage = asRecord(response.usage);
  const inputDetails = asRecord(usage?.input_tokens_details);
  const outputDetails = asRecord(usage?.output_tokens_details);
  return {
    callCount: 1,
    model: EXPERIMENTAL_V6_COMBINED_MODEL,
    inputTokens: safeUsageCount(usage?.input_tokens),
    cachedInputTokens: safeUsageCount(inputDetails?.cached_tokens),
    outputTokens: safeUsageCount(usage?.output_tokens),
    reasoningTokens: safeUsageCount(outputDetails?.reasoning_tokens),
    totalTokens: safeUsageCount(usage?.total_tokens),
  };
}

function splitLongSegment(value: string) {
  const result: string[] = [];
  let remaining = cleanText(value);
  while (remaining) {
    const chars = Array.from(remaining);
    if (chars.length <= MAX_SEGMENT_LENGTH) {
      result.push(remaining);
      break;
    }
    let cut = MAX_SEGMENT_LENGTH;
    for (let i = MAX_SEGMENT_LENGTH - 1; i >= 80; i--) {
      if (/[.!?。！？,;:，；：]/u.test(chars[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut === MAX_SEGMENT_LENGTH) {
      for (let i = MAX_SEGMENT_LENGTH - 1; i >= 80; i--) {
        if (/\s/u.test(chars[i])) {
          cut = i;
          break;
        }
      }
    }
    const part = cleanText(chars.slice(0, cut).join(""));
    if (part) result.push(part);
    remaining = cleanText(chars.slice(cut).join(""));
  }
  return result;
}

function buildReviewSegments(rawReview: unknown, reviewNumber: number): Segment[] {
  const cleaned = cleanText(rawReview).slice(0, REVIEW_TEXT_LIMIT);
  const roughSegments = cleaned
    .split(/(?<=[.!?。！？])\s+|\n+|(?=\s*[■●◆◇▶▷✔✅☑★☆⭐①②③④⑤⑥⑦⑧⑨⑩]\s*)/u)
    .map(value => value.trim())
    .filter(Boolean);
  const parts: string[] = [];
  for (const rough of roughSegments) parts.push(...splitLongSegment(rough));
  if (parts.length === 0 && cleaned) parts.push(...splitLongSegment(cleaned));
  return parts.map((text, index) => ({ id: `R${reviewNumber}S${index + 1}`, text }));
}

function prepareEvidence(rawReviews: unknown[], reviewStart: number, reviewEnd: number) {
  const evidence: ReviewEvidence[] = [];
  for (let n = reviewStart; n <= reviewEnd; n++) {
    const segments = buildReviewSegments(rawReviews[n - 1], n);
    if (segments.length === 0) {
      throw new ProductionPipelineError("V6 combined review segmentation failed.", {
        stage: "precheck",
        paidApiCalls: 0,
        message: `R${n} has no usable segments.`,
      });
    }
    evidence.push({ n, segments });
  }
  return evidence;
}

function criterionAlias(index: number) {
  return `c${index + 1}` as "c1" | "c2" | "c3" | "c4" | "c5";
}

function buildPrompt(
  category: string,
  productName: string,
  criteria: ProductionDynamicCriterion[],
  evidence: ReviewEvidence[],
  reviewStart: number,
  reviewEnd: number,
) {
  const criterionText = criteria
    .map((criterion, index) => [
      `${criterionAlias(index)} = ${criterion.key}`,
      `label: ${criterion.label}`,
      `shortDescription: ${criterion.shortDescription || "(없음)"}`,
      `helpText: ${criterion.helpText || "(없음)"}`,
    ].join("\n"))
    .join("\n\n");

  const reviewText = evidence
    .map(review => [
      `REVIEW ${review.n}`,
      ...review.segments.map(segment => `${segment.id}: ${segment.text}`),
    ].join("\n"))
    .join("\n\n");

  return [
    "당신은 Project D V6 실험용 통합 리뷰 판정 엔진입니다.",
    "한 번의 응답에서 각 리뷰의 Stage0 사실 판정과 c1-c5 직접근거 event를 함께 반환합니다. 최종 eligibility는 AI가 결정하지 않고 서버가 사실+서버 소유 segment anchor로 다시 계산합니다.",
    `카테고리: ${category}`,
    `대상 상품: ${productName}`,
    `리뷰 범위: R${reviewStart}-R${reviewEnd}`,
    "구매기준:",
    criterionText,
    "STAGE0 FACT POLICY:",
    "explicitCurrentProductMismatch: 현재 대상 제품이 아니라는 명시 근거가 있을 때만 present. present이면 mismatchEvidenceSegmentId를 반드시 선택하세요.",
    "currentTargetFirstHand: 작성자가 현재 대상 제품을 실제 조작/사용하면 operation, 실제 작동·성능을 직접 목격하면 observation. 단순 구매/배송/개봉/설치 위치/다른 사람 반응은 first-hand가 아닙니다. operation/observation이면 firstHandEvidenceSegmentId를 반드시 선택하세요.",
    "concretePerformanceResult: 현재 대상 제품 작동 뒤 청소 결과, 흡입/제거, 소음, 배터리, 조작, 오류, 실패, 유지관리 등 구체적인 실제 결과가 있으면 present. present이면 performanceEvidenceSegmentId를 반드시 선택하세요.",
    "explicitNotUsedCurrentProduct: 현재 제품을 아직 사용/작동하지 않았다고 명시하면 present. present이면 notUsedEvidenceSegmentId를 반드시 선택하세요.",
    "experienceSource는 author/other_person/mixed/uncertain 중 하나입니다.",
    "none/uncertain인 fact의 evidenceSegmentId는 빈 문자열이어야 합니다. 존재하지 않는 segment ID를 만들지 마세요.",
    "CRITERION EVENT POLICY:",
    "Stage0 facts가 first-hand 실제 사용/관찰 + concrete actual result를 분명히 뒷받침하는 리뷰에서만 c1-c5 event를 선택하세요. 그 조건을 충족하지 않는 리뷰의 모든 criterion e는 빈 배열이어야 합니다. 특히 experienceSource=other_person 이고 currentTargetFirstHand=none 이면 모든 criterion e는 반드시 빈 배열이어야 합니다.",
    "각 criterion event는 current-target actual-use gate, criterion-fit gate, actual-result gate를 모두 통과해야 합니다. 기능 존재, 스펙, 광고, 배송, 가격, 디자인, 일반 만족, 미래 기대만으로 근거를 만들지 마세요.",
    "+는 해당 criterion의 실제 긍정 결과, -는 실패/제약/불편/부정 결과, neutral은 criterion과 직접 관련되지만 제품 성공/실패로 귀속할 수 없는 비방향성 실제 맥락입니다.",
    "각 criterion에는 가장 직접적인 근거를 polarity별 최대 2개까지만 선택하세요. 같은 criterion에서 실제 긍정과 부정이 모두 있으면 둘 다 유지하세요.",
    "모든 REVIEW마다 c1,c2,c3,c4,c5를 정확히 한 번씩 반환하세요.",
    "입력 리뷰:",
    reviewText,
    "JSON schema에 맞는 JSON만 반환하세요.",
  ].join("\n\n");
}

function buildSchema(reviewStart: number, reviewEnd: number, reviewCount: number) {
  const eventSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      s: { type: "string", pattern: "^R[0-9]+S[0-9]+$", maxLength: 32 },
      v: { type: "string", enum: ["+", "-", "neutral"] },
    },
    required: ["s", "v"],
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      reviewRows: {
        type: "array",
        minItems: reviewCount,
        maxItems: reviewCount,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            n: { type: "integer", minimum: reviewStart, maximum: reviewEnd },
            explicitCurrentProductMismatch: { type: "string", enum: ["present", "none", "uncertain"] },
            mismatchEvidenceSegmentId: { type: "string", pattern: "^$|^R[0-9]+S[0-9]+$", maxLength: 32 },
            currentTargetFirstHand: { type: "string", enum: ["operation", "observation", "none", "uncertain"] },
            firstHandEvidenceSegmentId: { type: "string", pattern: "^$|^R[0-9]+S[0-9]+$", maxLength: 32 },
            experienceSource: { type: "string", enum: ["author", "other_person", "mixed", "uncertain"] },
            concretePerformanceResult: { type: "string", enum: ["present", "none", "uncertain"] },
            performanceEvidenceSegmentId: { type: "string", pattern: "^$|^R[0-9]+S[0-9]+$", maxLength: 32 },
            explicitNotUsedCurrentProduct: { type: "string", enum: ["present", "none", "uncertain"] },
            notUsedEvidenceSegmentId: { type: "string", pattern: "^$|^R[0-9]+S[0-9]+$", maxLength: 32 },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            a: {
              type: "array",
              minItems: REQUIRED_CRITERION_COUNT,
              maxItems: REQUIRED_CRITERION_COUNT,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  c: { type: "string", enum: ["c1", "c2", "c3", "c4", "c5"] },
                  e: { type: "array", maxItems: 12, items: eventSchema },
                },
                required: ["c", "e"],
              },
            },
          },
          required: [
            "n", "explicitCurrentProductMismatch", "mismatchEvidenceSegmentId",
            "currentTargetFirstHand", "firstHandEvidenceSegmentId", "experienceSource",
            "concretePerformanceResult", "performanceEvidenceSegmentId",
            "explicitNotUsedCurrentProduct", "notUsedEvidenceSegmentId", "confidence", "a",
          ],
        },
      },
    },
    required: ["reviewRows"],
  };
}

function resolveSegment(review: ReviewEvidence, id: string) {
  if (!id || !id.startsWith(`R${review.n}S`)) return "";
  return review.segments.find(segment => segment.id === id)?.text ?? "";
}

function deriveEligibility(row: RawRow, review: ReviewEvidence): { e: EligibilityValue; reasonCode: EligibilityReasonCode } {
  const mismatchVerified = !!resolveSegment(review, row.mismatchEvidenceSegmentId);
  const firstHandVerified = !!resolveSegment(review, row.firstHandEvidenceSegmentId);
  const performanceVerified = !!resolveSegment(review, row.performanceEvidenceSegmentId);
  const notUsedVerified = !!resolveSegment(review, row.notUsedEvidenceSegmentId);

  const requireAnchor = (claim: boolean, id: string, verified: boolean, label: string) => {
    if (claim && (!id || !verified)) throw new Error(`R${row.n}: ${label} requires a valid same-review segment anchor.`);
    if (!claim && id) throw new Error(`R${row.n}: ${label} anchor must be empty when the fact is not asserted.`);
  };

  requireAnchor(row.explicitCurrentProductMismatch === "present", row.mismatchEvidenceSegmentId, mismatchVerified, "mismatch");
  requireAnchor(row.currentTargetFirstHand === "operation" || row.currentTargetFirstHand === "observation", row.firstHandEvidenceSegmentId, firstHandVerified, "firstHand");
  requireAnchor(row.concretePerformanceResult === "present", row.performanceEvidenceSegmentId, performanceVerified, "performance");
  requireAnchor(row.explicitNotUsedCurrentProduct === "present", row.notUsedEvidenceSegmentId, notUsedVerified, "notUsed");

  const firstHand = (row.currentTargetFirstHand === "operation" || row.currentTargetFirstHand === "observation") && firstHandVerified;
  const performance = row.concretePerformanceResult === "present" && performanceVerified;
  const notUsed = row.explicitNotUsedCurrentProduct === "present" && notUsedVerified;

  if (row.explicitCurrentProductMismatch === "present" && mismatchVerified) return { e: "product_mismatch", reasonCode: "current_product_mismatch" };
  if (notUsed && (firstHand || performance)) return { e: "uncertain", reasonCode: "contradictory_current_use" };
  if (notUsed && row.currentTargetFirstHand === "none" && row.concretePerformanceResult === "none") return { e: "spec_only", reasonCode: "spec_or_expectation_only" };
  if (firstHand && performance) return { e: "direct", reasonCode: "direct_current_target_firsthand_concrete" };
  if (row.experienceSource === "other_person" && row.currentTargetFirstHand === "none") return { e: "indirect", reasonCode: "other_person_only" };
  if (row.concretePerformanceResult === "none") return { e: "spec_only", reasonCode: "spec_or_expectation_only" };
  const missingPositiveAnchor = ((row.currentTargetFirstHand === "operation" || row.currentTargetFirstHand === "observation") && !firstHandVerified) ||
    (row.concretePerformanceResult === "present" && !performanceVerified);
  return { e: "uncertain", reasonCode: missingPositiveAnchor ? "unverifiable_evidence_anchor" : "uncertain_identity_or_evidence" };
}

function validateAndAdapt(
  raw: Record<string, unknown>,
  evidence: ReviewEvidence[],
  criteria: ProductionDynamicCriterion[],
) {
  const rows = raw.reviewRows;
  if (!Array.isArray(rows) || rows.length !== evidence.length) throw new Error("V6 combined row count mismatch.");
  const evidenceByReview = new Map(evidence.map(review => [review.n, review]));
  const seen = new Set<number>();
  const aliases = criteria.map((_, index) => criterionAlias(index));
  const criterionState = Object.fromEntries(criteria.map(criterion => [criterion.key, {
    evidenceReviewNumbers: [] as number[], positiveReviewNumbers: [] as number[], negativeReviewNumbers: [] as number[],
    mixedReviewNumbers: [] as number[], neutralReviewNumbers: [] as number[],
    evidenceExcerpts: [] as Array<{ reviewNumber: number; polarity: "+" | "-" | "0"; quote: string }>,
  }]));
  const eligibilityCounts: Record<EligibilityValue, number> = { direct: 0, indirect: 0, spec_only: 0, product_mismatch: 0, uncertain: 0 };
  let acceptedEvidenceCount = 0;
  let droppedNonDirectCriterionEventCount = 0;
  const droppedNonDirectCriterionReviewNumbers: number[] = [];

  for (const item of rows) {
    const record = asRecord(item);
    if (!record) throw new Error("V6 combined row must be an object.");
    const row = record as unknown as RawRow;
    if (!Number.isSafeInteger(row.n) || seen.has(row.n) || !evidenceByReview.has(row.n)) throw new Error("V6 combined review number invalid or duplicated.");
    seen.add(row.n);
    const review = evidenceByReview.get(row.n)!;
    const derived = deriveEligibility(row, review);
    eligibilityCounts[derived.e]++;

    if (!Array.isArray(row.a) || row.a.length !== REQUIRED_CRITERION_COUNT) throw new Error(`R${row.n}: exactly five criterion slots required.`);
    const slotByAlias = new Map<string, RawRow["a"][number]>();
    for (const slot of row.a) {
      if (!slot || !aliases.includes(slot.c) || slotByAlias.has(slot.c) || !Array.isArray(slot.e)) throw new Error(`R${row.n}: invalid or duplicate criterion slot.`);
      slotByAlias.set(slot.c, slot);
    }
    for (let index = 0; index < criteria.length; index++) {
      const alias = aliases[index];
      const slot = slotByAlias.get(alias);
      if (!slot) throw new Error(`R${row.n}: missing ${alias}.`);
      if (
        derived.e !== "direct" &&
        slot.e.length > 0
      ) {
        droppedNonDirectCriterionEventCount +=
          slot.e.length;

        droppedNonDirectCriterionReviewNumbers.push(
          row.n,
        );

        continue;
      }

      const ids: Record<"+" | "-" | "neutral", string[]> = { "+": [], "-": [], neutral: [] };
      const seenEvents = new Set<string>();
      for (const event of slot.e) {
        if (!event || typeof event.s !== "string" || !["+", "-", "neutral"].includes(event.v)) throw new Error(`R${row.n}: invalid criterion event.`);
        const quote = resolveSegment(review, event.s);
        if (!quote) throw new Error(`R${row.n}: invalid cross-review or unknown criterion segment ${event.s}.`);
        const key = `${event.s}:${event.v}`;
        if (seenEvents.has(key)) continue;
        seenEvents.add(key);
        ids[event.v].push(event.s);
      }
      const directional = new Set([...ids["+"], ...ids["-"]]);
      if (ids.neutral.some(id => directional.has(id))) throw new Error(`R${row.n}: neutral event overlaps directional evidence.`);
      const positiveIds = ids["+"].slice(0, MAX_SELECTED_SEGMENTS_PER_POLARITY);
      const negativeIds = ids["-"].slice(0, MAX_SELECTED_SEGMENTS_PER_POLARITY);
      const neutralIds = ids.neutral.slice(0, MAX_SELECTED_SEGMENTS_PER_POLARITY);
      const hasPositive = positiveIds.length > 0;
      const hasNegative = negativeIds.length > 0;
      const hasNeutral = neutralIds.length > 0;
      const state = criterionState[criteria[index].key];
      if (hasPositive || hasNegative || hasNeutral) state.evidenceReviewNumbers.push(row.n);
      if (hasPositive && hasNegative) state.mixedReviewNumbers.push(row.n);
      else if (hasPositive) state.positiveReviewNumbers.push(row.n);
      else if (hasNegative) state.negativeReviewNumbers.push(row.n);
      else if (hasNeutral) state.neutralReviewNumbers.push(row.n);
      for (const id of positiveIds) state.evidenceExcerpts.push({ reviewNumber: row.n, polarity: "+", quote: resolveSegment(review, id) });
      for (const id of negativeIds) state.evidenceExcerpts.push({ reviewNumber: row.n, polarity: "-", quote: resolveSegment(review, id) });
      for (const id of neutralIds) state.evidenceExcerpts.push({ reviewNumber: row.n, polarity: "0", quote: resolveSegment(review, id) });
      acceptedEvidenceCount += positiveIds.length + negativeIds.length + neutralIds.length;
    }
  }

  if (seen.size !== evidence.length) throw new Error("V6 combined review classification completeness failed.");
  const unique = (values: number[]) => Array.from(new Set(values)).sort((a, b) => a - b);
  const criterionEvidence = Object.fromEntries(criteria.map(criterion => {
    const state = criterionState[criterion.key];
    const evidenceReviewNumbers = unique(state.evidenceReviewNumbers);
    const positiveReviewNumbers = unique(state.positiveReviewNumbers);
    const negativeReviewNumbers = unique(state.negativeReviewNumbers);
    const mixedReviewNumbers = unique(state.mixedReviewNumbers);
    const neutralReviewNumbers = unique(state.neutralReviewNumbers);
    return [criterion.key, {
      reviewEvidenceCount: evidenceReviewNumbers.length,
      evidenceReviewNumbers,
      positiveReviewNumbers,
      negativeReviewNumbers,
      mixedReviewNumbers,
      neutralReviewNumbers,
      evidenceExcerpts: state.evidenceExcerpts,
      summary: `직접 근거 ${evidenceReviewNumbers.length}개: 긍정 ${positiveReviewNumbers.length}, 부정 ${negativeReviewNumbers.length}, 혼합 ${mixedReviewNumbers.length}, 중립 ${neutralReviewNumbers.length}.`,
    } satisfies ProductionCriterionEvidence];
  })) as Record<string, ProductionCriterionEvidence>;

  return {
    eligibilityCounts,
    criterionEvidence,
    acceptedEvidenceCount,
    droppedNonDirectCriterionEventCount,
    droppedNonDirectCriterionReviewNumbers:
      Array.from(
        new Set(
          droppedNonDirectCriterionReviewNumbers,
        ),
      ).sort(
        (
          left,
          right,
        ) =>
          left -
          right,
      ),
  };
}

export function createExperimentalV6CombinedFingerprint(input: {
  category: string;
  productName: string;
  dbProductId: string;
  originProductNo: number;
  rawReviews: unknown[];
  collectionStats: unknown;
  criteria: ProductionDynamicCriterion[];
}) {
  return createHash("sha256").update(JSON.stringify({
    version: EXPERIMENTAL_V6_COMBINED_PIPELINE_VERSION,
    model: EXPERIMENTAL_V6_COMBINED_MODEL,
    reviewTextLimit: REVIEW_TEXT_LIMIT,
    maxSegmentLength: MAX_SEGMENT_LENGTH,
    category: input.category,
    productName: input.productName,
    dbProductId: input.dbProductId,
    originProductNo: input.originProductNo,
    rawReviews: input.rawReviews,
    collectionStats: input.collectionStats,
    criteria: input.criteria,
  }), "utf8").digest("hex");
}

export function createExperimentalV6CombinedDryRun(input: {
  rawReviews: unknown[];
  reviewStart: number;
  reviewEnd: number;
  criteria: ProductionDynamicCriterion[];
}) {
  if (input.criteria.length !== REQUIRED_CRITERION_COUNT || new Set(input.criteria.map(row => row.key.trim())).size !== REQUIRED_CRITERION_COUNT) {
    throw new ProductionPipelineError("V6 combined requires exactly five unique criteria.", { stage: "precheck", paidApiCalls: 0, message: "Exactly five criteria are required." });
  }
  if (input.reviewStart < 1 || input.reviewEnd < input.reviewStart || input.reviewEnd > input.rawReviews.length || input.reviewEnd - input.reviewStart + 1 > 100) {
    throw new ProductionPipelineError("V6 combined range invalid.", { stage: "precheck", paidApiCalls: 0, message: "V6 combined supports one contiguous batch of at most 100 reviews." });
  }
  prepareEvidence(input.rawReviews, input.reviewStart, input.reviewEnd);
  return { success: true, paidApiCalls: 0, maximumPaidApiCalls: 1, model: EXPERIMENTAL_V6_COMBINED_MODEL };
}

export async function runExperimentalV6CombinedBatch(input: {
  apiKey: string;
  category: string;
  productName: string;
  dbProductId: string;
  originProductNo: number;
  rawReviews: unknown[];
  reviewStart: number;
  reviewEnd: number;
  criteria: ProductionDynamicCriterion[];
}) {
  createExperimentalV6CombinedDryRun(input);
  const evidence = prepareEvidence(input.rawReviews, input.reviewStart, input.reviewEnd);
  const prompt = buildPrompt(input.category, input.productName, input.criteria, evidence, input.reviewStart, input.reviewEnd);
  const schema = buildSchema(input.reviewStart, input.reviewEnd, evidence.length);
  const client = new OpenAI({ apiKey: input.apiKey, maxRetries: 0 });
  let response: Awaited<ReturnType<typeof client.responses.create>>;
  try {
    response = await client.responses.create({
      model: EXPERIMENTAL_V6_COMBINED_MODEL,
      input: prompt,
      text: { format: { type: "json_schema", name: "project_d_review_v6_combined_canary", strict: true, schema } },
    });
  } catch (error) {
    throw new ProductionPipelineError("V6 combined OpenAI request failed.", {
      stage: "criteria_openai", paidApiCalls: 1,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const responseRecord = response as unknown as Record<string, unknown>;
  const outputText = typeof response.output_text === "string" ? response.output_text.trim() : "";
  const responseMeta = { id: cleanText(responseRecord.id), status: cleanText(responseRecord.status) };
  const usage = readUsage(responseRecord);
  if (!outputText) {
    throw new ProductionPipelineError("V6 combined response body is empty.", {
      stage: "criteria_output", paidApiCalls: 1, message: "V6 combined AI 응답 본문이 없습니다.",
      openAiResponse: responseMeta, apiUsage: usage, rawModelOutputText: outputText,
    });
  }
  let rawModelAnalysis: Record<string, unknown>;
  try {
    rawModelAnalysis = JSON.parse(outputText) as Record<string, unknown>;
  } catch (error) {
    throw new ProductionPipelineError("V6 combined JSON parse failed.", {
      stage: "criteria_parse", paidApiCalls: 1, message: error instanceof Error ? error.message : String(error),
      openAiResponse: responseMeta, apiUsage: usage, rawModelOutputText: outputText,
    });
  }
  let adapted: ReturnType<typeof validateAndAdapt>;
  try {
    adapted = validateAndAdapt(rawModelAnalysis, evidence, input.criteria);
  } catch (error) {
    throw new ProductionPipelineError("V6 combined server validation failed.", {
      stage: "criteria_validation", paidApiCalls: 1, message: error instanceof Error ? error.message : String(error),
      openAiResponse: responseMeta, apiUsage: usage, rawModelAnalysis, rawModelOutputText: outputText,
    });
  }

  const direct = adapted.eligibilityCounts.direct;
  const specOnly = adapted.eligibilityCounts.spec_only;
  const low = adapted.eligibilityCounts.indirect + adapted.eligibilityCounts.product_mismatch + adapted.eligibilityCounts.uncertain;
  const reviewCount = evidence.length;
  const reviewQuality = { highInformationReviews: direct, lowInformationReviews: low, promotionalStyleReviews: specOnly };
  const qualityCount = direct + low + specOnly;
  if (qualityCount !== reviewCount) throw new ProductionPipelineError("V6 combined quality count mismatch.", {
    stage: "adapter", paidApiCalls: 1, message: `quality count ${qualityCount} != ${reviewCount}`,
  });

  return {
    success: true,
    pipelineVersion: EXPERIMENTAL_V6_COMBINED_PIPELINE_VERSION,
    reviewQualitySource: EXPERIMENTAL_V6_REVIEW_QUALITY_SOURCE,
    reviewStart: input.reviewStart,
    reviewEnd: input.reviewEnd,
    reviewCount,
    eligibilityCounts: adapted.eligibilityCounts,
    criterionEvidence: adapted.criterionEvidence,
    reviewQuality,
    reviewQualityAudit: {
      expectedReviewCount: reviewCount,
      classifiedReviewCount: qualityCount,
      mutuallyExclusive: true,
      countValid: true,
      source: EXPERIMENTAL_V6_REVIEW_QUALITY_SOURCE,
    },
    classificationAudit: {
      complete: true,
      acceptedEvidenceCount: adapted.acceptedEvidenceCount,
      candidateUnaccountedCount: 0,
      invalidRejectedCandidateCount: 0,
      invalidSegmentReferenceCount: 0,
      nonDirectCriterionEventsDiscarded:
        adapted.droppedNonDirectCriterionEventCount,
      nonDirectCriterionReviewsDiscarded:
        adapted.droppedNonDirectCriterionReviewNumbers,
      source: EXPERIMENTAL_V6_COMBINED_PIPELINE_VERSION,
    },
    semanticVersions: {
      combined: {
        engineVersion: EXPERIMENTAL_V6_COMBINED_PIPELINE_VERSION,
        decisionPolicyVersion: "stage0-server-derived-plus-c1c5-events-v1",
        segmentVersion: "shared-server-segment-anchor-v1",
        model: EXPERIMENTAL_V6_COMBINED_MODEL,
      },
    },
    rawModelAnalysis,
    rawModelOutputText: outputText,
    openAiResponse: responseMeta,
    apiUsage: usage,
    paidApiCalls: 1,
    dbReads: 0,
    dbWrites: 0,
  };
}
