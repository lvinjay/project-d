export type ManufacturerRawProduct = {
  url?: string;

  title?: string;

  brand?: string;

  manufacturer?: string;

  modelName?: string;

  originalPrice?: string | number;

  finalPrice?: string | number;

  imageUrl?: string;
};

export type NormalizedManufacturerProduct = {
  canonicalUrl: string;

  title: string;

  brand: string;

  manufacturer: string;

  modelName: string;

  originalPrice: number;

  finalPrice: number;

  imageUrl: string;

  sourceType:
    "manufacturer";
};

function numberValue(
  value: unknown,
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const text =
    String(value ?? "")
      .replace(/[^\d.-]/g, "");

  const parsed =
    Number(text);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export function normalizeManufacturerProduct(
  raw: ManufacturerRawProduct,
  fallbackUrl = "",
): NormalizedManufacturerProduct {
  const canonicalUrl =
    String(
      raw.url ??
      fallbackUrl,
    ).trim();

  return {
    canonicalUrl,

    title:
      String(
        raw.title ?? "",
      ).trim(),

    brand:
      String(
        raw.brand ?? "",
      ).trim(),

    manufacturer:
      String(
        raw.manufacturer ?? "",
      ).trim(),

    modelName:
      String(
        raw.modelName ?? "",
      ).trim(),

    originalPrice:
      numberValue(
        raw.originalPrice,
      ),

    finalPrice:
      numberValue(
        raw.finalPrice,
      ),

    imageUrl:
      String(
        raw.imageUrl ?? "",
      ).trim(),

    sourceType:
      "manufacturer",
  };
}

export function isUsableManufacturerProduct(
  detail: NormalizedManufacturerProduct,
) {
  /*
    제조사 공식페이지는 상품 식별/스펙 확보가 목적이다.

    제조사 사이트가 가격을 제공하지 않거나
    0원으로 노출하는 경우가 있으므로 finalPrice는
    manufacturer 상세의 사용 가능 여부를 결정하는
    필수 조건으로 사용하지 않는다.

    실제 판매가격/예산 검증은 시장 후보 또는
    판매처에서 확보한 가격을 사용한다.
  */
  return (
    Boolean(
      detail.canonicalUrl,
    ) &&
    Boolean(
      detail.title,
    )
  );
}
