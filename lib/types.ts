export type Product = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  weightKg: number;
  cooling: number;
  quietness: number;
  portability: number;
  battery: number;
  afterService: number;
  reviewScore: number;
  reviewCount: number;
  suitableFor: string[];
  pros: string[];
  cons: string[];
  reviewEvidence: string[];
};

export type RecommendationOptions = {
  budget: number;
  cooling: number;
  quietness: number;
  portability: number;
  battery: number;
  afterService: number;
};

export type RecommendationResult = Product & {
  score: number;
  reasons: string[];
  cautions: string[];
};
