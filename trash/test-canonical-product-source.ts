import {
  getCanonicalSourceType,
  isNaverBrandProductUrl,
} from "../lib/canonicalProductSource";

type TestCase = {
  name: string;
  url: string;
  expected:
    | "naver-brand"
    | "manufacturer";
};

const cases: TestCase[] = [
  {
    name: "MOVA P70 네이버 브랜드상품",
    url: "https://brand.naver.com/mova/products/13280227814",
    expected: "naver-brand",
  },
  {
    name: "Dreame X60 네이버 브랜드상품",
    url: "https://brand.naver.com/dreame/products/13086178143",
    expected: "naver-brand",
  },
  {
    name: "Everybot 네이버 브랜드상품 형식",
    url: "https://brand.naver.com/everybot/products/123456789",
    expected: "naver-brand",
  },
  {
    name: "제조사 공식몰",
    url: "https://www.everybotmall.com/product/example",
    expected: "manufacturer",
  },
  {
    name: "일반 제조사 공식몰",
    url: "https://www.example.com/products/model-a",
    expected: "manufacturer",
  },
];

let failed = 0;

console.log(
  "===== Canonical Source 공용 구조 테스트 =====",
);

for (const test of cases) {
  const actual =
    getCanonicalSourceType(
      test.url,
    );

  const passed =
    actual === test.expected;

  if (!passed) {
    failed += 1;
  }

  console.log(
    `[${passed ? "PASS" : "FAIL"}] ${test.name}`,
  );

  console.log(
    `  TYPE: ${actual}`,
  );

  console.log(
    `  NAVER: ${isNaverBrandProductUrl(test.url)}`,
  );
}

console.log("");
console.log(
  `전체: ${cases.length}`,
);
console.log(
  `FAIL: ${failed}`,
);
console.log(
  "SerpApi 호출: 0",
);
console.log(
  "Bright Data 호출: 0",
);

if (failed > 0) {
  process.exit(1);
}
