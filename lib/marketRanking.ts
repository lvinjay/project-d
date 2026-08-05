import { calculateMarketScore as calculateBaseMarketScore } from "./marketScore";
import type { MarketCandidate, Product } from "./types";

function normalizeReviewCount(
  reviewCount: number,
  maximumReviewCount: number,
) {
  if (maximumReviewCount <= 0) {
    return 0;
  }

  return Math.min(
    100,
    (reviewCount / maximumReviewCount) * 100,
  );
}

export function calculateProductMarketScore(
  product: Product,
  maximumReviewCount: number,
): MarketCandidate {
  const reviewCountScore = normalizeReviewCount(
    product.reviewCount,
    maximumReviewCount,
  );

  const scoreResult = calculateBaseMarketScore({
    salesScore: product.salesRankScore,
    reviewCountScore,
    reviewRatingScore: product.reviewScore,
    brandTrustScore: product.brandTrustScore,
    searchInterestScore: product.popularityScore,
    recencyScore: product.recencyScore,
  });

  const marketReasons: string[] = [];

  if (product.salesRankScore >= 85) {
    marketReasons.push(
      "판매 지표가 우수한 시장 인기 제품",
    );
  }

  if (product.reviewCount >= 1000) {
    marketReasons.push(
      "누적 리뷰가 많아 평가 신뢰도가 높은 제품",
    );
  } else if (product.reviewCount >= 500) {
    marketReasons.push(
      "충분한 실사용 리뷰가 축적된 제품",
    );
  }

  if (product.reviewScore >= 88) {
    marketReasons.push(
      "실사용자 만족도가 높은 제품",
    );
  }

  if (product.brandTrustScore >= 85) {
    marketReasons.push(
      "브랜드와 고객지원 신뢰도가 높은 제품",
    );
  }

  if (product.popularityScore >= 85) {
    marketReasons.push(
      "시장 관심도와 인지도가 높은 제품",
    );
  }

  if (product.recencyScore >= 85) {
    marketReasons.push(
      "비교적 최신 제품으로 시장성이 유지되는 제품",
    );
  }

  if (product.availabilityScore >= 85) {
    marketReasons.push(
      "현재 구매 가능성과 유통 접근성이 좋은 제품",
    );
  }

  if (marketReasons.length === 0) {
    marketReasons.push(
      "판매, 리뷰, 브랜드, 관심도를 종합한 시장 점수가 양호한 제품",
    );
  }

  return {
    ...product,
    marketScore: scoreResult.totalScore,
    marketReasons,
  };
}

export function getMarketCandidates(
  products: Product[],
  category?: string,
  limit = 5,
): MarketCandidate[] {
  const normalizedCategory =
    category?.trim().toLowerCase() ?? "";

  const categoryProducts = products.filter(
    (product) => {
      if (product.isDiscontinued) {
        return false;
      }

      if (product.availabilityScore < 30) {
        return false;
      }

      if (!normalizedCategory) {
        return true;
      }

      return product.category
        .toLowerCase()
        .includes(normalizedCategory);
    },
  );

  const maximumReviewCount = Math.max(
    1,
    ...categoryProducts.map(
      (product) => product.reviewCount,
    ),
  );

  return categoryProducts
    .map((product) =>
      calculateProductMarketScore(
        product,
        maximumReviewCount,
      ),
    )
    .sort((a, b) => {
      if (b.marketScore !== a.marketScore) {
        return b.marketScore - a.marketScore;
      }

      if (
        b.availabilityScore !==
        a.availabilityScore
      ) {
        return (
          b.availabilityScore -
          a.availabilityScore
        );
      }

      return b.reviewCount - a.reviewCount;
    })
    .slice(0, limit);
}