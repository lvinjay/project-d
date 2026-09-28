export const PRODUCT_SCORE_PROMPT_CHAR_LIMIT =
  140_000;

const TEXT_LIMIT = 520;
const OFFICIAL_CRITERION_LIMIT = 900;
const POINT_LIMIT = 320;

function text(
  value: unknown,
  limit = TEXT_LIMIT,
) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized =
    value
      .replace(/\s+/g, " ")
      .trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return (
    normalized.slice(
      0,
      Math.max(0, limit - 1),
    ) + "…"
  );
}

function record(
  value: unknown,
): Record<string, unknown> | null {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(
  value: unknown,
) {
  const numberValue =
    Number(value);

  return Number.isFinite(
    numberValue,
  )
    ? numberValue
    : null;
}

function compactUnknown(
  value: unknown,
  depth = 0,
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value === "string") {
    return text(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (depth >= 3) {
    return text(
      JSON.stringify(value),
      700,
    );
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 4)
      .map((item) =>
        compactUnknown(
          item,
          depth + 1,
        ),
      );
  }

  const row =
    record(value);

  if (!row) {
    return text(
      String(value),
    );
  }

  return Object.fromEntries(
    Object.entries(row)
      .slice(0, 12)
      .map(
        ([key, item]) => [
          key,
          compactUnknown(
            item,
            depth + 1,
          ),
        ],
      ),
  );
}

function boundedEvidence(
  value: unknown,
  limit:
    number,
) {
  const compact =
    compactUnknown(value);

  const serialized =
    JSON.stringify(compact);

  if (
    serialized.length <=
    limit
  ) {
    return compact;
  }

  return {
    excerpt:
      text(
        serialized,
        limit,
      ),
  };
}

function compactPointList(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 4)
    .map((item) => {
      const row =
        record(item);

      if (!row) {
        return {
          summary:
            text(
              String(item),
              POINT_LIMIT,
            ),
        };
      }

      return {
        topic:
          text(
            row.topic,
            100,
          ),
        summary:
          text(
            row.summary,
            POINT_LIMIT,
          ),
        evidenceCount:
          finiteNumber(
            row.evidenceCount ??
              row.reviewEvidenceCount,
          ),
      };
    });
}

function compactStringList(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) =>
      text(
        item,
        260,
      ),
    )
    .filter(Boolean)
    .slice(0, 4);
}

function compactReviewEvidence(
  value: unknown,
  criterionKeys:
    string[],
) {
  const row =
    record(value);

  if (!row) {
    return null;
  }

  const criterionRow =
    record(
      row.criterionEvidence ??
        row.criterion_evidence,
    ) ?? {};

  const criterionEvidence =
    Object.fromEntries(
      criterionKeys.map(
        (key) => {
          const item =
            record(
              criterionRow[key],
            ) ?? {};

          return [
            key,
            {
              reviewEvidenceCount:
                finiteNumber(
                  item.reviewEvidenceCount ??
                    item.evidenceCount,
                ) ?? 0,
              summary:
                text(
                  item.summary,
                  460,
                ),
              positiveCount:
                Array.isArray(
                  item.positiveReviewNumbers,
                )
                  ? item
                      .positiveReviewNumbers
                      .length
                  : null,
              negativeCount:
                Array.isArray(
                  item.negativeReviewNumbers,
                )
                  ? item
                      .negativeReviewNumbers
                      .length
                  : null,
              mixedCount:
                Array.isArray(
                  item.mixedReviewNumbers,
                )
                  ? item
                      .mixedReviewNumbers
                      .length
                  : null,
            },
          ];
        },
      ),
    );

  return {
    reviewCount:
      finiteNumber(
        row.reviewCount ??
          row.review_count,
      ),
    summary:
      text(
        row.summary,
        700,
      ),
    positivePoints:
      compactPointList(
        row.positivePoints ??
          row.positive_points,
      ),
    negativePoints:
      compactPointList(
        row.negativePoints ??
          row.negative_points,
      ),
    cautions:
      compactStringList(
        row.cautions,
      ),
    bestFor:
      compactStringList(
        row.bestFor ??
          row.best_for,
      ),
    notFor:
      compactStringList(
        row.notFor ??
          row.not_for,
      ),
    confidenceScore:
      finiteNumber(
        row.confidenceScore ??
          row.confidence_score,
      ),
    reviewQuality:
      boundedEvidence(
        row.reviewQuality ??
          row.review_quality ??
          {},
        600,
      ),
    criterionEvidence,
  };
}

export function buildProductScoreEvidenceProducts(
  products:
    Array<Record<string, unknown>>,
  criterionKeys:
    string[],
) {
  return products.map(
    (product) => {
      const detail =
        record(
          product.product_detail_analysis,
        );

      const evaluation =
        record(
          detail?.evaluationEvidence ??
            detail?.evaluation_evidence,
        ) ?? {};

      const officialEvidence =
        Object.fromEntries(
          criterionKeys.map(
            (key) => [
              key,
              boundedEvidence(
                evaluation[key],
                OFFICIAL_CRITERION_LIMIT,
              ),
            ],
          ),
        );

      return {
        productId:
          text(
            product.id,
            80,
          ),
        productName:
          text(
            product.product_name,
            160,
          ),
        sourceUrl:
          text(
            product.source_url,
            360,
          ),
        officialEvidence,
        reviewEvidence:
          compactReviewEvidence(
            product.review_analysis,
            criterionKeys,
          ),
      };
    },
  );
}

export function buildProductScorePrompt(
  args: {
    category: string;
    criteria:
      Array<Record<string, unknown>>;
    evidenceProducts:
      Array<Record<string, unknown>>;
    criterionKeys:
      string[];
  },
) {
  const {
    category,
    criteria,
    evidenceProducts,
    criterionKeys,
  } = args;

  return `
당신은 Project D의 제품 상대평가 엔진입니다.

카테고리:
${category}

현재 카테고리의 핵심 구매기준:
${JSON.stringify(criteria)}

비교 대상 제품과 압축된 실제 근거:
${JSON.stringify(evidenceProducts)}

평가 목표:
같은 카테고리의 모든 비교 대상 제품을 서로 직접 비교하여
각 제품을 각 구매기준별로 0~100점으로 평가하세요.

중요 원칙:
1. 모든 제품을 같은 기준과 같은 척도로 평가하세요.
2. officialEvidence와 reviewEvidence에 포함된 근거만 사용하세요.
3. officialEvidence는 현재 criteria key와 직접 대응하는 공식 상세페이지 근거입니다.
4. reviewEvidence가 비어 있어도 officialEvidence가 구체적이면 공식 근거만으로 보수적으로 평가할 수 있습니다.
5. officialEvidence와 reviewEvidence 모두 근거가 없을 때만 null을 사용하세요.
6. 근거가 없는 사양이나 성능은 추측하지 마세요.
7. 일반 광고문구보다 구체적 수치·기능과 반복 리뷰 근거를 중요하게 보세요.
8. 한두 리뷰의 문제는 과도하게 반영하지 말고 반복 근거를 우선하세요.
9. 공통 문제는 특정 제품만 과도하게 감점하지 마세요.
10. 제품별 반복적인 고유 오류·불편은 해당 기준 점수에 반영하세요.
11. 현재 비교 대상 제품 사이의 상대적 차이가 드러나도록 평가하되 억지 점수차는 만들지 마세요.
12. 가격은 구매기준에 포함되지 않았다면 임의 반영하지 마세요.
13. 리뷰 수는 신뢰성 보조근거이지 제품 성능 자체가 아닙니다.
14. criterionReasons는 제품 간 차이를 중심으로 1~2문장으로 설명하세요.
15. 반드시 아래 criteria key만 사용하세요:
${criterionKeys.join(", ")}
16. JSON만 출력하세요. 마크다운은 사용하지 마세요.

반환 형식:
{
  "products": [
    {
      "productId": "입력으로 제공된 실제 UUID productId",
      "criterionScores": {
        "${criterionKeys[0] ?? "criterion_1"}": 0
      },
      "criterionReasons": {
        "${criterionKeys[0] ?? "criterion_1"}": "점수 근거"
      }
    }
  ]
}

criterionScores와 criterionReasons에는 위 criteria key를 전부 포함하세요.
반드시 비교 대상 모든 제품을 반환하세요.
`.trim();
}
