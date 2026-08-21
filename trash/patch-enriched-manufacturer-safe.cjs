const fs = require("fs");

const path =
  "app/api/market-candidates-enriched/route.ts";

let text =
  fs.readFileSync(
    path,
    "utf8",
  );

function replaceOnceRegex(
  regex,
  replacement,
  label,
) {
  const matches =
    text.match(regex);

  if (
    !matches ||
    matches.length !== 1
  ) {
    throw new Error(
      `PATCH_MATCH_ERROR: ${label} / count=${matches?.length ?? 0}`,
    );
  }

  text =
    text.replace(
      regex,
      replacement,
    );

  console.log(
    `[PATCH] ${label}`,
  );
}

/*
  1. import
*/
replaceOnceRegex(
  /import\s*\{\s*resolveNaverBrandProductUrl,\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/lib\/resolveNaverBrandProductUrl";/,
`import {
  resolveNaverBrandProductUrl,
} from "../../../lib/resolveNaverBrandProductUrl";

import {
  findOfficialSiteMapping,
} from "../../../lib/officialSiteMappingsDb";

import {
  collectManufacturerProduct,
} from "../../../lib/manufacturerProductCollector";

import {
  getStrongSearchModelTokens,
} from "../../../lib/buildResolverSearchPlan";

import {
  buildCanonicalPipelineIdentity,
} from "../../../lib/canonicalPipelineIdentity";`,
  "Manufacturer imports",
);

/*
  2. FinalCandidate 타입 확장
*/
replaceOnceRegex(
  /canonicalSource:\s*\{\s*productId:\s*string;\s*brandName:\s*string;\s*brandSite:\s*string;\s*url:\s*string;\s*\};/,
`canonicalSource: {
    productId: string;
    brandName: string;
    brandSite: string;
    url: string;

    sourceType?:
      | "naver-brand"
      | "manufacturer";

    identityKey?: string;
  };`,
  "canonicalSource type",
);

replaceOnceRegex(
  /resolution:\s*\{\s*productId:\s*string;\s*brandName:\s*string;\s*brandSite:\s*string;\s*canonicalUrl:\s*string;\s*\};/,
`resolution: {
    productId: string;
    brandName: string;
    brandSite: string;
    canonicalUrl: string;

    sourceType?:
      | "naver-brand"
      | "manufacturer";

    identityKey?: string;
  };`,
  "resolution type",
);

/*
  ProcessSuccess identityKey는 optional.
  기존 partial 성공 반환을 깨뜨리지 않는다.
*/
replaceOnceRegex(
  /type ProcessSuccess = \{\s*success: true;\s*position: number;\s*productId: string;/,
`type ProcessSuccess = {
  success: true;

  position: number;

  productId: string;

  identityKey?: string;`,
  "ProcessSuccess identity",
);

/*
  3. 중복 Set 이름 변경
*/
if (
  !text.includes(
    "const seenProductIds"
  )
) {
  throw new Error(
    "seenProductIds 선언을 찾지 못했습니다."
  );
}

text =
  text.replace(
    /seenProductIds/g,
    "seenIdentityKeys",
  );

console.log(
  "[PATCH] seenIdentityKeys",
);

/*
  4. processCandidate 상태 확장
*/
replaceOnceRegex(
  /let resolvedBrandSite\s*=\s*"";/,
`let resolvedBrandSite =
        "";

      let canonicalSourceType:
        | "naver-brand"
        | "manufacturer" =
        "naver-brand";

      let identityKey =
        "";

      let manufacturerDetail:
        Awaited<
          ReturnType<
            typeof collectManufacturerProduct
          >
        > | null =
        null;`,
  "canonical runtime state",
);

/*
  5. Resolver 실패 즉시 partial 되는 블록을
     Manufacturer fallback으로 교체
*/
replaceOnceRegex(
  /if\s*\(\s*!resolved\.success\s*\|\|\s*!resolved\.canonicalUrl\s*\)\s*\{[\s\S]*?candidate:\s*createPartialMarketCandidate\(\s*market,\s*position,\s*\),\s*\};\s*\}/,
`if (
            !resolved.success ||
            !resolved.canonicalUrl
          ) {
            const naverReason =
              resolved.reason ??
              "공식 Brand 상품 URL을 찾지 못했습니다.";

            /*
              Naver 공식상품을 찾지 못한 경우에만
              저장된 제조사 공식몰을 fallback으로 사용한다.
            */
            const marketTokens =
              market.name
                .split(/\\s+/)
                .map(
                  (value) =>
                    value.trim(),
                )
                .filter(Boolean);

            /*
              한 단어 브랜드뿐 아니라
              두 단어 브랜드도 매핑 조회가 가능하도록
              앞쪽 조합을 함께 넣는다.
            */
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

            const officialMapping =
              await findOfficialSiteMapping(
                brandCandidates,
              );

            const manufacturerSearchTerms =
              getStrongSearchModelTokens(
                marketTokens,
              );

            if (
              officialMapping?.officialSite &&
              manufacturerSearchTerms.length >
                0
            ) {
              console.log(
                \`[ENRICH \${position}] Manufacturer fallback 시작\`,
                officialMapping.officialSite,
                manufacturerSearchTerms.join(
                  " ",
                ),
              );

              try {
                const collected =
                  await collectManufacturerProduct({
                    officialSite:
                      officialMapping.officialSite,

                    searchTerms:
                      manufacturerSearchTerms,
                  });

                if (
                  collected.success
                ) {
                  manufacturerDetail =
                    collected;

                  canonicalSourceType =
                    "manufacturer";

                  resolvedProductId =
                    "";

                  resolvedUrl =
                    collected.discoveredUrl;

                  resolvedBrandName =
                    collected.detail.brand ||
                    officialMapping.brandName;

                  resolvedBrandSite =
                    officialMapping.officialSite;

                  console.log(
                    \`[ENRICH \${position}] Manufacturer fallback 성공\`,
                    resolvedUrl,
                  );
                } else {
                  console.log(
                    \`[ENRICH \${position}] Manufacturer fallback 실패\`,
                    collected.reason,
                  );
                }
              } catch (error) {
                console.warn(
                  \`[ENRICH \${position}] Manufacturer fallback 오류\`,
                  error,
                );
              }
            }

            if (
              !manufacturerDetail ||
              !manufacturerDetail.success
            ) {
              console.log(
                \`[ENRICH \${position}] partial 유지(resolve 실패)\`,
                naverReason,
              );

              return {
                success: true,

                position,

                productId:
                  extractMarketProductId(
                    market.url,
                  ) ||
                  \`partial-\${position}\`,

                resolverAttempts:
                  candidateResolverAttempts,

                brightDataCalls: 0,

                candidate:
                  createPartialMarketCandidate(
                    market,
                    position,
                  ),
              };
            }
          }`,
  "Naver fail -> Manufacturer fallback",
);

/*
  6. 중복검사 직전에 공용 Canonical Identity 생성.

  직접 Brand URL이든 Resolver 성공이든
  따로따로 identity를 세팅하지 않는다.
*/
replaceOnceRegex(
  /\/\*\s*이전 배치에서 이미 확보된 상품이면\s*Bright Data 호출 전에 차단\.\s*\*\//,
`/*
        Naver와 Manufacturer 모두 같은 공용 identity 규칙을 사용한다.
      */
      const canonicalIdentity =
        buildCanonicalPipelineIdentity({
          sourceType:
            canonicalSourceType,

          canonicalUrl:
            resolvedUrl,

          productId:
            canonicalSourceType ===
              "naver-brand"
              ? resolvedProductId
              : undefined,

          officialSite:
            resolvedBrandSite ||
            resolvedUrl,

          brandName:
            resolvedBrandName,

          title:
            market.name,
        });

      identityKey =
        canonicalIdentity.identityKey;

      /*
        이전 배치에서 이미 확보된 상품이면
        상세수집 전에 차단.
      */`,
  "canonical identity creation",
);

replaceOnceRegex(
  /seenIdentityKeys\.has\(\s*resolvedProductId,\s*\)/,
`seenIdentityKeys.has(
          identityKey,
        )`,
  "early duplicate key",
);

replaceOnceRegex(
  /`동일 상품번호 중복: \$\{resolvedProductId\}`/,
"`동일 canonical identity 중복: ${identityKey}`",
  "early duplicate reason",
);

/*
  7. 상세수집 시작부를 source별 분기
*/
replaceOnceRegex(
  /let detail:\s*NaverProductDetail \| null\s*=\s*await getCachedProductDetail\(\s*resolvedProductId,\s*\);\s*let usedCache\s*=\s*Boolean\(detail\);\s*if\s*\(detail\)\s*\{[\s\S]*?\}\s*const brightDataStartedAt\s*=\s*Date\.now\(\);\s*if\s*\(!detail\)\s*\{\s*console\.log\(\s*`\[ENRICH \$\{position\}\] Bright Data 시작`,\s*resolvedUrl,\s*\);\s*try\s*\{\s*detail\s*=\s*await collectNaverProduct\(\s*resolvedUrl,\s*\);/,
`let detail:
        NaverProductDetail | null =
        null;

      let usedCache =
        false;

      if (
        canonicalSourceType ===
          "manufacturer" &&
        manufacturerDetail?.success
      ) {
        const manufacturer =
          manufacturerDetail.detail;

        detail = {
          url:
            manufacturer.canonicalUrl,

          productId: "",

          title:
            manufacturer.title,

          originalPrice:
            manufacturer.originalPrice,

          finalPrice:
            manufacturer.finalPrice,

          discountRate: 0,

          currency:
            "KRW",

          imageUrl:
            manufacturer.imageUrl,

          totalReviews: 0,

          averageRating:
            null,

          soldOut: false,

          sellerName:
            manufacturer.brand,

          sellers: [],

          purchaseSeller: "",

          purchasePrice: 0,

          purchaseUrl: "",

          brand:
            manufacturer.brand,

          manufacturer:
            manufacturer.manufacturer,

          modelName:
            manufacturer.modelName,

          categoryName:
            category,

          topReviews: [],
        };

        console.log(
          \`[ENRICH \${position}] Manufacturer 상세 사용\`,
          detail.title,
        );
      } else {
        detail =
          await getCachedProductDetail(
            resolvedProductId,
          );

        usedCache =
          Boolean(detail);

        if (detail) {
          console.log(
            \`[ENRICH \${position}] DB 상세 캐시 사용\`,
            resolvedProductId,
          );
        }
      }

      const brightDataStartedAt =
        Date.now();

      if (
        !detail &&
        canonicalSourceType ===
          "naver-brand"
      ) {
        console.log(
          \`[ENRICH \${position}] Bright Data 시작\`,
          resolvedUrl,
        );

        try {
          detail =
            await collectNaverProduct(
              resolvedUrl,
            );`,
  "source-specific detail collection",
);

/*
  8. Bright Data 완료 로그
*/
replaceOnceRegex(
  /if\s*\(!usedCache\)\s*\{\s*console\.log\(\s*`\[ENRICH \$\{position\}\] Bright Data 완료`,/,
`if (
        canonicalSourceType ===
          "naver-brand" &&
        !usedCache &&
        detail
      ) {
        console.log(
          \`[ENRICH \${position}] Bright Data 완료\`,`,
  "Bright Data done guard",
);

/*
  9. validation
*/
replaceOnceRegex(
  /const usable\s*=\s*Boolean\(\s*detail\.productId,\s*\)\s*&&\s*Boolean\(\s*detail\.title,\s*\)\s*&&\s*detail\.finalPrice\s*>\s*0\s*&&\s*matchValidation\.matched;/,
`const usable =
        Boolean(
          detail.title,
        ) &&
        detail.finalPrice >
          0 &&
        matchValidation.matched &&
        (
          canonicalSourceType ===
            "manufacturer" ||
          Boolean(
            detail.productId,
          )
        );`,
  "source-aware usable",
);

/*
  10. finalProductId
*/
replaceOnceRegex(
  /const finalProductId\s*=\s*String\(\s*detail\.productId,\s*\);/,
`const finalProductId =
        canonicalSourceType ===
          "naver-brand"
          ? String(
              detail.productId,
            )
          : "";`,
  "Manufacturer empty productId",
);

/*
  11. 성공 결과에 identityKey
*/
replaceOnceRegex(
  /productId:\s*finalProductId,\s*resolverAttempts:\s*candidateResolverAttempts,/,
`productId:
          finalProductId,

        identityKey,

        resolverAttempts:
          candidateResolverAttempts,`,
  "success result identity",
);

/*
  12. canonicalSource metadata
*/
replaceOnceRegex(
  /canonicalSource:\s*\{\s*productId:\s*finalProductId,\s*brandName:\s*resolvedBrandName\s*\|\|\s*detail\.brand,\s*brandSite:\s*resolvedBrandSite,\s*url:\s*resolvedUrl,\s*\},/,
`canonicalSource: {
            productId:
              finalProductId,

            brandName:
              resolvedBrandName ||
              detail.brand,

            brandSite:
              resolvedBrandSite,

            url:
              resolvedUrl,

            sourceType:
              canonicalSourceType,

            identityKey,
          },`,
  "canonicalSource metadata",
);

/*
  resolution metadata
*/
replaceOnceRegex(
  /resolution:\s*\{\s*productId:\s*finalProductId,\s*brandName:\s*resolvedBrandName,\s*brandSite:\s*resolvedBrandSite,\s*canonicalUrl:\s*resolvedUrl,\s*\},/,
`resolution: {
            productId:
              finalProductId,

            brandName:
              resolvedBrandName,

            brandSite:
              resolvedBrandSite,

            canonicalUrl:
              resolvedUrl,

            sourceType:
              canonicalSourceType,

            identityKey,
          },`,
  "resolution metadata",
);

/*
  Manufacturer canonical fallback 표시는
  naver-store로 거짓 표기하지 않는다.
*/
text =
  text.replace(
`                  sourceType:
                    "naver-store" as const,`,
`                  sourceType:
                    canonicalSourceType ===
                      "manufacturer"
                      ? "external-store" as const
                      : "naver-store" as const,`,
  );

/*
  13. canonical 자체 상세 수집 호출 횟수.
*/
replaceOnceRegex(
  /\(\s*usedCache\s*\?\s*0\s*:\s*1\s*\)\s*\+\s*extraReviewBrightDataCalls,/,
`(
            canonicalSourceType ===
              "naver-brand"
              ? (
                  usedCache
                    ? 0
                    : 1
                )
              : 0
          ) +
          extraReviewBrightDataCalls,`,
  "Bright Data accounting",
);

/*
  14. 배치 최종 중복검사.

  ProcessSuccess.identityKey는 optional이므로
  과거 partial에도 안전한 fallback key를 만든다.
*/
replaceOnceRegex(
  /\/\*\s*같은 배치 안에서\s*동일 상품이 동시에 통과했을 수 있으므로\s*여기서 최종 중복검사\.\s*\*\/\s*if\s*\(\s*seenIdentityKeys\.has\(\s*result\.productId,\s*\)\s*\)\s*\{/,
`/*
          같은 배치 안에서
          동일 canonical 상품이 동시에 통과했을 수 있으므로
          여기서 최종 중복검사.
        */
        const resultIdentityKey =
          result.identityKey ||
          (
            result.productId
              ? \`legacy:\${result.productId}\`
              : \`market:\${result.position}:\${result.candidate.market.sourceUrl}\`
          );

        if (
          seenIdentityKeys.has(
            resultIdentityKey,
          )
        ) {`,
  "batch identity duplicate",
);

text =
  text.replace(
    /`Bright Data 기준 동일상품 중복: \$\{result\.productId\}`/,
    "`Canonical 기준 동일상품 중복: ${resultIdentityKey}`",
  );

text =
  text.replace(
    /seenIdentityKeys\.add\(\s*result\.productId,\s*\);/g,
`seenIdentityKeys.add(
            resultIdentityKey,
          );`,
  );

/*
  마지막 안전검사
*/
if (
  text.includes(
    "seenProductIds"
  )
) {
  throw new Error(
    "seenProductIds가 아직 남아 있습니다."
  );
}

fs.writeFileSync(
  path,
  text,
  "utf8",
);

console.log("");
console.log(
  "===== 안전 Manufacturer 생산 패치 완료 =====",
);
