import {
  normalizeBrandKey,
  normalizeOfficialSite,
} from "../lib/officialSiteMappings";

type Case = {
  name: string;
  actual: unknown;
  expected: unknown;
};

const cases: Case[] = [
  {
    name: "Everybot 공식몰 정규화",
    actual:
      normalizeOfficialSite(
        "https://www.everybotmall.com/product/ts450?x=1",
      ),
    expected:
      "https://www.everybotmall.com",
  },
  {
    name: "Dreame 공식몰 정규화",
    actual:
      normalizeOfficialSite(
        "https://www.dreametech.com/",
      ),
    expected:
      "https://www.dreametech.com",
  },
  {
    name: "브랜드키 한글",
    actual:
      normalizeBrandKey(
        "에브리봇",
      ),
    expected:
      "에브리봇",
  },
  {
    name: "브랜드키 영문 공백",
    actual:
      normalizeBrandKey(
        "Dreame Korea",
      ),
    expected:
      "dreamekorea",
  },
];

let failed = 0;

console.log("");
console.log(
  "===== Official Site Mapping 회귀 테스트 =====",
);

for (const test of cases) {
  const pass =
    test.actual ===
    test.expected;

  if (!pass) {
    failed += 1;
  }

  console.log(
    pass
      ? `[PASS] ${test.name}`
      : `[FAIL] ${test.name}`,
  );

  if (!pass) {
    console.log(
      " actual:",
      test.actual,
    );

    console.log(
      " expected:",
      test.expected,
    );
  }
}

console.log("");
console.log(
  "전체:",
  cases.length,
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
