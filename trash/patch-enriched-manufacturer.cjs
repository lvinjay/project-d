const fs = require("fs");

const path =
  "app/api/market-candidates-enriched/route.ts";

let text =
  fs.readFileSync(
    path,
    "utf8",
  );

function replaceOnce(
  oldText,
  newText,
  label,
) {
  if (
    !text.includes(
      oldText,
    )
  ) {
    throw new Error(
      `PATCH_NOT_FOUND: ${label}`,
    );
  }

  text =
    text.replace(
      oldText,
      newText,
    );

  console.log(
    `[PATCH] ${label}`,
  );
}

/*
  --------------------------------------------------
  1. 공용 Manufacturer 모듈 import
  --------------------------------------------------
*/
const importAnchor =
`import {
  resolveNaverBrandProductUrl,
} from "../../../lib/resolveNaverBrandProductUrl";
`;

const importReplacement =
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
`;

replaceOnce(
  importAnchor,
  importReplacement,
  "Manufacturer imports",
);

/*
  --------------------------------------------------
  2. ProcessSuccess에 identityKey 추가

  productId는 기존 호환성을 위해 유지.
  Manufacturer는 빈 문자열일 수 있다.
  --------------------------------------------------
*/
const successTypeOld =
`type ProcessSuccess = {
  success: true;

  position: number;

  productId: string;

  candidate: FinalCandidate;
`;

const successTypeNew =
`type ProcessSuccess = {
  success: true;

  position: number;

  productId: string;

  identityKey: string;

  candidate: FinalCandidate;
`;

replaceOnce(
  successTypeOld,
  successTypeNew,
  "ProcessSuccess identityKey",
);

/*
  --------------------------------------------------
  3. seenProductIds -> seenIdentityKeys
  --------------------------------------------------
*/
text =
  text.replace(
    /seenProductIds/g,
    "seenIdentityKeys",
  );

const seenDeclarationOld =
`    const seenIdentityKeys =
      new Set<string>();`;

if (
  !text.includes(
    seenDeclarationOld,
  )
) {
  throw new Error(
    "PATCH_NOT_FOUND: seenIdentityKeys declaration",
  );
}

console.log(
  "[PATCH] duplicate Set -> identityKey",
);

/*
  --------------------------------------------------
  4. processCandidate 상태 변수 확장
  --------------------------------------------------
*/
const variableOld =
`      let resolvedBrandSite =
        "";

      /*
        URL 처리 원칙:`;

const variableNew =
`      let resolvedBrandSite =
        "";

      let canonicalSourceType:
        | "naver-brand"
        | "manufacturer" =
        "naver-brand";

      let identityKey =
        "";

      /*
        Manufacturer에서 상세를 무료 direct fetch로
        먼저 확보한 경우 여기에 저장한다.
      */
      let manufacturerDetail:
        Awaited<
          ReturnType<
            typeof collectManufacturerProduct
          >
        > | null =
        null;

      /*
        URL 처리 원칙:`;

replaceOnce(
  variableOld,
  variableNew,
  "processCandidate canonical state",
);

/*
  --------------------------------------------------
  5. 직접 Brand URL일 때 identity 생성
  --------------------------------------------------
*/
const directBrandOld =
`        resolvedBrandSite =
          resolvedUrl.replace(
            /\/products\/\d+.*$/i,
            "",
          );

        console.log(
          \`[ENRICH \${position}] Brand 상품 URL 직접 사용\`,
          resolvedUrl,
        );`;

const directBrandNew =
`        resolvedBrandSite =
          resolvedUrl.replace(
            /\/products\/\d+.*$/i,
            "",
          );

        canonicalSourceType =
          "naver-brand";

        identityKey =
          \`naver:\${resolvedProductId}\`;

        console.log(
          \`[ENRICH \${position}] Brand 상품 URL 직접 사용\`,
          resolvedUrl,
        );`;

replaceOnce(
  directBrandOld,
  directBrandNew,
  "direct Naver identity",
);

/*
  --------------------------------------------------
  6. Resolver 실패 -> Manufacturer fallback

  기존에는 여기서 즉시 partial 반환했다.
  이제:
  - 상품명의 개별 토큰으로 학습된 공식몰 검색
  - 강한 모델토큰 추출
  - 무료 Manufacturer collector 실행
  - 성공 시 생산 흐름 계속 진행
  - 실패한 경우에만 기존 partial
  --------------------------------------------------
*/
const resolveFailOld =
`          if (
            !resolved.success ||
            !resolved.canonicalUrl
          ) {
            const reason =
              resolved.reason ??
              "공식 Brand 상품 URL을 찾지 못했습니다.";

            console.log(
              \`[ENRICH \${position}] partial 유지(resolve 실패)\`,
              reason,
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
          }`;

const resolveFailNew =
`          if (
            !resolved.success ||
            !resolved.canonicalUrl
          ) {
            const naverReason =
              resolved.reason ??
              "공식 Brand 상품 URL을 찾지 못했습니다.";

            /*
              Naver canonical 실패 시에만
              제조사 공식몰 fallback을 시도한다.

              브랜드를 특정 카테고리에 하드코딩하지 않고
              상품명 토큰을 기존 official_site_mappings와
              대조한다.
            */
            const brandCandidates =
              market.name
                .split(/\\s+/)
                .map(
                  (value) =>
                    value.trim(),
                )
                .filter(Boolean)
                .slice(0, 12);

            const officialMapping =
              await findOfficialSiteMapping(
                brandCandidates,
              );

            const manufacturerSearchTerms =
              getStrongSearchModelTokens(
                market.name
                  .split(/\\s+/)
                  .filter(Boolean),
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

                  identityKey =
                    \`manufacturer:\${resolvedUrl}\`;

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

              const partialProductId =
                extractMarketProductId(
                  market.url,
                ) ||
                \`partial-\${position}\`;

              return {
                success: true,

                position,

                productId:
                  partialProductId,

                identityKey:
                  \`partial:\${partialProductId}\`,

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
          }`;

replaceOnce(
  resolveFailOld,
  resolveFailNew,
  "resolver failure -> manufacturer fallback",
);

/*
  --------------------------------------------------
  7. Naver Resolver 성공 identity 설정
  --------------------------------------------------
*/
const resolvedAssignOld =
`          resolvedBrandSite =
            resolved.brandSite;

          console.log(
            \`[ENRICH \${position}] Bright Data용 Brand URL 확정\`,
            resolvedUrl,
          );`;

const resolvedAssignNew =
`          resolvedBrandSite =
            resolved.brandSite;

          canonicalSourceType =
            "naver-brand";

          identityKey =
            \`naver:\${resolvedProductId}\`;

          console.log(
            \`[ENRICH \${position}] Bright Data용 Brand URL 확정\`,
            resolvedUrl,
          );`;

replaceOnce(
  resolvedAssignOld,
  resolvedAssignNew,
  "resolved Naver identity",
);

/*
  --------------------------------------------------
  8. Resolver catch partial에도 identityKey
  --------------------------------------------------
*/
const catchPartialOld =
`          return {
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
          };`;

const catchPartialNew =
`          const partialProductId =
            extractMarketProductId(
              market.url,
            ) ||
            \`partial-\${position}\`;

          return {
            success: true,

            position,

            productId:
              partialProductId,

            identityKey:
              \`partial:\${partialProductId}\`,

            resolverAttempts:
              candidateResolverAttempts,

            brightDataCalls: 0,

            candidate:
              createPartialMarketCandidate(
                market,
                position,
              ),
          };`;

replaceOnce(
  catchPartialOld,
  catchPartialNew,
  "resolver catch partial identity",
);

/*
  --------------------------------------------------
  9. identityKey가 비어 있으면 Naver 기준 생성
  --------------------------------------------------
*/
const duplicateCommentOld =
`      /*
        이전 배치에서 이미 확보된 상품이면
        Bright Data 호출 전에 차단.
      */
      if (
        seenIdentityKeys.has(
          resolvedProductId,
        )
      ) {
        const reason =
          \`동일 상품번호 중복: \${resolvedProductId}\`;`;

const duplicateCommentNew =
`      if (
        !identityKey
      ) {
        identityKey =
          resolvedProductId
            ? \`naver:\${resolvedProductId}\`
            : \`url:\${resolvedUrl}\`;
      }

      /*
        이전 배치에서 이미 확보된 상품이면
        상세수집 전에 차단.

        Naver:
        naver:{productId}

        Manufacturer:
        manufacturer:{canonicalUrl}
      */
      if (
        seenIdentityKeys.has(
          identityKey,
        )
      ) {
        const reason =
          \`동일 canonical identity 중복: \${identityKey}\`;`;

replaceOnce(
  duplicateCommentOld,
  duplicateCommentNew,
  "early duplicate identity",
);

/*
  --------------------------------------------------
  10. 상세수집부:
      Manufacturer는 Naver cache/Bright Data를 사용하지 않는다.
  --------------------------------------------------
*/
const detailStartOld =
`      let detail:
        NaverProductDetail | null =
        await getCachedProductDetail(
          resolvedProductId,
        );

      let usedCache =
        Boolean(detail);

      if (detail) {
        console.log(
          \`[ENRICH \${position}] DB 상세 캐시 사용\`,
          resolvedProductId,
        );
      }

      const brightDataStartedAt =
        Date.now();

      if (!detail) {
        console.log(
          \`[ENRICH \${position}] Bright Data 시작\`,
          resolvedUrl,
        );

        try {
          detail =
            await collectNaverProduct(
              resolvedUrl,
            );
        } catch (error) {`;

const detailStartNew =
`      let detail:
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

        /*
          이후의 공용 판매처/리뷰 선택 코드를
          그대로 재사용하기 위한 호환 detail.

          가짜 Naver productId는 만들지 않는다.
        */
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
            );
        } catch (error) {`;

replaceOnce(
  detailStartOld,
  detailStartNew,
  "manufacturer detail branch",
);

/*
  --------------------------------------------------
  11. Bright Data 완료 로그는 Naver일 때만
  --------------------------------------------------
*/
const brightDoneOld =
`      if (!usedCache) {
        console.log(
          \`[ENRICH \${position}] Bright Data 완료\`,`;

const brightDoneNew =
`      if (
        canonicalSourceType ===
          "naver-brand" &&
        !usedCache &&
        detail
      ) {
        console.log(
          \`[ENRICH \${position}] Bright Data 완료\`,`;

replaceOnce(
  brightDoneOld,
  brightDoneNew,
  "Bright Data completion source guard",
);

/*
  --------------------------------------------------
  12. usable 조건 source별 분기
  --------------------------------------------------
*/
const usableOld =
`      const usable =
        Boolean(
          detail.productId,
        ) &&
        Boolean(
          detail.title,
        ) &&
        detail.finalPrice >
          0 &&
        matchValidation.matched;`;

const usableNew =
`      const usable =
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
        );`;

replaceOnce(
  usableOld,
  usableNew,
  "source-aware usable validation",
);

/*
  --------------------------------------------------
  13. finalProductId는 Manufacturer에서 빈 문자열 허용
  --------------------------------------------------
*/
const finalIdOld =
`      const finalProductId =
        String(
          detail.productId,
        );`;

const finalIdNew =
`      const finalProductId =
        canonicalSourceType ===
          "naver-brand"
          ? String(
              detail.productId,
            )
          : "";`;

replaceOnce(
  finalIdOld,
  finalIdNew,
  "manufacturer productId empty",
);

/*
  --------------------------------------------------
  14. 성공 반환에 identityKey 추가
  --------------------------------------------------
*/
const successReturnOld =
`        productId:
          finalProductId,

        resolverAttempts:
          candidateResolverAttempts,`;

const successReturnNew =
`        productId:
          finalProductId,

        identityKey,

        resolverAttempts:
          candidateResolverAttempts,`;

replaceOnce(
  successReturnOld,
  successReturnNew,
  "success identityKey return",
);

/*
  --------------------------------------------------
  15. Manufacturer는 canonical 상세 수집에
      Bright Data 1회를 계산하면 안 된다.
  --------------------------------------------------
*/
const initialBrightCountOld =
`          (
            usedCache
              ? 0
              : 1
          ) +
          extraReviewBrightDataCalls,`;

const initialBrightCountNew =
`          (
            canonicalSourceType ===
              "naver-brand"
              ? (
                  usedCache
                    ? 0
                    : 1
                )
              : 0
          ) +
          extraReviewBrightDataCalls,`;

replaceOnce(
  initialBrightCountOld,
  initialBrightCountNew,
  "Bright Data call accounting",
);

/*
  --------------------------------------------------
  16. canonicalSource / resolution에 공통 identity 정보
  --------------------------------------------------
*/
const canonicalOld =
`          canonicalSource: {
            productId:
              finalProductId,

            brandName:
              resolvedBrandName ||
              detail.brand,

            brandSite:
              resolvedBrandSite,

            url:
              resolvedUrl,
          },`;

const canonicalNew =
`          canonicalSource: {
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
          },`;

replaceOnce(
  canonicalOld,
  canonicalNew,
  "canonical source metadata",
);

const resolutionOld =
`          resolution: {
            productId:
              finalProductId,

            brandName:
              resolvedBrandName,

            brandSite:
              resolvedBrandSite,

            canonicalUrl:
              resolvedUrl,
          },`;

const resolutionNew =
`          resolution: {
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
          },`;

replaceOnce(
  resolutionOld,
  resolutionNew,
  "resolution source metadata",
);

/*
  --------------------------------------------------
  17. FinalCandidate 타입에는 새 필드를 optional로 추가.
      기존 partial 후보 호환성을 유지한다.
  --------------------------------------------------
*/
const canonicalTypeOld =
`  canonicalSource: {
    productId: string;
    brandName: string;
    brandSite: string;
    url: string;
  };`;

const canonicalTypeNew =
`  canonicalSource: {
    productId: string;
    brandName: string;
    brandSite: string;
    url: string;
    sourceType?:
      | "naver-brand"
      | "manufacturer";
    identityKey?: string;
  };`;

replaceOnce(
  canonicalTypeOld,
  canonicalTypeNew,
  "FinalCandidate canonical type",
);

const resolutionTypeOld =
`  resolution: {
    productId: string;
    brandName: string;
    brandSite: string;
    canonicalUrl: string;
  };`;

const resolutionTypeNew =
`  resolution: {
    productId: string;
    brandName: string;
    brandSite: string;
    canonicalUrl: string;
    sourceType?:
      | "naver-brand"
      | "manufacturer";
    identityKey?: string;
  };`;

replaceOnce(
  resolutionTypeOld,
  resolutionTypeNew,
  "FinalCandidate resolution type",
);

/*
  --------------------------------------------------
  18. 최종 배치 중복검사 identityKey 기준
  --------------------------------------------------
*/
const batchDuplicateOld =
`        if (
          seenIdentityKeys.has(
            result.productId,
          )
        ) {`;

const batchDuplicateNew =
`        if (
          seenIdentityKeys.has(
            result.identityKey,
          )
        ) {`;

replaceOnce(
  batchDuplicateOld,
  batchDuplicateNew,
  "batch duplicate lookup",
);

text =
  text.replace(
`                \`Bright Data 기준 동일상품 중복: \${result.productId}\`,`,
`                \`Canonical 기준 동일상품 중복: \${result.identityKey}\`,`,
  );

text =
  text.replace(
`          seenIdentityKeys.add(
            result.productId,
          );`,
`          seenIdentityKeys.add(
            result.identityKey,
          );`,
  );

text =
  text.replace(
`        seenIdentityKeys.add(
          result.productId,
        );`,
`        seenIdentityKeys.add(
          result.identityKey,
        );`,
  );

/*
  --------------------------------------------------
  저장
  --------------------------------------------------
*/
fs.writeFileSync(
  path,
  text,
  "utf8",
);

console.log("");
console.log(
  "===== Manufacturer 생산 Enriched 패치 완료 =====",
);
