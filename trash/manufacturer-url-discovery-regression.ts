import {
  discoverManufacturerProductUrl,
} from "../lib/discoverManufacturerProductUrl";

import {
  parseManufacturerProductHtml,
} from "../lib/parseManufacturerProductHtml";

import {
  normalizeManufacturerProduct,
  isUsableManufacturerProduct,
} from "../lib/normalizeManufacturerProduct";

async function main() {
  console.log("");
  console.log(
    "===== Manufacturer URL Discovery 공용 회귀 테스트 =====",
  );

  const result =
    await discoverManufacturerProductUrl(
      "https://everybotmall.com/",
      [
        "TS450",
      ],
    );

  console.log(
    "발견 성공:",
    result.success,
  );

  console.log(
    "확인 후보 수:",
    result.candidatesChecked,
  );

  if (!result.success) {
    console.log(
      "실패 이유:",
      result.reason,
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "실제 URL:",
    result.url,
  );

  const raw =
    parseManufacturerProductHtml(
      result.html,
      result.url,
    );

  const detail =
    normalizeManufacturerProduct(
      raw,
      result.url,
    );

  console.log("");
  console.log(
    "상품명:",
    detail.title,
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

  const checks = [
    [
      "실제 URL에 product 경로",
      /\/product/i.test(
        result.url,
      ),
    ],

    [
      "상품명 TS450",
      detail.title
        .toLowerCase()
        .includes(
          "ts450",
        ),
    ],

    [
      "가격 > 0",
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
      "Manufacturer usable",
      isUsableManufacturerProduct(
        detail,
      ),
    ],
  ] as const;

  let failed = 0;

  console.log("");

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
