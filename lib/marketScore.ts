export type MarketScoreInput = {
  salesScore: number;
  reviewCountScore: number;
  reviewRatingScore: number;
  brandTrustScore: number;
  searchInterestScore: number;
  recencyScore: number;
};

export type MarketScoreResult = {
  totalScore: number;
  breakdown: {
    sales: number;
    reviewCount: number;
    reviewRating: number;
    brandTrust: number;
    searchInterest: number;
    recency: number;
  };
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function calculateMarketScore(
  input: MarketScoreInput,
): MarketScoreResult {
  const sales = clampScore(input.salesScore) * 0.3;
  const reviewCount =
    clampScore(input.reviewCountScore) * 0.25;
  const reviewRating =
    clampScore(input.reviewRatingScore) * 0.2;
  const brandTrust =
    clampScore(input.brandTrustScore) * 0.1;
  const searchInterest =
    clampScore(input.searchInterestScore) * 0.1;
  const recency =
    clampScore(input.recencyScore) * 0.05;

  const totalScore =
    sales +
    reviewCount +
    reviewRating +
    brandTrust +
    searchInterest +
    recency;

  return {
    totalScore: Math.round(totalScore * 10) / 10,
    breakdown: {
      sales: Math.round(sales * 10) / 10,
      reviewCount: Math.round(reviewCount * 10) / 10,
      reviewRating: Math.round(reviewRating * 10) / 10,
      brandTrust: Math.round(brandTrust * 10) / 10,
      searchInterest: Math.round(searchInterest * 10) / 10,
      recency: Math.round(recency * 10) / 10,
    },
  };
}