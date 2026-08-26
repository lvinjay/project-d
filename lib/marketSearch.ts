export type MarketSearchResult = {
  name: string;
  brand: string;
  price: number;
  image: string;
  url: string;
  reviewCount: number;
  rating: number;
};

export type ProductOffer = MarketSearchResult & {
  matchScore: number;

  /*
    네이버 광고(ader) 링크처럼 실제 판매처로
    307 redirect 되는 경우 최종 목적지를 저장한다.
  */
  resolvedUrl: string;

  sourceType:
    | "naver-store"
    | "external-store"
    | "naver-aggregate"
    | "unknown";

  isIndividualSeller: boolean;
};

export type ProductOfferSearchResult = {
  offers: ProductOffer[];
  reviewSource: ProductOffer | null;
  purchaseSource: ProductOffer | null;
};

type SerpApiShoppingResult = {
  position?: number;
  title?: string;
  price?: number | string;
  rating?: number | string;
  reviews?: number | string;
  stores?: string;
  link?: string;
  thumbnail?: string;
};

type SerpApiResponse = {
  error?: string;
  shopping_results?: SerpApiShoppingResult[];
};

function normalizeText(
  value: unknown,
) {
  return typeof value === "string"
    ? value
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function normalizeNumber(
  value: unknown,
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const parsed =
    Number(
      value.replace(
        /[^\d.]/g,
        "",
      ),
    );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function createDuplicateKey(
  product: MarketSearchResult,
) {
  return [
    product.name
      .toLowerCase()
      .replace(/\s+/g, ""),
    product.brand
      .toLowerCase()
      .replace(/\s+/g, ""),
    product.price,
  ].join("|");
}

function isUsefulProductName(
  name: string,
  keyword: string,
) {
  const normalizedName =
    name
      .toLowerCase()
      .replace(/\s+/g, "");

  const normalizedKeyword =
    keyword
      .toLowerCase()
      .replace(/\s+/g, "");

  if (
    !normalizedName ||
    normalizedName ===
      normalizedKeyword
  ) {
    return false;
  }

  const banned =
    /호환|소모품|부품|필터|먼지봉투|먼지백|물걸레\s*(패드|포|천|리필)|브러시|브러쉬|배터리|충전기|세정제|액세서리/i;

  return !banned.test(name);
}

function normalizedMatchText(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9가-힣]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function compactToken(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9가-힣]/g,
      "",
    );
}

function getModelTokens(
  productName: string,
) {
  const tokens =
    normalizedMatchText(
      productName,
    )
      .split(" ")
      .filter(Boolean);

  const ignored =
    new Set([
      "로봇청소기",
      "청소기",
      "로봇",
      "올인원",
      "자동",
      "무선",
      "스마트",
      "화이트",
      "블랙",
      "실버",
      "그레이",
      "베이지",
      "단품",
      "정품",
      "공식",
      "물걸레",
      "진공",
      "바닥",
      "걸레",
      "흡입",
      "세척",
    ]);

  const result:
    string[] = [];

  for (
    let index = 0;
    index < tokens.length;
    index++
  ) {
    const token =
      tokens[index];

    if (
      ignored.has(token) ||
      token.length < 2
    ) {
      continue;
    }

    /*
      모델명의 핵심은 보통 숫자가 포함된 토큰
      (X60, P70, S10, N95TWU 등)이다.
    */
    if (/\d/.test(token)) {
      result.push(token);

      /*
        X60 Ultra / P70 Pro / S10 MaxV처럼
        모델번호 바로 뒤 영문 서브모델도 함께 사용한다.
      */
      const next =
        tokens[index + 1];

      if (
        next &&
        /^[a-z][a-z0-9_-]*$/i.test(
          next,
        ) &&
        !ignored.has(next)
      ) {
        result.push(next);
      }
    }
  }

  /*
    X60 Ultra와 X60ULTRA가 동시에 들어있는 제목처럼
    같은 의미의 중복 토큰을 제거한다.
  */
  const unique:
    string[] = [];

  for (const token of result) {
    const compact =
      compactToken(token);

    if (
      !compact ||
      unique.some(
        (existing) =>
          compactToken(existing) ===
          compact,
      )
    ) {
      continue;
    }

    unique.push(token);
  }

  return unique.slice(0, 4);
}

function getVariantTokens(
  productName: string,
) {
  const text =
    normalizedMatchText(
      productName,
    );

  const variants = [
    "화이트",
    "블랙",
    "실버",
    "그레이",
    "베이지",
    "직배수",
    "직배수형",
    "물통형",
    "스팀",
  ];

  return variants.filter(
    (variant) =>
      text.includes(variant),
  );
}


function getPrimaryModelIdentity(
  productName: string,
) {
  const tokens =
    normalizedMatchText(
      productName,
    )
      .split(" ")
      .filter(Boolean);

  for (
    let index = 0;
    index < tokens.length;
    index++
  ) {
    const token =
      tokens[index];

    /*
      첫 번째 숫자 포함 토큰을 모델 코어로 본다.
      예: X60 / P70 / S10 / N95TWU
    */
    if (!/\d/.test(token)) {
      continue;
    }

    const next =
      tokens[index + 1] ??
      "";

    /*
      모델 코어 바로 뒤의 영문 토큰만
      서브모델 식별자로 사용한다.
      예: X60 Master / X60 Ultra
          P70 Pro / S10 MaxV

      뒤쪽의 17cm 같은 치수/마케팅 숫자는
      모델 identity 충돌 판정에 사용하지 않는다.
    */
    const suffix =
      next &&
      /^[a-z][a-z0-9_-]*$/i.test(
        next,
      )
        ? compactToken(next)
        : "";

    return {
      core:
        compactToken(token),

      suffix,
    };
  }

  return {
    core: "",
    suffix: "",
  };
}

function hasConflictingModelIdentity(
  targetName: string,
  offerName: string,
) {
  const target =
    getPrimaryModelIdentity(
      targetName,
    );

  const offer =
    getPrimaryModelIdentity(
      offerName,
    );

  /*
    모델 코어가 다르면 이 함수에서는 충돌로 단정하지 않는다.
    기존 offerMatchScore가 모델 토큰 일치도를 별도로 검증한다.
  */
  if (
    !target.core ||
    !offer.core ||
    target.core !==
      offer.core
  ) {
    return false;
  }

  /*
    양쪽 모두 명시적인 서브모델이 있을 때만 충돌 판정한다.

    X60 Master vs X60 Ultra => 충돌
    S10 MaxV vs S10 MaxV Ultra => 충돌 아님
    X60 Master vs X60(서브모델 미표기) => 여기서는 보류
  */
  return Boolean(
    target.suffix &&
    offer.suffix &&
    target.suffix !==
      offer.suffix,
  );
}

function hasConflictingVariant(
  targetName: string,
  offerName: string,
) {
  const target =
    normalizedMatchText(
      targetName,
    );

  const offer =
    normalizedMatchText(
      offerName,
    );

  const colorGroups = [
    ["화이트", "블랙"],
    ["화이트", "실버"],
    ["화이트", "그레이"],
    ["화이트", "베이지"],
    ["블랙", "실버"],
    ["블랙", "그레이"],
    ["블랙", "베이지"],
  ];

  for (
    const [a, b] of colorGroups
  ) {
    if (
      (
        target.includes(a) &&
        offer.includes(b)
      ) ||
      (
        target.includes(b) &&
        offer.includes(a)
      )
    ) {
      return true;
    }
  }

  /*
    직배수형과 물통형은 같은 모델명이어도
    구매 구성이 다를 수 있으므로 충돌로 본다.
  */
  const targetDirect =
    target.includes("직배수");

  const offerDirect =
    offer.includes("직배수");

  const targetTank =
    target.includes("물통형");

  const offerTank =
    offer.includes("물통형");

  if (
    (
      targetDirect &&
      offerTank
    ) ||
    (
      targetTank &&
      offerDirect
    )
  ) {
    return true;
  }

  return false;
}

function offerMatchScore(
  targetName: string,
  offerName: string,
) {
  const targetText =
    normalizedMatchText(
      targetName,
    );

  const offerText =
    normalizedMatchText(
      offerName,
    );

  if (
    !targetText ||
    !offerText
  ) {
    return 0;
  }

  if (
    hasConflictingModelIdentity(
      targetName,
      offerName,
    ) ||
    hasConflictingVariant(
      targetName,
      offerName,
    )
  ) {
    return 0;
  }

  const modelTokens =
    getModelTokens(
      targetName,
    );

  if (modelTokens.length === 0) {
    return 0;
  }

  let matched = 0;

  for (
    const token of modelTokens
  ) {
    const compact =
      compactToken(token);

    const offerCompact =
      compactToken(
        offerText,
      );

    if (
      compact &&
      offerCompact.includes(
        compact,
      )
    ) {
      matched++;
    }
  }

  /*
    모델 핵심 토큰을 하나도 못 맞추면
    동일 제품 판매처 후보로 보지 않는다.
  */
  if (matched === 0) {
    return 0;
  }

  const ratio =
    matched /
    modelTokens.length;

  let score =
    ratio * 100;

  const variants =
    getVariantTokens(
      targetName,
    );

  for (
    const variant of variants
  ) {
    if (
      offerText.includes(
        variant,
      )
    ) {
      score += 5;
    }
  }

  /*
    완전히 같은 정규화 상품명은 강하게 우대.
  */
  if (
    targetText ===
    offerText
  ) {
    score += 20;
  }

  return score;
}

function extractOfferProductId(
  value: string,
) {
  try {
    const url =
      new URL(value);

    const nvMid =
      url.searchParams
        .get("nv_mid")
        ?.trim();

    if (
      nvMid &&
      /^\d+$/.test(nvMid)
    ) {
      return nvMid;
    }
  } catch {
    // 정규식 fallback 사용
  }

  return (
    value.match(
      /[?&]nv_mid=(\d+)/i,
    )?.[1] ??
    ""
  );
}

function getOfferSourceType(
  seller: string,
  originalUrl: string,
  resolvedUrl: string,
): ProductOffer["sourceType"] {
  const sellerText =
    seller.trim();

  const target =
    (resolvedUrl || originalUrl)
      .trim()
      .toLowerCase();

  if (
    /^판매처\s*\d+$/i.test(
      sellerText,
    )
  ) {
    return "naver-aggregate";
  }

  if (
    target.includes(
      "brand.naver.com",
    ) ||
    target.includes(
      "smartstore.naver.com",
    )
  ) {
    return "naver-store";
  }

  if (
    target.includes(
      "cr3.shopping.naver.com",
    )
  ) {
    return "naver-aggregate";
  }

  if (
    /^https?:\/\//i.test(
      target,
    )
  ) {
    return "external-store";
  }

  return "unknown";
}

async function resolveAderUrl(
  value: string,
) {
  if (
    !value.includes(
      "ader.naver.com",
    )
  ) {
    return value;
  }

  /*
    Naver ader 광고 링크는 SmartStore/Brand 상품까지
    여러 번 redirect될 수 있다.

    한 번의 Location만 읽으면 중간 Naver URL에서 멈춰
    실제 공식 판매처를 naver-store로 판정하지 못할 수 있다.

    최대 5단계까지만 따라가며,
    SmartStore/Brand URL을 확인하는 즉시 추가 요청 없이 반환한다.
  */
  let currentUrl = value;

  try {
    for (
      let redirectCount = 0;
      redirectCount < 5;
      redirectCount++
    ) {
      const response =
        await fetch(
          currentUrl,
          {
            redirect: "manual",
            headers: {
              "User-Agent":
                "Mozilla/5.0",
            },
            cache: "no-store",
          },
        );

      const location =
        response.headers
          .get("location")
          ?.trim();

      if (!location) {
        return currentUrl;
      }

      const nextUrl =
        new URL(
          location,
          currentUrl,
        ).toString();

      if (
        nextUrl.includes(
          "brand.naver.com",
        )
      ) {
        return nextUrl;
      }

      if (
        nextUrl.includes(
          "smartstore.naver.com",
        ) &&
        !nextUrl.includes(
          "/main/products/",
        )
      ) {
        return nextUrl;
      }

      currentUrl = nextUrl;
    }

    return currentUrl;
  } catch {
    return currentUrl || value;
  }
}

function isIndividualSellerName(
  seller: string,
) {
  const text =
    seller.trim();

  if (!text) {
    return false;
  }

  if (
    /^판매처\s*\d+$/i.test(
      text,
    )
  ) {
    return false;
  }

  if (
    /^포인트\s*최대/i.test(
      text,
    )
  ) {
    return false;
  }

  if (
    text ===
    "판매처 미확인"
  ) {
    return false;
  }

  return true;
}

function isBadOfferTitle(
  name: string,
) {
  const banned =
    /호환|소모품|부품|필터|먼지봉투|먼지백|물걸레\s*(패드|포|천|리필)|브러시|브러쉬|배터리|충전기|세정제|액세서리|악세사리|리퍼|중고|해외직구/i;

  return banned.test(name);
}

async function searchNaverShopping(
  query: string,
  apiKey: string,
) {
  const params =
    new URLSearchParams({
      engine: "naver",
      query,
      where: "nexearch",
      output: "json",
      api_key: apiKey,
    });

  const response =
    await fetch(
      `https://serpapi.com/search?${params.toString()}`,
      {
        cache: "no-store",
      },
    );

  const data =
    (await response.json()) as
      SerpApiResponse;

  if (
    !response.ok ||
    data.error
  ) {
    throw new Error(
      data.error ??
        `상품 검색에 실패했습니다. (${response.status})`,
    );
  }

  return Array.isArray(
    data.shopping_results,
  )
    ? data.shopping_results
    : [];
}

export async function searchMarketProducts(
  keyword: string,
  limit = 15,
): Promise<MarketSearchResult[]> {
  const normalizedKeyword =
    keyword.trim();

  if (!normalizedKeyword) {
    return [];
  }

  const apiKey =
    process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "SERPAPI_API_KEY가 설정되지 않았습니다.",
    );
  }

  /*
    1차 검색에서는 SmartStore URL 여부로 상품을 버리지 않는다.

    네이버 검색결과의 대표상품은 cr3/ader 링크로 노출되는 경우가 많아서
    여기서 SmartStore만 필터링하면 정상 제품 대부분이 사라진다.

    대신 대표제품 풀을 먼저 만들고,
    searchSmartStoreMarketProducts()에서 동일 모델의 실제
    SmartStore/BrandStore 리뷰 판매처를 재검증한다.
  */
  const queries = [
    normalizedKeyword,
    `${normalizedKeyword} 추천`,
    `${normalizedKeyword} 인기`,
    `${normalizedKeyword} 비교`,
  ];

  const uniqueProducts:
    MarketSearchResult[] = [];

  /*
    1차 후보의 중복 기준은 판매등록이 아니라 "대표 모델"이다.

    같은 모델이 판매처/가격/광고 문구만 달라 여러 번 노출돼도
    후보 자리를 여러 개 차지하지 않도록 한다.

    모델 식별자가 없는 상품만 기존
    상품명 + 판매처 + 가격 키를 fallback으로 사용한다.
  */
  const seenModelKeys =
    new Map<string, number>();

  const seenFallbackKeys =
    new Set<string>();

  for (
    const query of queries
  ) {
    if (
      uniqueProducts.length >=
      limit
    ) {
      break;
    }

    const rawResults =
      await searchNaverShopping(
        query,
        apiKey,
      );

    for (
      const item of
      rawResults
    ) {
      const name =
        normalizeText(
          item.title,
        );

      const url =
        normalizeText(
          item.link,
        );

      const price =
        normalizeNumber(
          item.price,
        );

      if (
        !name ||
        !url ||
        price <= 0 ||
        !isUsefulProductName(
          name,
          normalizedKeyword,
        )
      ) {
        continue;
      }

      const product:
        MarketSearchResult = {
          name,

          brand:
            normalizeText(
              item.stores,
            ) ||
            "판매처 미확인",

          price,

          image:
            normalizeText(
              item.thumbnail,
            ),

          url,

          reviewCount:
            Math.round(
              normalizeNumber(
                item.reviews,
              ),
            ),

          rating:
            normalizeNumber(
              item.rating,
            ),
        };

      const identity =
        getPrimaryModelIdentity(
          product.name,
        );

      const modelKey =
        identity.core
          ? `${identity.core}|${identity.suffix}`
          : "";

      if (modelKey) {
        const existingIndex =
          seenModelKeys.get(
            modelKey,
          );

        if (
          existingIndex !==
          undefined
        ) {
          /*
            같은 모델의 판매등록이 여러 개면
            리뷰 수가 더 많은 대표등록으로 교체한다.
            리뷰 수가 같으면 평점이 높은 쪽을 사용한다.
          */
          const existing =
            uniqueProducts[
              existingIndex
            ];

          if (
            product.reviewCount >
              existing.reviewCount ||
            (
              product.reviewCount ===
                existing.reviewCount &&
              product.rating >
                existing.rating
            )
          ) {
            uniqueProducts[
              existingIndex
            ] = product;
          }

          continue;
        }

        seenModelKeys.set(
          modelKey,
          uniqueProducts.length,
        );
      } else {
        const fallbackKey =
          createDuplicateKey(
            product,
          );

        if (
          seenFallbackKeys.has(
            fallbackKey,
          )
        ) {
          continue;
        }

        seenFallbackKeys.add(
          fallbackKey,
        );
      }

      uniqueProducts.push(
        product,
      );

      if (
        uniqueProducts.length >=
        limit
      ) {
        break;
      }
    }
  }

  return uniqueProducts;
}

/*
  Project D의 네이버쇼핑 기준 대표후보 생성.

  흐름:
  1. 네이버쇼핑에서 대표제품 풀을 넉넉히 확보한다.
  2. 각 제품의 동일 모델 판매처를 다시 확인한다.
  3. 리뷰가 있는 SmartStore/BrandStore 판매처가 실제로 존재하는
     제품만 최종 시장후보로 인정한다.
  4. 같은 모델/구성은 한 번만 남긴다.

  비용 제한:
  - 대표제품 풀은 우선 목표 개수만 확인한다.
  - 판매처 재검색은 제품당 compact query 1회만 사용한다.
  - 목표 개수가 채워지면 즉시 중단한다.

  limit=15 기준 대표모델 검색은 최대 4회다.
  SmartStore 판매처 확인은 후보가 15개 채워지는 즉시 중단한다.

  단, 검증 실패가 많으면 최대 30개 대표모델까지 확인할 수 있으므로
  개발 테스트에서는 호출 수를 확인하면서 사용한다.
*/
export async function searchSmartStoreMarketProducts(
  keyword: string,
  limit = 15,
): Promise<MarketSearchResult[]> {
  /*
    SmartStore/BrandStore 검증 과정에서 일부 모델이 탈락하므로
    대표 모델 풀은 목표 개수보다 넓게 확보한다.

    기본 limit=15일 때 최대 30개의 서로 다른 대표 모델을 확보하고,
    SmartStore 리뷰 후보가 15개 채워지는 즉시 아래 검증 루프를 중단한다.
  */
  const poolLimit =
    Math.max(
      limit,
      Math.min(
        30,
        limit * 2,
      ),
    );

  const marketProducts =
    await searchMarketProducts(
      keyword,
      poolLimit,
    );

  const candidates:
    MarketSearchResult[] = [];

  const seenModels =
    new Set<string>();

  for (
    const product of marketProducts
  ) {
    if (
      candidates.length >=
      limit
    ) {
      break;
    }

    const identity =
      getPrimaryModelIdentity(
        product.name,
      );

    const modelKey =
      identity.core
        ? `${identity.core}|${identity.suffix}`
        : compactToken(
            product.name,
          );

    if (
      modelKey &&
      seenModels.has(modelKey)
    ) {
      continue;
    }

    const directSourceType =
      getOfferSourceType(
        product.brand,
        product.url,
        product.url,
      );

    let selected:
      MarketSearchResult | null =
      null;

    if (
      directSourceType ===
        "naver-store" &&
      isIndividualSellerName(
        product.brand,
      ) &&
      product.reviewCount > 0
    ) {
      selected =
        product;
    } else {
      const offerSearch =
        await searchProductOffers(
          product.name,
          1,
        );

      const reviewSource =
        offerSearch.reviewSource;

      if (reviewSource) {
        selected = {
          name:
            product.name,

          brand:
            reviewSource.brand,

          price:
            reviewSource.price > 0
              ? reviewSource.price
              : product.price,

          image:
            reviewSource.image ||
            product.image,

          url:
            reviewSource.resolvedUrl ||
            reviewSource.url,

          reviewCount:
            reviewSource.reviewCount,

          rating:
            reviewSource.rating,
        };
      }
    }

    if (!selected) {
      continue;
    }

    if (modelKey) {
      seenModels.add(modelKey);
    }

    candidates.push(
      selected,
    );
  }

  return candidates;
}

/*
  특정 모델의 네이버 판매처들을 다시 검색한다.

  역할:
  - reviewSource: 동일 모델/구성 후보 중 리뷰 수가 가장 많은 결과
  - purchaseSource: 동일 모델/구성 후보 중 최저가
    (동가이면 리뷰 수가 많은 결과 우선)

  주의:
  이 함수는 '판매처 후보 선택'까지만 담당한다.
  실제 리뷰 상세수집 가능 여부와 구매링크 최종 검증은
  이후 단계에서 별도로 확인한다.
*/
export async function searchProductOffers(
  productName: string,
  queryLimit = 2,
): Promise<ProductOfferSearchResult> {
  const normalizedName =
    productName.trim();

  if (!normalizedName) {
    return {
      offers: [],
      reviewSource: null,
      purchaseSource: null,
    };
  }

  const apiKey =
    process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "SERPAPI_API_KEY가 설정되지 않았습니다.",
    );
  }

  const modelTokens =
    getModelTokens(
      normalizedName,
    );

  /*
    너무 긴 원본 상품명 대신
    브랜드/모델 핵심을 우선 검색한다.
    모델 토큰이 없으면 원본 제목을 사용한다.
  */
  const firstToken =
    normalizedMatchText(
      normalizedName,
    )
      .split(" ")
      .filter(Boolean)[0] ??
    "";

  const compactQuery =
    [
      firstToken,
      ...modelTokens,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  const queries =
    [
      compactQuery,
      normalizedName,
    ]
      .filter(Boolean)
      .filter(
        (
          query,
          index,
          array,
        ) =>
          array.indexOf(query) ===
          index,
      );

  const offers:
    ProductOffer[] = [];

  const seen =
    new Set<string>();

  for (
    const query of queries.slice(
      0,
      Math.max(
        1,
        Math.min(
          queryLimit,
          queries.length,
        ),
      ),
    )
  ) {
    const rawResults =
      await searchNaverShopping(
        query,
        apiKey,
      );

    for (
      const item of rawResults
    ) {
      const name =
        normalizeText(
          item.title,
        );

      const url =
        normalizeText(
          item.link,
        );

      const price =
        normalizeNumber(
          item.price,
        );

      if (
        !name ||
        !url ||
        price <= 0 ||
        isBadOfferTitle(name)
      ) {
        continue;
      }

      const matchScore =
        offerMatchScore(
          normalizedName,
          name,
        );

      /*
        모델 핵심 토큰 대부분이 맞는 후보만 사용한다.
        50점 미만은 다른 모델일 가능성이 높아 제외한다.
      */
      if (matchScore < 50) {
        continue;
      }

      const seller =
        normalizeText(
          item.stores,
        ) ||
        "판매처 미확인";

      const resolvedUrl =
        await resolveAderUrl(
          url,
        );

      const sourceType =
        getOfferSourceType(
          seller,
          url,
          resolvedUrl,
        );

      const offer:
        ProductOffer = {
          name,

          brand:
            seller,

          price,

          image:
            normalizeText(
              item.thumbnail,
            ),

          url,

          reviewCount:
            Math.round(
              normalizeNumber(
                item.reviews,
              ),
            ),

          rating:
            normalizeNumber(
              item.rating,
            ),

          matchScore,

          resolvedUrl,

          sourceType,

          isIndividualSeller:
            isIndividualSellerName(
              seller,
            ) &&
            sourceType !==
              "naver-aggregate",
        };

      const offerProductId =
        extractOfferProductId(
          offer.url,
        );

      /*
        같은 네이버 상품이 검색어만 달라져
        query/t/h 추적값 때문에 여러 번 들어오는 것을 막는다.

        nv_mid가 있으면 그것을 가장 강한 중복키로 사용하고,
        nv_mid가 없는 광고/기타 링크만
        상품명 + 판매처 + 가격 조합으로 fallback 한다.
      */
      const fallbackKey =
        [
          "fallback",
          compactToken(
            offer.name,
          ),
          compactToken(
            offer.brand,
          ),
          offer.price,
        ].join("|");

      const primaryKey =
        offerProductId
          ? `nv_mid:${offerProductId}`
          : fallbackKey;

      /*
        같은 상품이 한 검색에서는 cr3(nv_mid 포함),
        다른 검색에서는 ader(광고 URL)로 노출될 수 있다.

        따라서 nv_mid가 있는 상품도
        상품명 + 판매처 + 가격 fallback key를 함께 등록해
        cr3/ader 중복을 서로 잡아낸다.
      */
      if (
        seen.has(primaryKey) ||
        seen.has(fallbackKey)
      ) {
        continue;
      }

      seen.add(primaryKey);
      seen.add(fallbackKey);
      offers.push(offer);
    }
  }

  offers.sort(
    (a, b) => {
      if (
        b.matchScore !==
        a.matchScore
      ) {
        return (
          b.matchScore -
          a.matchScore
        );
      }

      if (
        b.reviewCount !==
        a.reviewCount
      ) {
        return (
          b.reviewCount -
          a.reviewCount
        );
      }

      return (
        a.price -
        b.price
      );
    },
  );

  /*
    리뷰 소스는:
    1. 실제 개별 판매처명이어야 하고
    2. 실제 URL이 네이버 SmartStore/Brand로 확인되어
       현재 Bright Data Naver 수집기로 리뷰 본문을
       가져올 수 있는 후보만 사용한다.

    "판매처 18" 같은 네이버 가격비교 묶음상품의
    리뷰 수는 개별 판매처 리뷰 수로 취급하지 않는다.
  */
  const reviewSource =
    [...offers]
      .filter(
        (offer) =>
          offer.reviewCount > 0 &&
          offer.isIndividualSeller &&
          offer.sourceType ===
            "naver-store",
      )
      .sort(
        (a, b) => {
          if (
            b.reviewCount !==
            a.reviewCount
          ) {
            return (
              b.reviewCount -
              a.reviewCount
            );
          }

          if (
            b.rating !==
            a.rating
          ) {
            return (
              b.rating -
              a.rating
            );
          }

          return (
            b.matchScore -
            a.matchScore
          );
        },
      )[0] ??
    null;

  /*
    구매 소스는 실제 개별 판매처 중 최저가.
    같은 가격이면 리뷰 수가 많은 판매처를 우선한다.

    외부 쇼핑몰도 구매처로 사용할 수 있으므로
    sourceType이 external-store여도 허용한다.
  */
  const purchaseSource =
    [...offers]
      .filter(
        (offer) =>
          offer.isIndividualSeller &&
          (
            offer.sourceType ===
              "naver-store" ||
            offer.sourceType ===
              "external-store"
          ),
      )
      .sort(
        (a, b) => {
          if (
            a.price !==
            b.price
          ) {
            return (
              a.price -
              b.price
            );
          }

          if (
            b.reviewCount !==
            a.reviewCount
          ) {
            return (
              b.reviewCount -
              a.reviewCount
            );
          }

          return (
            b.matchScore -
            a.matchScore
          );
        },
      )[0] ??
    null;

  return {
    offers,
    reviewSource,
    purchaseSource,
  };
}

