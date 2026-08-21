import {
  normalizeManufacturerProduct,
  isUsableManufacturerProduct,
} from "../lib/normalizeManufacturerProduct";

function assert(
  condition: boolean,
  label: string,
) {
  if (!condition) {
    console.error(
      `[FAIL] ${label}`,
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    `[PASS] ${label}`,
  );
}

console.log(
  "===== Manufacturer Normalization 회귀 테스트 =====",
);

const good =
  normalizeManufacturerProduct(
    {
      url:
        "https://www.everybotmall.com/product/ts450",

      title:
        "에브리봇 TS450",

      brand:
        "에브리봇",

      manufacturer:
        "에브리봇",

      modelName:
        "TS450",

      originalPrice:
        "599,000원",

      finalPrice:
        "549,000원",

      imageUrl:
        "https://example.com/ts450.jpg",
    },
  );

assert(
  good.finalPrice ===
    549000,
  "가격 숫자 정규화",
);

assert(
  good.modelName ===
    "TS450",
  "모델명 유지",
);

assert(
  isUsableManufacturerProduct(
    good,
  ),
  "정상 제조사 상품 usable",
);

const bad =
  normalizeManufacturerProduct(
    {
      url:
        "https://www.everybotmall.com/product/ts450",
      title: "",
      finalPrice: 0,
    },
  );

assert(
  !isUsableManufacturerProduct(
    bad,
  ),
  "빈 상품정보 차단",
);

console.log("");
console.log(
  "SerpApi 호출: 0",
);
console.log(
  "Bright Data 호출: 0",
);
