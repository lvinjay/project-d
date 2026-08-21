import OpenAI from "openai";
import {
  createHash,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "../../../lib/supabaseAdmin";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type RequestBody = {
  category?: unknown;
  productIds?: unknown;
};

type Criterion = {
  key?: string;
  label?: string;
  shortDescription?: string;
  helpText?: string;
  sourceType?: string;
  defaultWeight?: number;
};

type ProductRow = {
  id: string;
  product_name: string;
  source_url: string;

  review_analysis:
    | Record<string, unknown>
    | null;

  product_detail_analysis:
    | Record<string, unknown>
    | null;

  criterion_scores:
    | Record<string, unknown>
    | null;
};

type ScoreResult = {
  productId: string;

  criterionScores:
    Record<
      string,
      number | null
    >;

  criterionReasons:
    Record<
      string,
      string
    >;
};

function normalizeText(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function extractJson(
  text: string,
) {
  const cleaned =
    text
      .replace(
        /^```json\s*/i,
        "",
      )
      .replace(
        /^```\s*/i,
        "",
      )
      .replace(
        /\s*```$/i,
        "",
      )
      .trim();

  return JSON.parse(
    cleaned,
  ) as Record<
    string,
    unknown
  >;
}

function normalizeScore(
  value: unknown,
): number | null {
  if (value === null) {
    return null;
  }

  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (
    !Number.isFinite(
      numberValue,
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        numberValue,
      ),
    ),
  );
}

function normalizeResults(
  value: unknown,
  productIds: Set<string>,
  criterionKeys: string[],
): ScoreResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(
      (item) => {
        if (
          !item ||
          typeof item !==
            "object" ||
          Array.isArray(item)
        ) {
          return null;
        }

        const row =
          item as Record<
            string,
            unknown
          >;

        const productId =
          normalizeText(
            row.productId,
          );

        if (
          !productId ||
          !productIds.has(
            productId,
          )
        ) {
          return null;
        }

        const rawScores =
          row.criterionScores &&
          typeof row
            .criterionScores ===
            "object" &&
          !Array.isArray(
            row.criterionScores,
          )
            ? (
                row.criterionScores as Record<
                  string,
                  unknown
                >
              )
            : {};

        const rawReasons =
          row.criterionReasons &&
          typeof row
            .criterionReasons ===
            "object" &&
          !Array.isArray(
            row.criterionReasons,
          )
            ? (
                row.criterionReasons as Record<
                  string,
                  unknown
                >
              )
            : {};

        const criterionScores:
          Record<
            string,
            number | null
          > = {};

        const criterionReasons:
          Record<
            string,
            string
          > = {};

        for (
          const key of
          criterionKeys
        ) {
          criterionScores[key] =
            normalizeScore(
              rawScores[key],
            );

          criterionReasons[key] =
            normalizeText(
              rawReasons[key],
            ) ||
            "현재 확보된 근거만으로는 명확한 점수 차이를 설명하기 어렵습니다.";
        }

        return {
          productId,
          criterionScores,
          criterionReasons,
        };
      },
    )
    .filter(
      (
        item,
      ): item is ScoreResult =>
        Boolean(item),
    );
}

function stableStringify(
  value: unknown,
): string {
  if (
    value === null ||
    typeof value !==
      "object"
  ) {
    return JSON.stringify(
      value,
    );
  }

  if (
    Array.isArray(value)
  ) {
    return `[${value
      .map(
        (item) =>
          stableStringify(
            item,
          ),
      )
      .join(",")}]`;
  }

  const row =
    value as Record<
      string,
      unknown
    >;

  const keys =
    Object.keys(row)
      .sort();

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(
          key,
        )}:${stableStringify(
          row[key],
        )}`,
    )
    .join(",")}}`;
}

function createFingerprint(
  value: unknown,
) {
  return createHash(
    "sha256",
  )
    .update(
      stableStringify(
        value,
      ),
    )
    .digest(
      "hex",
    );
}

function hasCompleteScores(
  scores:
    | Record<
        string,
        unknown
      >
    | null,
  criterionKeys:
    string[],
) {
  if (
    !scores ||
    typeof scores !==
      "object" ||
    Array.isArray(scores)
  ) {
    return false;
  }

  return criterionKeys.every(
    (key) => {
      const value =
        scores[key];

      if (
        value === null
      ) {
        return true;
      }

      const numberValue =
        typeof value ===
          "number"
          ? value
          : typeof value ===
              "string"
            ? Number(
                value,
              )
            : NaN;

      return (
        Number.isFinite(
          numberValue,
        ) &&
        numberValue >= 0 &&
        numberValue <= 100
      );
    },
  );
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (
        await request.json()
      ) as RequestBody;

    const category =
      normalizeText(
        body.category,
      );

    const requestedProductIds =
      Array.isArray(
        body.productIds,
      )
        ? [
            ...new Set(
              body.productIds
                .map(
                  (value) =>
                    normalizeText(
                      value,
                    ),
                )
                .filter(Boolean),
            ),
          ]
        : [];

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message:
            "카테고리가 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    const apiKey =
      process.env
        .OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            "OPENAI_API_KEY가 설정되지 않았습니다.",
        },
        {
          status: 500,
        },
      );
    }

    const {
      data: profile,
      error:
        profileError,
    } =
      await supabaseAdmin
        .from(
          "category_profiles",
        )
        .select(
          "category, criteria, common_cautions, score_generation_fingerprint, score_generated_at",
        )
        .eq(
          "category",
          category,
        )
        .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          message:
            "먼저 이 카테고리의 구매기준을 생성해 주세요.",
        },
        {
          status: 404,
        },
      );
    }

    const criteria =
      Array.isArray(
        profile.criteria,
      )
        ? (
            profile.criteria as Criterion[]
          )
            .map(
              (
                criterion,
              ) => ({
                key:
                  normalizeText(
                    criterion.key,
                  ),

                label:
                  normalizeText(
                    criterion.label,
                  ),

                shortDescription:
                  normalizeText(
                    criterion.shortDescription,
                  ),

                helpText:
                  normalizeText(
                    criterion.helpText,
                  ),

                sourceType:
                  normalizeText(
                    criterion.sourceType,
                  ),

                defaultWeight:
                  Number(
                    criterion.defaultWeight ??
                      5,
                  ),
              }),
            )
            .filter(
              (
                criterion,
              ) =>
                criterion.key &&
                criterion.label,
            )
            .slice(
              0,
              5,
            )
        : [];

    if (
      criteria.length !== 5
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            `구매기준이 정확히 5개여야 합니다. 현재 ${criteria.length}개입니다.`,
        },
        {
          status: 400,
        },
      );
    }

    let productsQuery =
      supabaseAdmin
        .from(
          "products",
        )
        .select(
          "id, product_name, source_url, review_analysis, product_detail_analysis, criterion_scores",
        )
        .eq(
          "category",
          category,
        );

    if (
      requestedProductIds.length >
      0
    ) {
      productsQuery =
        productsQuery.in(
          "id",
          requestedProductIds,
        );
    }

    const {
      data,
      error,
    } =
      await productsQuery
        .order(
          "created_at",
          {
            ascending: true,
          },
        );

    if (error) {
      throw error;
    }

    const products =
      (
        data ?? []
      ) as ProductRow[];

    if (
      requestedProductIds.length >
        0 &&
      products.length !==
        requestedProductIds.length
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            `요청한 제품 ${requestedProductIds.length}개 중 ${products.length}개만 확인됐습니다.`,
        },
        {
          status: 400,
        },
      );
    }

    if (
      products.length < 2
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "제품 상대평가를 위해 최소 2개 제품이 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    const criterionKeys =
      criteria.map(
        (
          criterion,
        ) =>
          criterion.key,
      );

    const fingerprint =
      createFingerprint({
        category,
        criteria,

        commonCautions:
          Array.isArray(
            profile.common_cautions,
          )
            ? profile.common_cautions
            : [],

        products:
          products.map(
            (
              product,
            ) => ({
              id:
                product.id,

              productName:
                product.product_name,

              sourceUrl:
                product.source_url,

              reviewAnalysis:
                product.review_analysis,

              productDetailAnalysis:
                product.product_detail_analysis,
            }),
          ),
      });

    const cachedFingerprint =
      normalizeText(
        profile
          .score_generation_fingerprint,
      );

    const allHaveScores =
      products.every(
        (
          product,
        ) =>
          hasCompleteScores(
            product
              .criterion_scores,
            criterionKeys,
          ),
      );

    if (
      cachedFingerprint ===
        fingerprint &&
      allHaveScores
    ) {
      return NextResponse.json({
        success: true,
        cacheHit: true,
        category,
        productCount:
          products.length,
        criterionCount:
          criteria.length,
        scoreGeneratedAt:
          profile
            .score_generated_at ??
          null,
        message:
          "제품 근거가 변경되지 않아 기존 AI 점수를 그대로 사용합니다.",
      });
    }

    const evidenceProducts =
      products.map(
        (
          product,
        ) => ({
          productId:
            product.id,

          productName:
            product.product_name,

          sourceUrl:
            product.source_url,

          productDetailAnalysis:
            product.product_detail_analysis,

          reviewAnalysis:
            product.review_analysis,
        }),
      );

    const client =
      new OpenAI({
        apiKey,
      });

    const prompt = `
당신은 Project D의 제품 상대평가 엔진입니다.

카테고리:
${category}

현재 카테고리의 핵심 구매기준:
${JSON.stringify(
  criteria,
  null,
  2,
)}

비교 대상 제품과 확보된 실제 근거:
${JSON.stringify(
  evidenceProducts,
  null,
  2,
)}

평가 목표:

같은 카테고리의 제품들을 서로 직접 비교하여
각 제품을 각 구매기준별로 0~100점으로 평가하세요.

중요 원칙:

1. 모든 제품을 같은 기준과 같은 척도로 평가하세요.
2. productDetailAnalysis와 reviewAnalysis에 있는 근거만 사용하세요.
3. 근거가 없는 사양이나 성능은 추측하지 마세요.
4. 제품 상세페이지의 판매 문구보다 실제 리뷰 분석을 중요하게 보세요.
5. 리뷰에서 반복적으로 확인된 장점과 단점은 점수에 적극 반영하세요.
6. 한두 리뷰에서만 나타난 문제는 지나치게 크게 반영하지 마세요.
7. 같은 문제가 여러 제품에 공통적으로 존재한다면 특정 제품만 과도하게 감점하지 마세요.
8. 특정 제품에서 반복적으로 나타나는 고유한 오류·불편은 해당 기준 점수에 반영하세요.
9. 현재 5개 제품 사이에서 실제 상대적 차이가 드러나도록 평가하세요.
10. 점수 차이를 억지로 만들지는 마세요.
11. 두 제품의 근거 수준과 실제 성능이 비슷하면 비슷한 점수를 줄 수 있습니다.
12. 현재 확보된 근거만으로 판단할 수 없는 기준은 null을 사용하세요.
13. 가격 자체는 구매기준에 포함되어 있지 않다면 점수에 임의 반영하지 마세요.
14. 리뷰 수가 많은 것은 정보 신뢰성을 높이는 보조근거일 뿐, 제품 성능 자체와 동일시하지 마세요.
15. criterionReasons는 왜 그 점수를 줬는지 제품 간 차이를 중심으로 1~2문장으로 설명하세요.
16. 반드시 아래 5개의 실제 criteria key만 사용하세요.
17. JSON만 출력하세요. 마크다운은 사용하지 마세요.

점수 기준:

90~100:
현재 비교 제품 중 해당 기준에서 매우 강하고 반복적인 긍정 근거가 있음

75~89:
강점이 뚜렷하고 일부 단점은 있으나 전체적으로 우수함

60~74:
평균 이상이지만 뚜렷한 제약이나 혼재된 평가가 있음

40~59:
약점 또는 불확실성이 비교적 큼

0~39:
반복적인 심각한 문제나 뚜렷한 열위 근거가 있음

근거 부족:
null

반드시 사용해야 하는 criteria key:

${criterionKeys.join(
  ", ",
)}

반환 형식:

{
  "products": [
    {
      "productId": "입력으로 제공된 실제 UUID productId",
      "criterionScores": {
        "${criterionKeys[0]}": 0,
        "${criterionKeys[1]}": 0,
        "${criterionKeys[2]}": 0,
        "${criterionKeys[3]}": 0,
        "${criterionKeys[4]}": 0
      },
      "criterionReasons": {
        "${criterionKeys[0]}": "점수 근거",
        "${criterionKeys[1]}": "점수 근거",
        "${criterionKeys[2]}": "점수 근거",
        "${criterionKeys[3]}": "점수 근거",
        "${criterionKeys[4]}": "점수 근거"
      }
    }
  ]
}

반드시 비교 대상 모든 제품을 반환하세요.
`;

    const response =
      await client.responses.create(
        {
          model:
            "gpt-5",
          input:
            prompt,
        },
      );

    const outputText =
      response
        .output_text
        ?.trim();

    if (!outputText) {
      throw new Error(
        "AI가 제품별 점수를 반환하지 않았습니다.",
      );
    }

    const parsed =
      extractJson(
        outputText,
      );

    const productIds =
      new Set(
        products.map(
          (
            product,
          ) =>
            product.id,
        ),
      );

    const scoreResults =
      normalizeResults(
        parsed.products,
        productIds,
        criterionKeys,
      );

    if (
      scoreResults.length !==
      products.length
    ) {
      throw new Error(
        `AI 제품 평가 결과가 완전하지 않습니다. ${products.length}개 중 ${scoreResults.length}개만 반환되었습니다.`,
      );
    }

    for (
      const product of
      products
    ) {
      const scoreResult =
        scoreResults.find(
          (
            item,
          ) =>
            item.productId ===
            product.id,
        );

      if (!scoreResult) {
        continue;
      }

      const existingReview =
        product.review_analysis &&
        typeof product
          .review_analysis ===
          "object" &&
        !Array.isArray(
          product.review_analysis,
        )
          ? product.review_analysis
          : {};

      const mergedReviewAnalysis = {
        ...existingReview,

        criterionReasons:
          scoreResult
            .criterionReasons,

        criterion_reasons:
          scoreResult
            .criterionReasons,
      };

      const {
        error:
          updateError,
      } =
        await supabaseAdmin
          .from(
            "products",
          )
          .update({
            criterion_scores:
              scoreResult
                .criterionScores,

            review_analysis:
              mergedReviewAnalysis,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            product.id,
          );

      if (updateError) {
        throw updateError;
      }
    }

    const scoreGeneratedAt =
      new Date()
        .toISOString();

    const {
      error:
        profileUpdateError,
    } =
      await supabaseAdmin
        .from(
          "category_profiles",
        )
        .update({
          score_generation_fingerprint:
            fingerprint,

          score_generated_at:
            scoreGeneratedAt,
        })
        .eq(
          "category",
          category,
        );

    if (
      profileUpdateError
    ) {
      throw profileUpdateError;
    }

    return NextResponse.json({
      success: true,
      cacheHit: false,
      category,

      productCount:
        products.length,

      criterionCount:
        criteria.length,

      scoreGeneratedAt,

      scores:
        scoreResults,

      message:
        `${products.length}개 제품을 구매기준 ${criteria.length}개로 상대평가해 점수와 근거를 저장했습니다.`,
    });
  } catch (error) {
    console.error(
      "Generate product scores API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "제품별 AI 점수 생성 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}

