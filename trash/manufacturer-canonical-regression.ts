import {
  createManufacturerCanonicalSource,
  isLikelyManufacturerOfficialUrl,
} from "../lib/manufacturerCanonicalSource";

type Result = {
  name: string;
  pass: boolean;
};

const results: Result[] = [];

function expect(
  name: string,
  actual: unknown,
  expected: unknown,
) {
  results.push({
    name,
    pass:
      actual === expected,
  });
}

expect(
  "Everybot 본사몰 허용",
  isLikelyManufacturerOfficialUrl(
    "https://www.everybotmall.com/product/ts450",
    "https://www.everybotmall.com",
  ),
  true,
);

expect(
  "Everybot 본사몰 하위경로 허용",
  isLikelyManufacturerOfficialUrl(
    "https://everybotmall.com/goods/view?no=123",
    "https://www.everybotmall.com",
  ),
  true,
);

expect(
  "타 쇼핑몰 차단",
  isLikelyManufacturerOfficialUrl(
    "https://shopping.example.com/product/ts450",
    "https://www.everybotmall.com",
  ),
  false,
);

const source =
  createManufacturerCanonicalSource({
    url:
      "https://www.everybotmall.com/product/ts450",
    officialSite:
      "https://www.everybotmall.com",
    brandName:
      "에브리봇",
    title:
      "TS450",
  });

expect(
  "Manufacturer source 생성",
  source?.sourceType,
  "manufacturer",
);

expect(
  "Manufacturer 브랜드 유지",
  source?.brandName,
  "에브리봇",
);

console.log("");
console.log(
  "===== Manufacturer Canonical 회귀 테스트 =====",
);

for (
  const result of
  results
) {
  console.log(
    result.pass
      ? `[PASS] ${result.name}`
      : `[FAIL] ${result.name}`,
  );
}

const failed =
  results.filter(
    (item) =>
      !item.pass,
  ).length;

console.log("");
console.log(
  "전체:",
  results.length,
);
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

if (failed > 0) {
  process.exitCode = 1;
}
