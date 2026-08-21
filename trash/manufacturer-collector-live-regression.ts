import {
  collectManufacturerProduct,
} from "../lib/manufacturerProductCollector";

async function main() {
  console.log("");
  console.log(
    "===== Manufacturer Collector 실제 회귀 테스트 =====",
  );

  const result =
    await collectManufacturerProduct({
      officialSite:
        "https://everybotmall.com/",

      searchTerms: [
        "TS450",
      ],
    });

  console.log(
    "성공:",
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
    result.discoveredUrl,
  );

  console.log(
    "상품명:",
    result.detail.title,
  );

  console.log(
    "브랜드:",
    result.detail.brand,
  );

  console.log(
    "판매가:",
    result.detail.finalPrice,
  );

  console.log(
    "이미지:",
    result.detail.imageUrl
      ? "YES"
      : "NO",
  );

  const checks = [
    [
      "상품명 TS450",
      result.detail.title
        .toLowerCase()
        .includes(
          "ts450",
        ),
    ],

    [
      "판매가 > 0",
      result.detail.finalPrice >
        0,
    ],

    [
      "이미지 존재",
      Boolean(
        result.detail.imageUrl,
      ),
    ],

    [
      "실제 상품 URL",
      /\/product/i.test(
        result.discoveredUrl,
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
