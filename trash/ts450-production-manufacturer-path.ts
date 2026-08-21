import {
  readFile,
} from "node:fs/promises";

async function loadEnv() {
  const text =
    await readFile(
      ".env.local",
      "utf8",
    );

  for (
    const rawLine of
    text.split(/\r?\n/)
  ) {
    const line =
      rawLine.trim();

    if (
      !line ||
      line.startsWith("#")
    ) {
      continue;
    }

    const index =
      line.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const key =
      line
        .slice(0, index)
        .trim();

    let value =
      line
        .slice(index + 1)
        .trim();

    if (
      (
        value.startsWith('"') &&
        value.endsWith('"')
      ) ||
      (
        value.startsWith("'") &&
        value.endsWith("'")
      )
    ) {
      value =
        value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] =
        value;
    }
  }
}

async function main() {
  await loadEnv();

  const {
    findOfficialSiteMapping,
  } =
    await import(
      "../lib/officialSiteMappingsDb"
    );

  const {
    collectManufacturerProduct,
  } =
    await import(
      "../lib/manufacturerProductCollector"
    );

  const {
    getStrongSearchModelTokens,
  } =
    await import(
      "../lib/buildResolverSearchPlan"
    );

  const {
    validateProductMatch,
  } =
    await import(
      "../lib/validateProductMatch"
    );

  const {
    buildCanonicalPipelineIdentity,
  } =
    await import(
      "../lib/canonicalPipelineIdentity"
    );

  const marketName =
    "에브리봇 TS450 쓰리스핀 슬림 물걸레 로봇청소기 26년 NEW";

  console.log("");
  console.log(
    "===== TS450 생산 Manufacturer 경로 무료 검증 =====",
  );

  /*
    실제 생산 Enriched와 같은 방식으로
    상품명 앞쪽 토큰을 브랜드 후보로 사용한다.
  */
  const marketTokens =
    marketName
      .split(/\s+/)
      .map(
        (value) =>
          value.trim(),
      )
      .filter(Boolean);

  const brandCandidates =
    [
      ...marketTokens.slice(
        0,
        8,
      ),

      marketTokens
        .slice(0, 2)
        .join(" "),

      marketTokens
        .slice(0, 3)
        .join(" "),
    ].filter(Boolean);

  const mapping =
    await findOfficialSiteMapping(
      brandCandidates,
    );

  console.log("");
  console.log(
    "===== 1. 공식몰 매핑 =====",
  );

  console.log(
    "발견:",
    Boolean(mapping),
  );

  console.log(
    "브랜드:",
    mapping?.brandName ??
      "",
  );

  console.log(
    "공식몰:",
    mapping?.officialSite ??
      "",
  );

  if (!mapping) {
    console.log(
      "[FAIL] 공식몰 매핑 없음",
    );

    process.exitCode = 1;
    return;
  }

  const searchTerms =
    getStrongSearchModelTokens(
      marketTokens,
    );

  console.log("");
  console.log(
    "===== 2. 검색 모델토큰 =====",
  );

  console.log(
    searchTerms.join(" "),
  );

  const collected =
    await collectManufacturerProduct({
      officialSite:
        mapping.officialSite,

      searchTerms,
    });

  console.log("");
  console.log(
    "===== 3. Manufacturer 상세수집 =====",
  );

  console.log(
    "성공:",
    collected.success,
  );

  if (!collected.success) {
    console.log(
      "실패 이유:",
      collected.reason,
    );

    process.exitCode = 1;
    return;
  }

  const detail =
    collected.detail;

  console.log(
    "실제 URL:",
    collected.discoveredUrl,
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
    "모델명:",
    detail.modelName,
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

  const validation =
    validateProductMatch(
      marketName,
      detail.title,
      detail.modelName,
    );

  console.log("");
  console.log(
    "===== 4. 생산 상품 정합성 검증 =====",
  );

  console.log(
    "modelMatched:",
    validation.modelMatched,
  );

  console.log(
    "variantMatched:",
    validation.variantMatched,
  );

  console.log(
    "matched:",
    validation.matched,
  );

  const identity =
    buildCanonicalPipelineIdentity({
      sourceType:
        "manufacturer",

      canonicalUrl:
        collected.discoveredUrl,

      officialSite:
        mapping.officialSite,

      brandName:
        detail.brand ||
        mapping.brandName,

      title:
        detail.title,
    });

  console.log("");
  console.log(
    "===== 5. Canonical Identity =====",
  );

  console.log(
    "sourceType:",
    identity.sourceType,
  );

  console.log(
    "productId:",
    identity.productId ||
      "(없음 - 정상)",
  );

  console.log(
    "identityKey:",
    identity.identityKey,
  );

  console.log(
    "Naver cache:",
    identity.canUseNaverDetailCache,
  );

  console.log(
    "Naver collector:",
    identity.canUseNaverCollector,
  );

  const fullEligible =
    Boolean(
      detail.title,
    ) &&
    detail.finalPrice > 0 &&
    Boolean(
      detail.imageUrl,
    ) &&
    validation.matched &&
    identity.sourceType ===
      "manufacturer" &&
    !identity.productId;

  console.log("");
  console.log(
    "===== 최종 판정 =====",
  );

  console.log(
    "FULL 가능:",
    fullEligible
      ? "YES"
      : "NO",
  );

  console.log(
    "productId 없는 Manufacturer 허용:",
    !identity.productId
      ? "PASS"
      : "FAIL",
  );

  console.log(
    "canonical identity:",
    identity.identityKey.startsWith(
      "manufacturer:",
    )
      ? "PASS"
      : "FAIL",
  );

  console.log(
    "상품 일치검증:",
    validation.matched
      ? "PASS"
      : "FAIL",
  );

  console.log(
    "가격:",
    detail.finalPrice > 0
      ? "PASS"
      : "FAIL",
  );

  console.log(
    "이미지:",
    detail.imageUrl
      ? "PASS"
      : "FAIL",
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

  if (!fullEligible) {
    process.exitCode = 1;
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
