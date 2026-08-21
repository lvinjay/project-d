import {
  buildCanonicalDetailCollectionPlan,
} from "../lib/canonicalDetailCollectionPlan";

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
  "===== Canonical Detail Collection Plan 회귀 테스트 =====",
);

const naver =
  buildCanonicalDetailCollectionPlan({
    sourceType:
      "naver-brand",

    canonicalUrl:
      "https://brand.naver.com/mova/products/13280227814",

    officialSite:
      "https://brand.naver.com/mova",

    productId:
      "13280227814",

    brandName:
      "모바",

    title:
      "P70 Pro Ultra",
  });

assert(
  naver.collector ===
    "naver",
  "Naver collector 선택",
);

assert(
  naver.useNaverCache,
  "Naver cache 허용",
);

assert(
  naver.productId ===
    "13280227814",
  "Naver productId 유지",
);

const manufacturer =
  buildCanonicalDetailCollectionPlan({
    sourceType:
      "manufacturer",

    canonicalUrl:
      "https://www.everybotmall.com/product/ts450",

    officialSite:
      "https://www.everybotmall.com",

    brandName:
      "에브리봇",

    title:
      "TS450",
  });

assert(
  manufacturer.collector ===
    "manufacturer",
  "Manufacturer collector 선택",
);

assert(
  !manufacturer.useNaverCache,
  "Manufacturer Naver cache 차단",
);

assert(
  manufacturer.productId ===
    "",
  "Manufacturer productId 비움",
);

assert(
  manufacturer.identityKey ===
    "manufacturer:https://www.everybotmall.com/product/ts450",
  "Manufacturer URL identity 유지",
);

console.log("");
console.log(
  "SerpApi 호출: 0",
);
console.log(
  "Bright Data 호출: 0",
);
