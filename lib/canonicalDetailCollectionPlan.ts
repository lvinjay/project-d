import type {
  CanonicalProductSource,
} from "./canonicalProductSource";

import {
  buildCanonicalPipelineIdentity,
} from "./canonicalPipelineIdentity";

export type CanonicalDetailCollectionPlan = {
  sourceType:
    | "naver-brand"
    | "manufacturer";

  canonicalUrl: string;

  identityKey: string;

  productId: string;

  useNaverCache: boolean;

  collector:
    | "naver"
    | "manufacturer";
};

export function buildCanonicalDetailCollectionPlan(
  source: CanonicalProductSource,
): CanonicalDetailCollectionPlan {
  const identity =
    buildCanonicalPipelineIdentity(
      source,
    );

  if (
    identity.sourceType ===
    "naver-brand"
  ) {
    return {
      sourceType:
        "naver-brand",

      canonicalUrl:
        identity.canonicalUrl,

      identityKey:
        identity.identityKey,

      productId:
        identity.productId,

      useNaverCache:
        identity.canUseNaverDetailCache,

      collector:
        "naver",
    };
  }

  return {
    sourceType:
      "manufacturer",

    canonicalUrl:
      identity.canonicalUrl,

    identityKey:
      identity.identityKey,

    productId: "",

    useNaverCache:
      false,

    collector:
      "manufacturer",
  };
}
