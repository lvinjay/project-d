const VARIANT_TOKENS = new Set([
  "ultra",
  "slim",
  "master",
  "pro",
  "maxv",
  "max",
  "plus",
  "mini",
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

  const variantMatched =
    marketVariantTokens.length === 0 ||
    detailVariantTokens.length === 0 ||
    marketVariantTokens.every(
      (token) =>
        detailVariantTokens.includes(
          token,
        ),
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
