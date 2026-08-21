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

type Criterion = {
  key?: string;
  label?: string;
  defaultWeight?: number;
};

type ProductRow = {
  id: string;
  product_name: string;

  criterion_scores:
    | Record<string, unknown>
    | null;

  product_detail_analysis:
    | Record<string, unknown>
    | null;
};

function normalizeText(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeScore(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const numberValue =
    Number(value);

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
      numberValue,
    ),
  );
}

export async function GET() {
  try {
    const category =
      "로봇청소기";

    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from(
          "category_profiles",
        )
        .select(
          "criteria",
        )
        .eq(
          "category",
          category,
        )
        .single();

    if (profileError) {
      throw profileError;
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

                weight:
                  Math.max(
                    1,
                    Math.min(
                      10,
                      Number(
                        criterion.defaultWeight ??
                          5,
                      ),
                    ),
                  ),
              }),
            )
            .filter(
              (
                criterion,
              ) =>
                criterion.key,
            )
        : [];

    const {
      data,
      error: productError,
    } =
      await supabaseAdmin
        .from(
          "products",
        )
        .select(
          "id, product_name, criterion_scores, product_detail_analysis",
        )
        .eq(
          "category",
          category,
        );

    if (productError) {
      throw productError;
    }

    const products =
      (
        data ?? []
      ) as ProductRow[];

    /*
      먼저 각 구매기준의
      후보군 평균점수를 계산한다.

      null 제품은 평균 계산에서 제외한다.
    */
    const criterionAverages:
      Record<
        string,
        number | null
      > = {};

    for (
      const criterion of
      criteria
    ) {
      const validScores =
        products
          .map(
            (
              product,
            ) => {
              const scores =
                product.criterion_scores &&
                typeof product
                  .criterion_scores ===
                  "object" &&
                !Array.isArray(
                  product.criterion_scores,
                )
                  ? (
                      product.criterion_scores as Record<
                        string,
                        unknown
                      >
                    )
                  : {};

              return normalizeScore(
                scores[
                  criterion.key
                ],
              );
            },
          )
          .filter(
            (
              score,
            ): score is number =>
              score !== null,
          );

      criterionAverages[
        criterion.key
      ] =
        validScores.length >
        0
          ? validScores.reduce(
              (
                sum,
                score,
              ) =>
                sum +
                score,
              0,
            ) /
            validScores.length
          : null;
    }

    const totalWeight =
      criteria.reduce(
        (
          sum,
          criterion,
        ) =>
          sum +
          criterion.weight,
        0,
      );

    const ranking =
      products
        .map(
          (
            product,
          ) => {
            const scores =
              product.criterion_scores &&
              typeof product
                .criterion_scores ===
                "object" &&
              !Array.isArray(
                product.criterion_scores,
              )
                ? (
                    product.criterion_scores as Record<
                      string,
                      unknown
                    >
                  )
                : {};

            let weightedSum =
              0;

            let knownWeight =
              0;

            let imputedWeight =
              0;

            const criterionResults =
              criteria.map(
                (
                  criterion,
                ) => {
                  const originalScore =
                    normalizeScore(
                      scores[
                        criterion.key
                      ],
                    );

                  const averageScore =
                    criterionAverages[
                      criterion.key
                    ];

                  /*
                    실제 점수가 있으면 그대로 사용.

                    없으면 후보군의 해당 기준 평균을
                    중립값으로 대신 사용한다.
                  */
                  const effectiveScore =
                    originalScore ??
                    averageScore;

                  if (
                    effectiveScore !==
                    null
                  ) {
                    weightedSum +=
                      effectiveScore *
                      criterion.weight;
                  }

                  if (
                    originalScore !==
                    null
                  ) {
                    knownWeight +=
                      criterion.weight;
                  } else if (
                    effectiveScore !==
                    null
                  ) {
                    imputedWeight +=
                      criterion.weight;
                  }

                  return {
                    key:
                      criterion.key,

                    label:
                      criterion.label,

                    weight:
                      criterion.weight,

                    score:
                      originalScore,

                    effectiveScore:
                      effectiveScore !==
                      null
                        ? Math.round(
                            effectiveScore *
                              10,
                          ) /
                          10
                        : null,

                    imputed:
                      originalScore ===
                        null &&
                      effectiveScore !==
                        null,

                    criterionAverage:
                      averageScore !==
                      null
                        ? Math.round(
                            averageScore *
                              10,
                          ) /
                          10
                        : null,
                  };
                },
              );

            const overallScore =
              totalWeight > 0
                ? Math.round(
                    (
                      weightedSum /
                      totalWeight
                    ) *
                      10,
                  ) / 10
                : null;

            const coverage =
              totalWeight > 0
                ? Math.round(
                    (
                      knownWeight /
                      totalWeight
                    ) *
                      1000,
                  ) / 10
                : 0;

            const detail =
              product
                .product_detail_analysis &&
              typeof product
                .product_detail_analysis ===
                "object" &&
              !Array.isArray(
                product
                  .product_detail_analysis,
              )
                ? (
                    product
                      .product_detail_analysis as Record<
                      string,
                      unknown
                    >
                  )
                : {};

            const price =
              detail.price &&
              typeof detail.price ===
                "object" &&
              !Array.isArray(
                detail.price,
              )
                ? (
                    detail.price as Record<
                      string,
                      unknown
                    >
                  ).finalPrice
                : null;

            return {
              productId:
                product.id,

              productName:
                product.product_name,

              finalPrice:
                Number(
                  price ?? 0,
                ),

              overallScore,

              coverage,

              totalWeight,

              knownWeight,

              imputedWeight,

              criterionResults,
            };
          },
        )
        .sort(
          (
            a,
            b,
          ) => {
            const scoreDiff =
              (
                b.overallScore ??
                -1
              ) -
              (
                a.overallScore ??
                -1
              );

            if (
              scoreDiff !== 0
            ) {
              return scoreDiff;
            }

            /*
              종합점수가 같으면
              근거 coverage가 높은 제품 우선.
            */
            return (
              b.coverage -
              a.coverage
            );
          },
        )
        .map(
          (
            item,
            index,
          ) => ({
            rank:
              index + 1,

            ...item,
          }),
        );

    return NextResponse.json({
      success: true,

      category,

      totalWeight,

      criteria,

      criterionAverages,

      ranking,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "순위 계산 실패",
      },
      {
        status: 500,
      },
    );
  }
}
