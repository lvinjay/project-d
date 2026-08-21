import {
  extractManufacturerCanonicalCandidates,
} from "../lib/extractManufacturerCanonicalCandidates";

const results =
  extractManufacturerCanonicalCandidates({
    officialSite:
      "https://www.everybotmall.com",
    brandName:
      "에브리봇",
    results: [
      {
        title:
          "에브리봇 TS450 공식몰",
        link:
          "https://www.everybotmall.com/product/ts450",
      },
      {
        title:
          "에브리봇 TS450 판매",
        link:
          "https://shopping.example.com/ts450",
      },
      {
        title:
          "에브리봇 공식몰 중복",
        link:
          "https://www.everybotmall.com/product/ts450",
      },
    ],
  });

console.log("");
console.log(
  "===== Manufacturer 후보 추출 회귀 테스트 =====",
);

console.log(
  "후보 수:",
  results.length,
);

for (
  const result of
  results
) {
  console.log(
    "TYPE:",
    result?.sourceType,
  );

  console.log(
    "URL:",
    result?.canonicalUrl,
  );

  console.log(
    "SITE:",
    result?.officialSite,
  );

  console.log(
    "BRAND:",
    result?.brandName,
  );
}

const passed =
  results.length === 1 &&
  results[0]?.sourceType ===
    "manufacturer" &&
  results[0]?.canonicalUrl ===
    "https://www.everybotmall.com/product/ts450";

console.log("");
console.log(
  passed
    ? "[PASS] 제조사 공식몰만 추출"
    : "[FAIL] 제조사 후보 추출",
);

console.log(
  "SerpApi 호출: 0",
);

console.log(
  "Bright Data 호출: 0",
);

if (!passed) {
  process.exitCode = 1;
}
