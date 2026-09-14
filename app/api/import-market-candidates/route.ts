import {
  NextResponse,
} from "next/server";

import {
  supabase,
} from "../../../lib/supabase";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type ReviewItem = {
  rating?: number;
  date?: string;
  text?: string;
  helpfulCount?: number;
};

type CandidateDetail = {
  productId?: string;
  productName?: string;
  brand?: string;
  manufacturer?: string;
  modelName?: string;
  originalPrice?: number;
  finalPrice?: number;
  discountRate?: number;
  reviewCount?: number;
  rating?: number | null;
  sellerName?: string;
  categoryName?: string;
  imageUrl?: string;
  keySpecs?: Record<string, string>;
  evaluationEvidence?: Record<
    string,
    string[]
  >;
  reviewSamples?: number;
  reviews?: ReviewItem[];
  sourceUrl?: string;
};

type Candidate = {
  market?: {
    productName?: string;
    listedPrice?: number;
    reviewCount?: number;
    rating?: number;
    imageUrl?: string;
    sourceUrl?: string;
  };

  detail?: CandidateDetail;
};

type ImportRequest = {
  category?: string;
  candidates?: Candidate[];
};

function normalizeText(
  value: unknown,
) {
  return typeof value === "string"
    ? value
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

type ExistingProductRow = {
  id: string;
  category: string;
  source_url: string;
  origin_product_no: number | null;
  product_detail_analysis:
    | Record<string, unknown>
    | null;
};

function asRecord(
  value: unknown,
) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function mergeMeaningfulValue(
  existing: unknown,
  incoming: unknown,
): unknown {
  if (typeof incoming === "string") {
    return incoming.trim()
      ? incoming
      : existing ?? incoming;
  }

  if (typeof incoming === "number") {
    return Number.isFinite(incoming) &&
      incoming !== 0
      ? incoming
      : existing ?? incoming;
  }

  if (incoming === null) {
    return existing ?? null;
  }

  if (Array.isArray(incoming)) {
    return incoming.length > 0
      ? incoming
      : Array.isArray(existing)
        ? existing
        : incoming;
  }

  const incomingRecord =
    asRecord(incoming);

  if (incomingRecord) {
    const existingRecord =
      asRecord(existing) ?? {};

    const merged:
      Record<string, unknown> = {
        ...existingRecord,
      };

    for (
      const [
        key,
        value,
      ] of Object.entries(
        incomingRecord,
      )
    ) {
      merged[key] =
        mergeMeaningfulValue(
          existingRecord[key],
          value,
        );
    }

    return merged;
  }

  return incoming === undefined
    ? existing
    : incoming;
}

function mergeProductDetailAnalysis(
  existing: unknown,
  incoming: Record<string, unknown>,
) {
  const merged =
    (
      asRecord(
        mergeMeaningfulValue(
          existing,
          incoming,
        ),
      ) ?? {}
    );

  for (
    const key of [
      "source",
      "sourceType",
      "identityKey",
      "productId",
      "productName",
      "sourceUrl",
      "collectedAt",
    ]
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        incoming,
        key,
      )
    ) {
      merged[key] =
        incoming[key];
    }
  }

  return merged;
}

function mergeIdentityRows(
  ...groups: Array<
    ExistingProductRow[] | null
  >
) {
  const byId =
    new Map<
      string,
      ExistingProductRow
    >();

  for (
    const group of groups
  ) {
    for (
      const row of group ?? []
    ) {
      if (
        row &&
        typeof row.id === "string" &&
        row.id
      ) {
        byId.set(
          row.id,
          row,
        );
      }
    }
  }

  return [
    ...byId.values(),
  ];
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as ImportRequest;

    const category =
      normalizeText(
        body.category,
      );

    const candidates =
      Array.isArray(
        body.candidates,
      )
        ? body.candidates
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

    if (
      candidates.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "등록할 후보가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const results = [];

    for (
      const candidate of
      candidates
    ) {
      const detail =
        candidate.detail ?? {};

      const productId =
        normalizeText(
          detail.productId,
        );

      const productName =
        normalizeText(
          detail.productName,
        );

      const sourceUrl =
        normalizeText(
          detail.sourceUrl,
        );

      const numericProductId =
        Number(
          productId,
        );

      const originProductNo =
        productId &&
        Number.isSafeInteger(
          numericProductId,
        ) &&
        numericProductId > 0
          ? numericProductId
          : null;

      if (
        !productName ||
        !sourceUrl
      ) {
        results.push({
          productName,
          productId,
          success: false,
          reason:
            "필수 상품정보가 부족합니다.",
        });

        continue;
      }

      /*
        새 자동수집 파이프라인에서
        확보한 상세정보를 기존 Project D의
        product_detail_analysis에 저장한다.

        따라서 별도의 상세페이지 재수집 없이
        category criteria 생성에 사용할 수 있다.
      */
      const productDetailAnalysis = {
        source:
          productId
            ? "market_candidate_naver"
            : "market_candidate_manufacturer",

        sourceType:
          productId
            ? "naver-brand"
            : "manufacturer",

        identityKey:
          productId
            ? `naver:${productId}`
            : `manufacturer:${sourceUrl}`,

        productId,

        productName,

        brand:
          normalizeText(
            detail.brand,
          ),

        manufacturer:
          normalizeText(
            detail.manufacturer,
          ),

        modelName:
          normalizeText(
            detail.modelName,
          ),

        price: {
          originalPrice:
            Number(
              detail.originalPrice ??
                0,
            ),

          finalPrice:
            Number(
              detail.finalPrice ??
                0,
            ),

          discountRate:
            Number(
              detail.discountRate ??
                0,
            ),
        },

        reviewCount:
          Number(
            detail.reviewCount ??
              0,
          ),

        rating:
          detail.rating ??
          null,

        sellerName:
          normalizeText(
            detail.sellerName,
          ),

        categoryName:
          normalizeText(
            detail.categoryName,
          ),

        imageUrl:
          normalizeText(
            detail.imageUrl,
          ),

        keySpecs:
          detail.keySpecs &&
          typeof detail.keySpecs === "object" &&
          !Array.isArray(detail.keySpecs)
            ? Object.fromEntries(
                Object.entries(
                  detail.keySpecs,
                )
                  .map(
                    ([key, value]) => [
                      normalizeText(key),
                      normalizeText(value),
                    ],
                  )
                  .filter(
                    ([key, value]) =>
                      Boolean(key) &&
                      Boolean(value),
                  )
                  .slice(0, 40),
              )
            : {},

        evaluationEvidence:
          detail.evaluationEvidence &&
          typeof detail.evaluationEvidence ===
            "object" &&
          !Array.isArray(
            detail.evaluationEvidence,
          )
            ? Object.fromEntries(
                Object.entries(
                  detail.evaluationEvidence,
                )
                  .map(
                    ([key, values]) => [
                      normalizeText(key),
                      Array.isArray(values)
                        ? values
                            .map(
                              (value) =>
                                normalizeText(
                                  value,
                                ),
                            )
                            .filter(Boolean)
                            .slice(0, 8)
                        : [],
                    ],
                  )
                  .filter(
                    ([key, values]) =>
                      Boolean(key) &&
                      Array.isArray(values) &&
                      values.length > 0,
                  ),
              )
            : {},

        marketListedPrice:
          Number(
            candidate.market
              ?.listedPrice ??
              0,
          ),

        collectedReviewSamples:
          Array.isArray(
            detail.reviews,
          )
            ? detail.reviews.length
            : 0,

        reviews:
          Array.isArray(
            detail.reviews,
          )
            ? detail.reviews
            : [],

        sourceUrl,

        collectedAt:
          new Date()
            .toISOString(),
      };

      const identitySelect =
        "id, category, source_url, origin_product_no, product_detail_analysis";

      const {
        data: sourceMatches,
        error: sourceMatchError,
      } =
        await supabase
          .from("products")
          .select(
            identitySelect,
          )
          .eq(
            "source_url",
            sourceUrl,
          )
          .limit(
            3,
          );

      if (sourceMatchError) {
        throw sourceMatchError;
      }

      let originMatches:
        ExistingProductRow[] | null =
        null;

      if (
        originProductNo !==
        null
      ) {
        const {
          data,
          error:
            originMatchError,
        } =
          await supabase
            .from("products")
            .select(
              identitySelect,
            )
            .eq(
              "origin_product_no",
              originProductNo,
            )
            .limit(
              3,
            );

        if (originMatchError) {
          throw originMatchError;
        }

        originMatches =
          (
            data ?? []
          ) as ExistingProductRow[];
      }

      const identityMatches =
        mergeIdentityRows(
          (
            sourceMatches ?? []
          ) as ExistingProductRow[],
          originMatches,
        );

      const crossCategory =
        identityMatches.find(
          (
            row,
          ) =>
            normalizeText(
              row.category,
            ) !== category,
        );

      if (crossCategory) {
        results.push({
          success: false,
          productId,
          productName,
          reason:
            "동일 source/origin identity가 다른 카테고리에 이미 존재해 기존 분석·점수를 보존하기 위해 재등록을 거부했습니다.",
          matchedProductId:
            crossCategory.id,
          matchedCategory:
            crossCategory.category,
        });

        continue;
      }

      if (
        identityMatches.length >
        1
      ) {
        results.push({
          success: false,
          productId,
          productName,
          reason:
            "source/origin identity가 둘 이상의 제품 행에 연결되어 모호한 업데이트를 거부했습니다.",
          matchedCount:
            identityMatches.length,
        });

        continue;
      }

      const existing =
        identityMatches[0] ??
        null;

      if (
        existing &&
        originProductNo !==
          null
      ) {
        const existingOrigin =
          Number(
            existing.origin_product_no,
          );

        if (
          Number.isSafeInteger(
            existingOrigin,
          ) &&
          existingOrigin > 0 &&
          existingOrigin !==
            originProductNo
        ) {
          results.push({
            success: false,
            productId,
            productName,
            reason:
              "source URL이 기존 제품과 일치하지만 origin_product_no가 달라 identity 변경을 거부했습니다.",
            matchedProductId:
              existing.id,
            matchedOriginProductNo:
              existingOrigin,
          });

          continue;
        }
      }

      if (existing) {
        const mergedProductDetailAnalysis =
          mergeProductDetailAnalysis(
            existing
              .product_detail_analysis,
            productDetailAnalysis,
          );

        const {
          data,
          error,
        } =
          await supabase
            .from("products")
            .update({
              product_name:
                productName,

              source_url:
                sourceUrl,

              origin_product_no:
                originProductNo,

              product_detail_analysis:
                mergedProductDetailAnalysis,

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              "id",
              existing.id,
            )
            .eq(
              "category",
              category,
            )
            .select(
              "id, product_name, origin_product_no",
            )
            .single();

        if (error) {
          throw error;
        }

        results.push({
          success: true,
          created: false,
          product: data,
        });

        continue;
      }

      const {
        data,
        error,
      } =
        await supabase
          .from("products")
          .insert({
            category,

            product_name:
              productName,

            source_url:
              sourceUrl,

            checkout_merchant_no:
              null,

            origin_product_no:
              originProductNo,

            product_detail_analysis:
              productDetailAnalysis,
          })
          .select(
            "id, product_name, origin_product_no",
          )
          .single();

      if (error) {
        throw error;
      }

      results.push({
        success: true,
        created: true,
        product: data,
      });
    }

    const successful =
      results.filter(
        (item) =>
          item.success,
      );

    return NextResponse.json({
      success:
        successful.length >
        0,

      category,

      requestedCount:
        candidates.length,

      successCount:
        successful.length,

      failureCount:
        results.length -
        successful.length,

      results,
    });
  } catch (error) {
    console.error(
      "Import market candidates error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "후보상품 DB 등록 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}

