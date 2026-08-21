import type {
  CanonicalProductSource,
} from "./canonicalProductSource";

export type CanonicalPipelineIdentity = {
  sourceType:
    | "naver-brand"
    | "manufacturer";

  canonicalUrl: string;

  /*
    Naver 상품은 실제 productId를 사용한다.

    Manufacturer 상품은 Naver productId가 없을 수 있으므로
    canonical URL 자체를 안정적인 identity로 사용한다.
  */
  identityKey: string;

  productId: string;

  canUseNaverDetailCache: boolean;

  canUseNaverCollector: boolean;
};

function normalizeUrl(
  value: string,
) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
}

export function buildCanonicalPipelineIdentity(
  source: CanonicalProductSource,
): CanonicalPipelineIdentity {
  const canonicalUrl =
    normalizeUrl(
      source.canonicalUrl,
    );

  if (
    source.sourceType ===
    "naver-brand"
  ) {
    const productId =
      String(
        source.productId ?? "",
      ).trim();

    return {
      sourceType:
        "naver-brand",

      canonicalUrl,

      identityKey:
        productId
          ? `naver:${productId}`
          : `url:${canonicalUrl}`,

      productId,

      canUseNaverDetailCache:
        Boolean(productId),

      canUseNaverCollector:
        true,
    };
  }

  return {
    sourceType:
      "manufacturer",

    canonicalUrl,

    identityKey:
      `manufacturer:${canonicalUrl}`,

    productId: "",

    canUseNaverDetailCache:
      false,

    canUseNaverCollector:
      false,
  };
}
