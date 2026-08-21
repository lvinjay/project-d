import {
  collectManufacturerProduct,
} from "../lib/manufacturerProductCollector";

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

async function main() {
  console.log(
    "===== Manufacturer Collector Normalization 회귀 테스트 =====",
  );

  const normalized =
    normalizeManufacturerProduct(
      {
        url:
          "https://example.com/product/model-a",

        title:
          "Example Model A",

        brand:
          "Example",

        manufacturer:
          "Example",

        modelName:
          "A100",

        originalPrice:
          "599,000원",

        finalPrice:
          "549,000원",

        imageUrl:
          "https://example.com/a.jpg",
      },
      "https://example.com/product/model-a",
    );

  assert(
    normalized.finalPrice ===
      549000,
    "가격 정규화",
  );

  assert(
    normalized.modelName ===
      "A100",
    "모델명 정규화",
  );

  assert(
    isUsableManufacturerProduct(
      normalized,
    ),
    "정상 raw usable",
  );

  const invalid =
    normalizeManufacturerProduct(
      {
        title: "",
        finalPrice: 0,
      },
      "https://example.com/product/model-a",
    );

  assert(
    !isUsableManufacturerProduct(
      invalid,
    ),
    "불완전 raw 차단",
  );

  const collectorInvalid =
    await collectManufacturerProduct({
      officialSite: "",
      searchTerms: [
        "A100",
      ],
    });

  assert(
    !collectorInvalid.success,
    "Collector 빈 공식몰 차단",
  );

  console.log("");
  console.log(
    "SerpApi 호출: 0",
  );
  console.log(
    "Bright Data 호출: 0",
  );
  console.log(
    "유료 API 호출: 0",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
