export type MarketSearchResult = {
  name: string;
  brand: string;
  price: number;
  image: string;
  url: string;
  reviewCount: number;
  rating: number;
};

export async function searchMarketProducts(
  keyword: string,
): Promise<MarketSearchResult[]> {
  return [];
}