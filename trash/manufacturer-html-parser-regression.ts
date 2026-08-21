import {
  readFile,
} from "node:fs/promises";

import {
  parseManufacturerProductHtml,
} from "../lib/parseManufacturerProductHtml";

import {
  normalizeManufacturerProduct,
  isUsableManufacturerProduct,
} from "../lib/normalizeManufacturerProduct";

async function main() {
  const html =
    await readFile(
      "./trash/ts450-discovered-product.html",
      "utf8",
    );

  const url =
    (
      await readFile(
        "./trash/ts450-discovered-url.txt",
        "utf8",
      )
    ).trim();

  console.log("");
  console.log(
    "===== TS450 Manufacturer HTML Parser 회귀 테스트 =====",
  );

  const raw =
    parseManufacturerProductHtml(
      html,
      url,
    );

  const detail =
    normalizeManufacturerProduct(
      raw,
      url,
    );

  console.log(
    "상품명:",
    detail.title,
  );

  console.log(
    "브랜드:",
    detail.brand,
  );

  console.log(
    "제조사:",
    detail.manufacturer,
  );

  console.log(
    "모델명:",
    detail.modelName,
  );

  console.log(
    "정가:",
    detail.originalPrice,
  );

  console.log(
    "판매가:",
    detail.finalPrice,
  );

  console.log(
    "이미지:",
    detail.imageUrl
      ? "YES"
      : "NO",
  );

  console.log(
    "URL:",
    detail.canonicalUrl,
  );

  console.log("");

  const checks = [
    [
      "상품명에 TS450",
      detail.title
        .toLowerCase()
        .includes(
          "ts450",
        ),
    ],

    [
      "판매가 > 0",
      detail.finalPrice >
        0,
    ],

    [
      "이미지 존재",
      Boolean(
        detail.imageUrl,
      ),
    ],

    [
      "usable",
      isUsableManufacturerProduct(
        detail,
      ),
    ],
  ] as const;

  let failed = 0;

  for (
    const [
      name,
      pass,
    ] of checks
  ) {
    console.log(
      pass
        ? `[PASS] ${name}`
        : `[FAIL] ${name}`,
    );

    if (!pass) {
      failed += 1;
    }
  }

  console.log("");
  console.log(
    "FAIL:",
    failed,
  );

  console.log(
    "SerpApi 호출: 0",
  );

  console.log(
    "Bright Data 호출: 0",
  );

  console.log(
    "유료 API 호출: 0",
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
