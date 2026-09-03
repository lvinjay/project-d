import { NextResponse } from "next/server";
import {
  searchMarketProducts,
} from "../../../lib/marketSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
) {
  try {
    const {
      searchParams,
    } = new URL(
      request.url,
    );

    const category =
      (
        searchParams.get("category") ??
        ""
      ).trim();

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message:
            "검색할 상품군을 입력하세요.",
          count: 0,
          candidates: [],
        },
        {
          status: 400,
        },
      );
    }

    const minBudget =
      Number(
        (
          searchParams.get(
            "minBudget",
          ) ?? ""
        ).replace(
          /[^\d.]/g,
          "",
        ),
      ) || 0;

    const maxBudget =
      Number(
        (
          searchParams.get(
            "maxBudget",
          ) ?? ""
        ).replace(
          /[^\d.]/g,
          "",
        ),
      ) || 0;

    /*
      예산 필터를 적용하기 전에 후보 풀을 넓게 확보한다.

      기본 15개만 먼저 확보한 뒤 예산 필터를 걸면
      상위 검색결과에 고가 제품이 많은 카테고리에서
      실제 예산 내 후보가 5개 미만으로 줄어들 수 있다.

      따라서 최대 30개까지 시장 후보를 확보한 뒤
      예산 범위를 적용하고 최종 15개만 사용한다.
    */
    const marketPool =
      await searchMarketProducts(
          category,
          15,
          {
            minBudget,
            maxBudget,
          },
        );

    const products =
      marketPool.slice(
        0,
        15,
      );

    /*
      현재 단계의 점수는
      '대표제품 최종 선정점수'가 아니다.

      검색 직후 후보를 보기 쉽게 정렬하기 위한
      1차 참고점수만 계산한다.

      이후:
      - 시장 인기/인지도
      - 리뷰 신뢰도
      - 제품 경쟁력
      - 가격 경쟁력
      - 정보 충실도
      - 판매 안정성

      6개 기준의 실제 선정 로직을 별도로 붙인다.
    */
    const maximumReviews =
      Math.max(
        1,
        ...products.map(
          (product) =>
            product.reviewCount,
        ),
      );

    const candidates =
      products
        .map(
          (
            product,
            index,
          ) => {
            const reviewScore =
              Math.min(
                100,
                (
                  product.reviewCount /
                  maximumReviews
                ) *
                  100,
              );

            const ratingScore =
              product.rating > 0
                ? Math.min(
                    100,
                    (
                      product.rating /
                      5
                    ) *
                      100,
                  )
                : 0;

            const dataScore =
              [
                product.name,
                product.price > 0,
                product.image,
                product.url,
                product.reviewCount >
                  0,
                product.rating > 0,
              ].filter(Boolean)
                .length /
              6 *
              100;

            const searchExposureScore =
              Math.max(
                20,
                100 -
                  index * 8,
              );

            const preliminaryScore =
              Math.round(
                (
                  searchExposureScore *
                    0.35 +
                  reviewScore *
                    0.35 +
                  ratingScore *
                    0.2 +
                  dataScore *
                    0.1
                ) *
                  10,
              ) / 10;

            return {
              id:
                `candidate-${index + 1}`,

              searchPosition:
                index + 1,

              productName:
                product.name,

              seller:
                product.brand,

              price:
                product.price,

              imageUrl:
                product.image,

              sourceUrl:
                product.url,

              reviewCount:
                product.reviewCount,

              rating:
                product.rating,

              preliminaryScore,

              preliminaryReason: [
                product.reviewCount >
                0
                  ? `리뷰 ${product.reviewCount.toLocaleString(
                      "ko-KR",
                    )}개`
                  : "리뷰 정보 없음",

                product.rating > 0
                  ? `평점 ${product.rating}`
                  : "평점 정보 없음",

                product.price > 0
                  ? `가격 ${product.price.toLocaleString(
                      "ko-KR",
                    )}원`
                  : "가격 정보 없음",
              ],
            };
          },
        )
        .sort(
          (a, b) =>
            b.preliminaryScore -
            a.preliminaryScore,
        );

    return NextResponse.json({
      success: true,
      category,
      count:
        candidates.length,
      candidates,
      message:
        `"${category}" 네이버 SmartStore 기준 후보 ${candidates.length}개를 검색했습니다.`,
    });
  } catch (error) {
    console.error(
      "Market candidates API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        count: 0,
        candidates: [],
        message:
          error instanceof Error
            ? error.message
            : "시장 후보상품 검색 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}


