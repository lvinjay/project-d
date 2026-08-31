const VARIANT_TOKENS = new Set([
  "ultra",
  "slim",
  "master",
  "pro",
  "maxv",
  "max",
  "plus",
  "mini",
  "fe",
  "se",
  "lite",
  "air",
]);

export function getProductModelTokens(
  value: string,
): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 2 &&
        /[a-z]/.test(token) &&
        /\d/.test(token),
    );
}

export function getProductVariantTokens(
  value: string,
): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) =>
      VARIANT_TOKENS.has(token),
    );
}

export function validateProductMatch(
  marketName: string,
  detailTitle: string,
  detailModelName = "",
) {
  const marketModelTokens =
    getProductModelTokens(
      marketName,
    );

  const detailText =
    [
      detailTitle,
      detailModelName,
    ]
      .filter(Boolean)
      .join(" ");

  const detailModelTokens =
    getProductModelTokens(
      detailText,
    );

  const modelMatched =
    marketModelTokens.length === 0 ||
    marketModelTokens.some(
      (token) =>
        detailModelTokens.includes(
          token,
        ),
    );

  const marketVariantTokens =
    getProductVariantTokens(
      marketName,
    );

  const detailVariantTokens =
    getProductVariantTokens(
      detailText,
    );

  /*
    Pro / Pro Max, Pro / FE, Air / Pro처럼
    명시적인 제품 등급이 양쪽에 존재한다면
    한쪽이 다른 쪽을 포함한다는 이유만으로
    같은 제품으로 인정하지 않는다.

    단, 한쪽 상세 데이터에서 variant 표기가
    완전히 누락된 경우에는 이 단계만으로
    확정 탈락시키지 않고 다른 모델 근거를 허용한다.
  */
  const marketVariantSet =
    new Set(marketVariantTokens);

  const detailVariantSet =
    new Set(detailVariantTokens);

  const variantMatched =
    marketVariantSet.size === 0 ||
    detailVariantSet.size === 0
      ? true
      : (
          marketVariantSet.size ===
            detailVariantSet.size &&
          [...marketVariantSet].every(
            (token) =>
              detailVariantSet.has(token),
          )
        );

  return {
    modelMatched,
    variantMatched,
    matched:
      modelMatched &&
      variantMatched,

    marketModelTokens,
    detailModelTokens,
    marketVariantTokens,
    detailVariantTokens,
  };
}
