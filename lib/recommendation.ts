import type { Product, RecommendationOptions, RecommendationResult } from "./types";

const criterionLabels = {
  cooling: "냉방 성능",
  quietness: "저소음",
  portability: "휴대성",
  battery: "배터리",
  afterService: "A/S",
} as const;

type Criterion = keyof typeof criterionLabels;

export function getRecommendation(
  sourceProducts: Product[],
  options: RecommendationOptions,
): RecommendationResult[] {
  const weights: Record<Criterion, number> = {
    cooling: options.cooling,
    quietness: options.quietness,
    portability: options.portability,
    battery: options.battery,
    afterService: options.afterService,
  };

  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;

  return sourceProducts
    .map((product) => {
      const weightedScore = (Object.entries(weights) as [Criterion, number][]).reduce(
        (sum, [criterion, weight]) => sum + product[criterion] * weight,
        0,
      ) / totalWeight;

      let budgetScore = 100;
      if (options.budget > 0 && product.price > options.budget) {
        const overRate = (product.price - options.budget) / options.budget;
        budgetScore = Math.max(0, 100 - overRate * 120);
      }

      const score = weightedScore * 0.72 + budgetScore * 0.18 + product.reviewScore * 0.1;

      const reasons: string[] = [];
      const cautions: string[] = [];

      const rankedCriteria = (Object.entries(weights) as [Criterion, number][])
        .sort((a, b) => b[1] - a[1]);

      for (const [criterion] of rankedCriteria) {
        if (product[criterion] >= 88 && reasons.length < 3) {
          reasons.push(`${criterionLabels[criterion]} 점수가 높아 선택 조건과 잘 맞습니다.`);
        }
      }

      if (options.budget === 0 || product.price <= options.budget) {
        reasons.unshift("설정한 예산 범위에 들어옵니다.");
      } else {
        cautions.push(`예산보다 ${(product.price - options.budget).toLocaleString()}원 높습니다.`);
      }

      product.cons.slice(0, 2).forEach((item) => cautions.push(item));

      return {
        ...product,
        score: Math.round(score * 10) / 10,
        reasons: reasons.slice(0, 4),
        cautions: cautions.slice(0, 3),
      };
    })
    .sort((a, b) => b.score - a.score);
}
