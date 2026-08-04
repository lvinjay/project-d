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

  /**
   * 시장 대표 제품 선정용 지표
   * 각 점수는 0~100점 기준
   */
  popularityScore: number;
  brandTrustScore: number;
  salesRankScore: number;
  availabilityScore: number;
  recencyScore: number;

  /**
   * 시장 데이터의 신뢰성을 확인하기 위한 정보
   */
  dataSource: string[];
  dataCheckedAt: string;
  isDiscontinued: boolean;
};

export type RecommendationOptions = {
  budget: number;
  cooling: number;
  quietness: number;
  portability: number;
  battery: number;
  afterService: number;
};

export type MarketCandidate = Product & {
  marketScore: number;
  marketReasons: string[];
};

export type RecommendationResult = Product & {
  score: number;
  reasons: string[];
  cautions: string[];
};