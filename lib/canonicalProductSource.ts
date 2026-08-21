export type CanonicalSourceType =
  | "naver-brand"
  | "manufacturer";

export type CanonicalProductSource = {
  sourceType: CanonicalSourceType;

  canonicalUrl: string;

  /*
    네이버 브랜드스토어 상품일 때만 존재.
    제조사 공식몰에서는 비어 있을 수 있다.
  */
  productId?: string;

  /*
    공식 브랜드/제조사 사이트의 루트.
    예:
    https://brand.naver.com/everybot
    https://www.everybotmall.com
  */
  officialSite: string;

  brandName?: string;

  title?: string;
};

export function isNaverBrandProductUrl(
  value: unknown,
) {
  const text =
    String(value ?? "").trim();

  return /^https?:\/\/brand\.naver\.com\/[a-zA-Z0-9_-]+\/products\/\d+/i.test(
    text,
  );
}

export function getCanonicalSourceType(
  value: unknown,
): CanonicalSourceType {
  return isNaverBrandProductUrl(value)
    ? "naver-brand"
    : "manufacturer";
}
