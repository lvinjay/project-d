import {
  buildCanonicalPipelineIdentity,
} from "../lib/canonicalPipelineIdentity";

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
  "===== Canonical Pipeline Identity 회귀 테스트 =====",
);

const naver =
  buildCanonicalPipelineIdentity({
    sourceType:
      "naver-brand",
    productId:
      "10775617216",
    officialSite:
      "https://brand.naver.com/everybot",
    brandName:
      "에브리봇",
    title:
      "TS450",
    canonicalUrl:
      "https://brand.naver.com/everybot/products/10775617216",
  });

assert(
  naver.identityKey ===
    "naver:10775617216",
  "Naver 상품번호 identity",
);

assert(
  naver.productId ===
    "10775617216",
  "Naver productId 유지",
);

assert(
  naver.canUseNaverDetailCache,
  "Naver DB 캐시 사용 가능",
);

assert(
  naver.canUseNaverCollector,
  "Naver collector 사용 가능",
);

const manufacturer =
  buildCanonicalPipelineIdentity({
    sourceType:
      "manufacturer",
    officialSite:
      "https://www.everybotmall.com",
    brandName:
      "에브리봇",
    title:
      "TS450",
    canonicalUrl:
      "https://www.everybotmall.com/product/ts450",
  });

assert(
  manufacturer.identityKey ===
    "manufacturer:https://www.everybotmall.com/product/ts450",
  "Manufacturer URL identity",
);

assert(
  manufacturer.productId ===
    "",
  "Manufacturer 가짜 productId 생성 금지",
);

assert(
  !manufacturer.canUseNaverDetailCache,
  "Manufacturer Naver 캐시 사용 금지",
);

assert(
  !manufacturer.canUseNaverCollector,
  "Manufacturer Naver collector 직접사용 금지",
);

console.log("");
console.log(
  "SerpApi 호출: 0",
);
console.log(
  "Bright Data 호출: 0",
);
