export const V6_EXPERIMENTAL_ONLY =
  true as const;

export const V6_REVIEW_BATCH_SIZE =
  100;

export const V6_COMBINED_BATCH_MAX_OPENAI_CALLS =
  1;

export const V6_AGGREGATE_MAX_OPENAI_CALLS =
  1;

export type V6EligibilityValue =
  | "direct"
  | "indirect"
  | "spec_only"
  | "product_mismatch"
  | "uncertain";

export type V6EligibilityReasonCode =
  | "direct_current_target_firsthand_concrete"
  | "other_person_only"
  | "spec_or_expectation_only"
  | "current_product_mismatch"
  | "contradictory_current_use"
  | "unverifiable_evidence_anchor"
  | "uncertain_identity_or_evidence";

export type V6Stage0Fact = {
  explicitCurrentProductMismatch:
    | "present"
    | "none"
    | "uncertain";
  mismatchAnchorVerified: boolean;
  currentTargetFirstHand:
    | "operation"
    | "observation"
    | "none"
    | "uncertain";
  firstHandAnchorVerified: boolean;
  experienceSource:
    | "author"
    | "other_person"
    | "mixed"
    | "uncertain";
  concretePerformanceResult:
    | "present"
    | "none"
    | "uncertain";
  performanceAnchorVerified: boolean;
  explicitNotUsedCurrentProduct:
    | "present"
    | "none"
    | "uncertain";
  notUsedAnchorVerified: boolean;
};

export type V6CriterionEventSlot = {
  c: "c1" | "c2" | "c3" | "c4" | "c5";
  positiveSegmentIds: string[];
  negativeSegmentIds: string[];
  neutralSegmentIds: string[];
};

export type V6CombinedFixtureRow = {
  n: number;
  stage0: V6Stage0Fact;
  criteria: V6CriterionEventSlot[];
};

export type V6ValidatedCombinedRow = {
  n: number;
  eligibility: V6EligibilityValue;
  reasonCode: V6EligibilityReasonCode;
  criteria: V6CriterionEventSlot[];
  droppedNonDirectCriterionEventCount: number;
};

const EXPECTED_CRITERION_ALIASES =
  [
    "c1",
    "c2",
    "c3",
    "c4",
    "c5",
  ] as const;

function deriveV6Eligibility(
  row: V6Stage0Fact,
): {
  eligibility: V6EligibilityValue;
  reasonCode: V6EligibilityReasonCode;
} {
  const firstHand =
    (
      row.currentTargetFirstHand ===
        "operation" ||
      row.currentTargetFirstHand ===
        "observation"
    ) &&
    row.firstHandAnchorVerified;

  const performance =
    row.concretePerformanceResult ===
      "present" &&
    row.performanceAnchorVerified;

  const notUsed =
    row.explicitNotUsedCurrentProduct ===
      "present" &&
    row.notUsedAnchorVerified;

  if (
    row.explicitCurrentProductMismatch ===
      "present" &&
    row.mismatchAnchorVerified
  ) {
    return {
      eligibility:
        "product_mismatch",
      reasonCode:
        "current_product_mismatch",
    };
  }

  if (
    notUsed &&
    (
      firstHand ||
      performance
    )
  ) {
    return {
      eligibility:
        "uncertain",
      reasonCode:
        "contradictory_current_use",
    };
  }

  if (
    notUsed &&
    row.currentTargetFirstHand ===
      "none" &&
    row.concretePerformanceResult ===
      "none"
  ) {
    return {
      eligibility:
        "spec_only",
      reasonCode:
        "spec_or_expectation_only",
    };
  }

  if (
    firstHand &&
    performance
  ) {
    return {
      eligibility:
        "direct",
      reasonCode:
        "direct_current_target_firsthand_concrete",
    };
  }

  if (
    row.experienceSource ===
      "other_person" &&
    row.currentTargetFirstHand ===
      "none"
  ) {
    return {
      eligibility:
        "indirect",
      reasonCode:
        "other_person_only",
    };
  }

  if (
    row.concretePerformanceResult ===
      "none"
  ) {
    return {
      eligibility:
        "spec_only",
      reasonCode:
        "spec_or_expectation_only",
    };
  }

  const missingPositiveAnchor =
    (
      (
        row.currentTargetFirstHand ===
          "operation" ||
        row.currentTargetFirstHand ===
          "observation"
      ) &&
      !row.firstHandAnchorVerified
    ) ||
    (
      row.concretePerformanceResult ===
        "present" &&
      !row.performanceAnchorVerified
    );

  return {
    eligibility:
      "uncertain",
    reasonCode:
      missingPositiveAnchor
        ? "unverifiable_evidence_anchor"
        : "uncertain_identity_or_evidence",
  };
}

function hasAnyCriterionEvent(
  slot: V6CriterionEventSlot,
) {
  return (
    slot.positiveSegmentIds.length >
      0 ||
    slot.negativeSegmentIds.length >
      0 ||
    slot.neutralSegmentIds.length >
      0
  );
}

function validateCriterionSlots(
  reviewNumber: number,
  slots: V6CriterionEventSlot[],
) {
  if (
    !Array.isArray(
      slots,
    ) ||
    slots.length !==
      EXPECTED_CRITERION_ALIASES.length
  ) {
    throw new Error(
      `R${reviewNumber}: exactly five c1-c5 criterion slots are required.`,
    );
  }

  const seen =
    new Set<string>();

  for (
    const alias of
    EXPECTED_CRITERION_ALIASES
  ) {
    const slot =
      slots.find(
        value =>
          value?.c ===
          alias,
      );

    if (
      !slot ||
      seen.has(
        alias,
      )
    ) {
      throw new Error(
        `R${reviewNumber}: criterion slot ${alias} is missing or duplicated.`,
      );
    }

    for (
      const list of
      [
        slot.positiveSegmentIds,
        slot.negativeSegmentIds,
        slot.neutralSegmentIds,
      ]
    ) {
      if (
        !Array.isArray(
          list,
        ) ||
        list.some(
          value =>
            typeof value !==
              "string" ||
            !value.trim(),
        )
      ) {
        throw new Error(
          `R${reviewNumber}: criterion event IDs must be non-empty strings.`,
        );
      }
    }

    seen.add(
      alias,
    );
  }
}

export function validateV6CombinedFixture(
  rows: V6CombinedFixtureRow[],
  reviewStart: number,
  reviewEnd: number,
): V6ValidatedCombinedRow[] {
  if (
    !Number.isSafeInteger(
      reviewStart,
    ) ||
    !Number.isSafeInteger(
      reviewEnd,
    ) ||
    reviewStart <
      1 ||
    reviewEnd <
      reviewStart ||
    reviewEnd -
      reviewStart +
      1 >
      V6_REVIEW_BATCH_SIZE
  ) {
    throw new Error(
      "V6 fixture range must be a contiguous batch of at most 100 reviews.",
    );
  }

  const expectedCount =
    reviewEnd -
    reviewStart +
    1;

  if (
    !Array.isArray(
      rows,
    ) ||
    rows.length !==
      expectedCount
  ) {
    throw new Error(
      "V6 fixture must contain exactly one combined row per review.",
    );
  }

  const seen =
    new Set<number>();

  const validated =
    rows.map(
      row => {
        if (
          !row ||
          !Number.isSafeInteger(
            row.n,
          ) ||
          row.n <
            reviewStart ||
          row.n >
            reviewEnd ||
          seen.has(
            row.n,
          )
        ) {
          throw new Error(
            "V6 fixture review numbers must be unique and stay inside the approved range.",
          );
        }

        seen.add(
          row.n,
        );

        validateCriterionSlots(
          row.n,
          row.criteria,
        );

        const {
          eligibility,
          reasonCode,
        } =
          deriveV6Eligibility(
            row.stage0,
          );

        const droppedNonDirectCriterionEventCount =
          eligibility ===
            "direct"
            ? 0
            : row.criteria.reduce(
                (
                  sum,
                  slot,
                ) =>
                  sum +
                  slot.positiveSegmentIds.length +
                  slot.negativeSegmentIds.length +
                  slot.neutralSegmentIds.length,
                0,
              );

        const sanitizedCriteria =
          eligibility ===
            "direct"
            ? row.criteria
            : row.criteria.map(
                slot => ({
                  ...slot,
                  positiveSegmentIds:
                    [],
                  negativeSegmentIds:
                    [],
                  neutralSegmentIds:
                    [],
                }),
              );

        return {
          n:
            row.n,
          eligibility,
          reasonCode,
          criteria:
            sanitizedCriteria,
          droppedNonDirectCriterionEventCount,
        };
      },
    );

  validated.sort(
    (
      left,
      right,
    ) =>
      left.n -
      right.n,
  );

  for (
    let index =
      0;
    index <
      validated.length;
    index++
  ) {
    if (
      validated[index]
        .n !==
      reviewStart +
        index
    ) {
      throw new Error(
        "V6 fixture must classify every review exactly once without gaps.",
      );
    }
  }

  return validated;
}

export function buildV6ReviewCostPlan(
  reviewCount: number,
) {
  if (
    !Number.isSafeInteger(
      reviewCount,
    ) ||
    reviewCount <
      1
  ) {
    throw new Error(
      "reviewCount must be a positive safe integer.",
    );
  }

  const batchCount =
    Math.ceil(
      reviewCount /
        V6_REVIEW_BATCH_SIZE,
    );

  const combinedBatchMaxOpenAiCalls =
    batchCount *
    V6_COMBINED_BATCH_MAX_OPENAI_CALLS;

  const aggregateMaxOpenAiCalls =
    V6_AGGREGATE_MAX_OPENAI_CALLS;

  return {
    reviewCount,
    batchSize:
      V6_REVIEW_BATCH_SIZE,
    batchCount,
    combinedBatchMaxOpenAiCalls,
    aggregateMaxOpenAiCalls,
    reviewMaxOpenAiCalls:
      combinedBatchMaxOpenAiCalls +
      aggregateMaxOpenAiCalls,
  };
}

export function buildV6CategoryUpperBound(
  reviewCounts: number[],
  criteriaMaxOpenAiCalls:
    0 | 1,
  scoreMaxOpenAiCalls:
    0 | 1,
) {
  const reviewMaxOpenAiCalls =
    reviewCounts.reduce(
      (
        sum,
        reviewCount,
      ) =>
        sum +
        buildV6ReviewCostPlan(
          reviewCount,
        )
          .reviewMaxOpenAiCalls,
      0,
    );

  return {
    productCount:
      reviewCounts.length,
    reviewMaxOpenAiCalls,
    criteriaMaxOpenAiCalls,
    scoreMaxOpenAiCalls,
    totalMaxOpenAiCalls:
      reviewMaxOpenAiCalls +
      criteriaMaxOpenAiCalls +
      scoreMaxOpenAiCalls,
  };
}
