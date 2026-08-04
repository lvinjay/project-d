import type { MarketCandidate, Product } from "./types";

function normalizeReviewCount(reviewCount: number, maximumReviewCount: number) {
  if (maximumReviewCount <= 0) {
    return 0;
  }

  return Math.min(100, (reviewCount / maximumReviewCount) * 100);
}

export function calculateMarketScore(
  product: Product,
  maximumReviewCount: number,
): MarketCandidate {
  const reviewVolumeScore = normalizeReviewCount(
    product.reviewCount,
    maximumReviewCount,
  );

  const reviewSatisfactionScore = Math.min(
    100,
    Math.max(0, product.reviewScore),
  );

  /*
   * 시장 대표 후보 점수
   *
   * 판매·시장 인기도: 25%
   * 리뷰 규모: 20%
   * 리뷰 만족도: 15%
   * 브랜드 신뢰도: 15%
   * 구매 가능성: 10%
   * 제품 최신성: 10%
   * 판매 순위: 5%
   */
  const marketScore =
    product.popularityScore * 0.25 +
    reviewVolumeScore * 0.2 +
    reviewSatisfactionScore * 0.15 +
    product.brandTrustScore * 0.15 +
    product.availabilityScore * 0.1 +
    product.recencyScore * 0.1 +
    product.salesRankScore * 0.05;

  const marketReasons: string[] = [];

  if (product.popularityScore >= 85) {
    marketReasons.push("시장 관심도와 인지도가 높은 제품");
  }

  if (product.reviewCount >= 1000) {
    marketReasons.push("누적 리뷰가 많아 평가 신뢰도가 높은 제품");
  } else if (product.reviewCount >= 500) {
    marketReasons.push("충분한 실사용 리뷰가 축적된 제품");
  }

  if (product.reviewScore >= 88) {
    marketReasons.push("사용자 만족도가 높은 제품");
  }

  if (product.brandTrustScore >= 85) {
    marketReasons.push("브랜드와 고객지원 신뢰도가 높은 제품");
  }

  if (product.availabilityScore >= 85) {
    marketReasons.push("현재 구매 가능성과 유통 접근성이 좋은 제품");
  }

  if (product.recencyScore >= 85) {
    marketReasons.push("비교적 최신 제품으로 시장성이 유지되는 제품");
  }

  if (marketReasons.length === 0) {
    marketReasons.push("가격과 성능을 포함한 종합 시장 점수가 양호한 제품");
  }

  return {
    ...product,
    marketScore: Math.round(marketScore * 10) / 10,
    marketReasons,
  };
}

export function getMarketCandidates(
  products: Product[],
  category?: string,
  limit = 5,
): MarketCandidate[] {
  const normalizedCategory = category?.trim().toLowerCase() ?? "";

  const categoryProducts = products.filter((product) => {
    if (product.isDiscontinued) {
      return false;
    }

    if (!normalizedCategory) {
      return true;
    }

    return product.category.toLowerCase().includes(normalizedCategory);
  });

  const maximumReviewCount = Math.max(
    1,
    ...categoryProducts.map((product) => product.reviewCount),
  );

  return categoryProducts
    .map((product) =>
      calculateMarketScore(product, maximumReviewCount),
    )
    .sort((a, b) => {
      if (b.marketScore !== a.marketScore) {
        return b.marketScore - a.marketScore;
      }

      return b.reviewCount - a.reviewCount;
    })
    .slice(0, limit);
}