import {
  validateProductMatch,
} from "../../../lib/validateProductMatch";
import {
  NextResponse,
} from "next/server";

import {
  collectNaverProduct,
} from "../../../lib/brightDataProduct";

import {
  resolveNaverBrandProductUrl,
} from "../../../lib/resolveNaverBrandProductUrl";

import {
  findOfficialSiteMapping,
} from "../../../lib/officialSiteMappingsDb";

import {
  discoverOfficialSite,
} from "../../../lib/officialSiteDiscovery";

import {
  collectManufacturerProduct,
} from "../../../lib/manufacturerProductCollector";

import {
  getStrongSearchModelTokens,
} from "../../../lib/buildResolverSearchPlan";

import {
  buildCanonicalPipelineIdentity,
} from "../../../lib/canonicalPipelineIdentity";

import {
  searchProductOffers,
} from "../../../lib/marketSearch";

import {
  supabaseAdmin,
} from "../../../lib/supabaseAdmin";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const TARGET_COUNT = 30;

const MIN_REVIEW_COUNT_FOR_DB = 30;

/*
  한 번에 외부 상세 조회를 너무 많이 호출하지 않는다.
  3개씩 병렬 처리하고,
  유효 상품 풀 목표 30개가 확보되면 다음 묶음은 호출하지 않는다.
*/
const BATCH_SIZE = 3;

/*
  DB 상품 풀 목표는 30개다.
  검증 실패와 중복을 고려해 캡처 후보 중 최대 60개까지만 검사한다.

  목표 30개에 못 미쳐도 확보된 full 상품은 응답에 그대로 반환한다.
*/
const MAX_CANDIDATE_COUNT = 60;

/*
  같은 제품의 상세정보를 24시간 안에 이미 수집했다면
  Bright Data를 다시 호출하지 않고 DB 캐시를 사용한다.
*/
const DETAIL_CACHE_TTL_MS =
  24 *
  60 *
  60 *
  1000;

type NaverProductDetail =
  Awaited<
    ReturnType<
      typeof collectNaverProduct
    >
  > & {
    keySpecs?: Record<string, string>;
    evaluationEvidence?: Record<
      string,
      string[]
    >;
  };

type CapturedReview = {
  rating: number;
  date: string;
  text: string;
  helpfulCount: number;
};

type CapturedProduct = {
  name: string;
  text: string;
  seller: string;
  url: string;
  imageUrl: string;
  price: number;
  reviewCount: number;
  rating: number;

  browserReviews?: CapturedReview[];

  browserReviewSourceUrl?: string;

  browserReviewTotalCount?: number;

  browserSpecs?: Record<
    string,
    string
  >;

  browserCatalogTitle?: string;
};

type CaptureResponse = {
  success: boolean;
  message?: string;
  category?: string;
  minBudget?: number;
  maxBudget?: number;
  products?: CapturedProduct[];
};

type FailureItem = {
  position: number;
  marketProduct: string;
  stage:
    | "resolve"
    | "brightdata"
    | "validation"
    | "budget"
    | "duplicate"
    | "evidence";
  reason: string;
};

type FinalCandidate = {
  position: number;

  canonicalSource: {
    productId: string;
    brandName: string;
    brandSite: string;
    url: string;

    sourceType?:
      | "naver-brand"
      | "manufacturer"
      | "naver-catalog";

    identityKey?: string;
  };

  reviewSource: {
    productName: string;
    seller: string;
    price: number;
    reviewCount: number;
    rating: number;
    url: string;
    resolvedUrl: string;
    sourceType:
      | "naver-store"
      | "external-store"
      | "naver-aggregate"
      | "unknown";
    isIndividualSeller: boolean;
    matchScore: number;
    reviewTextSource:
      | "selected-source"
      | "canonical-reuse"
      | "canonical-fallback"
      | "unavailable";
    status:
      | "selected"
      | "fallback-canonical";
  };

  purchaseSource: {
    productName: string;
    seller: string;
    price: number;
    reviewCount: number;
    rating: number;
    url: string;
    resolvedUrl: string;
    sourceType:
      | "naver-store"
      | "external-store"
      | "naver-aggregate"
      | "unknown";
    isIndividualSeller: boolean;
    matchScore: number;
    status:
      | "selected"
      | "fallback-market";
  };

  market: {
    productName: string;
    seller: string;
    listedPrice: number;
    reviewCount: number;
    rating: number;
    imageUrl: string;
    sourceUrl: string;
  };

  resolution: {
    productId: string;
    brandName: string;
    brandSite: string;
    canonicalUrl: string;

    sourceType?:
      | "naver-brand"
      | "manufacturer"
      | "naver-catalog";

    identityKey?: string;
  };

  detail: {
    productId: string;
    productName: string;
    brand: string;
    manufacturer: string;
    modelName: string;

    originalPrice: number;
    finalPrice: number;
    discountRate: number;

    reviewCount: number;
    rating: number | null;

    sellerName: string;
    categoryName: string;

    imageUrl: string;

    keySpecs: Record<string, string>;

    evaluationEvidence: Record<
      string,
      string[]
    >;

    reviewSamples: number;

    /*
      현재 단계의 reviews는 canonicalSource(Bright Data)에서
      수집된 기존 리뷰 샘플이다.

      reviewSource에는 "리뷰를 가장 많이 보유한 판매처"만
      별도로 선택해 두며, 실제 해당 판매처 리뷰 텍스트 수집은
      다음 단계에서 연결한다.
    */
    reviews: {
      rating: number;
      date: string;
      text: string;
      helpfulCount: number;
    }[];

    sourceUrl: string;
    reviewSourceUrl: string;

    detailStatus:
      | "full"
      | "partial-market";
  };
};

type ProcessSuccess = {
  success: true;

  position: number;

  productId: string;

  identityKey?: string;

  candidate: FinalCandidate;

  resolverAttempts: number;

  brightDataCalls: number;
};

type ProcessFailure = {
  success: false;

  failure: FailureItem;

  resolverAttempts: number;

  brightDataCalls: number;
};

type ProcessResult =
  | ProcessSuccess
  | ProcessFailure;

function isWithinBudget(
  price: number,
  minBudget: number,
  maxBudget: number,
) {
  if (
    minBudget > 0 &&
    price < minBudget
  ) {
    return false;
  }

  if (
    maxBudget > 0 &&
    price > maxBudget
  ) {
    return false;
  }

  return true;
}

function cleanName(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /\[[^\]]*\]/g,
      " ",
    )
    .replace(
      /\([^)]*\)/g,
      " ",
    )
    .replace(
      /(?:^|\s)(화이트|블랙|실버|그레이|베이지|단품|정품|공식|무료배송)(?=\s|$)/g,
      " ",
    )
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

function nameSimilarity(
  a: string,
  b: string,
) {
  /*
    상품군별 단어를 하드코딩하지 않는다.
    여기서는 모든 카테고리에 공통적인
    마케팅/상태 표현만 비교 대상에서 제외한다.
  */
  const ignored =
    new Set([
      "자동",
      "공식",
    ]);

  const toTokens = (
    value: string,
  ) =>
    new Set(
      cleanName(value)
        .split(" ")
        .filter(
          (token) =>
            token.length >= 2 &&
            !ignored.has(token),
        ),
    );

  const aTokens =
    toTokens(a);

  const bTokens =
    toTokens(b);

  if (
    aTokens.size === 0 ||
    bTokens.size === 0
  ) {
    return 0;
  }

  let common = 0;

  for (
    const token of aTokens
  ) {
    if (
      bTokens.has(token)
    ) {
      common++;
    }
  }

  return (
    common /
    Math.min(
      aTokens.size,
      bTokens.size,
    )
  );
}

/*
  네이버 상품 URL에서 상품 식별번호를 추출한다.

  지원 예:
  - /products/123456789
  - nv_mid=123456789
  - productNo=123456789

  같은 상품번호가 확인되는 경우에만
  가장 강한 중복 근거로 사용한다.
*/
function extractMarketProductId(
  value: string,
) {
  const decoded =
    (() => {
      try {
        return decodeURIComponent(
          value,
        );
      } catch {
        return value;
      }
    })();

  const patterns = [
    /\/products\/(\d+)/i,
    /[?&]nv_mid=(\d+)/i,
    /[?&]productNo=(\d+)/i,
    /[?&]productId=(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match =
      decoded.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

/*
  상품명만으로 중복을 판단해야 할 때는
  기존 0.78 기준을 사용하지 않는다.

  서로 다른 모델이 많은 카테고리에서
  공통 설명어 때문에 오탐되는 것을 막기 위해
  정규화된 상품명이 사실상 동일한 경우만
  중복으로 처리한다.
*/
function isSameMarketProductName(
  a: string,
  b: string,
) {
  const cleanA =
    cleanName(a);

  const cleanB =
    cleanName(b);

  if (
    !cleanA ||
    !cleanB
  ) {
    return false;
  }

  if (cleanA === cleanB) {
    return true;
  }

  /*
    한쪽 상품명이 다른 쪽을 거의 그대로 포함하면서
    길이 차이도 작은 경우만 허용한다.

    판매 문구가 조금 붙은 동일 상품은 제거하되,
    X60 Ultra / X60 Master 같은 서로 다른 모델은
    유지하기 위한 보수적인 fallback이다.
  */
  const shorter =
    cleanA.length <= cleanB.length
      ? cleanA
      : cleanB;

  const longer =
    cleanA.length > cleanB.length
      ? cleanA
      : cleanB;

  const lengthRatio =
    shorter.length /
    longer.length;

  return (
    lengthRatio >= 0.9 &&
    longer.includes(shorter) &&
    nameSimilarity(
      cleanA,
      cleanB,
    ) >= 0.95
  );
}

function removeMarketDuplicates(
  products: CapturedProduct[],
) {
  const result:
    CapturedProduct[] = [];

  const sorted =
    [...products].sort(
      (a, b) =>
        b.reviewCount -
        a.reviewCount,
    );

  for (
    const product of sorted
  ) {
    const productId =
      extractMarketProductId(
        product.url,
      );

    const duplicate =
      result.some(
        (existing) => {
          const existingId =
            extractMarketProductId(
              existing.url,
            );

          /*
            양쪽 모두 상품번호가 있으면
            번호가 같은 경우에만 중복이다.

            상품번호가 다르면 상품명이 비슷해도
            서로 다른 시장 후보로 유지한다.
          */
          if (
            productId &&
            existingId
          ) {
            return (
              productId ===
              existingId
            );
          }

          /*
            상품번호를 확보하지 못한 경우에만
            상품명 기반의 보수적인 fallback을 쓴다.
          */
          return isSameMarketProductName(
            product.name,
            existing.name,
          );
        },
      );

    if (!duplicate) {
      result.push(
        product,
      );
    }
  }

  return result;
}
/*
  네이버쇼핑 브라우저 캡처에서 이미
  실제 SmartStore / Brand 상품 URL이 들어온 경우
  resolver를 사용할 필요가 없다.

  추적 파라미터는 제거하고
  실제 상품 URL만 Bright Data에 전달한다.
*/
async function getCachedProductDetail(
  productId: string,
): Promise<NaverProductDetail | null> {
  const originProductNo =
    Number(productId);

  if (
    !Number.isSafeInteger(
      originProductNo,
    )
  ) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("products")
      .select(
        "product_detail_analysis",
      )
      .eq(
        "origin_product_no",
        originProductNo,
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    console.warn(
      "Product detail cache lookup warning:",
      error,
    );

    return null;
  }

  if (
    !data?.product_detail_analysis ||
    typeof data.product_detail_analysis !==
      "object" ||
    Array.isArray(
      data.product_detail_analysis,
    )
  ) {
    return null;
  }

  const detail =
    data.product_detail_analysis as Record<
      string,
      unknown
    >;

  const collectedAt =
    typeof detail.collectedAt ===
      "string"
      ? Date.parse(
          detail.collectedAt,
        )
      : NaN;

  if (
    !Number.isFinite(
      collectedAt,
    ) ||
    Date.now() -
      collectedAt >
      DETAIL_CACHE_TTL_MS
  ) {
    return null;
  }

  const price =
    detail.price &&
    typeof detail.price ===
      "object" &&
    !Array.isArray(
      detail.price,
    )
      ? (
          detail.price as Record<
            string,
            unknown
          >
        )
      : {};

  const finalPrice =
    Number(
      price.finalPrice ??
        0,
    );

  const reviews =
    Array.isArray(
      detail.reviews,
    )
      ? detail.reviews
      : [];

  if (
    finalPrice <= 0 ||
    reviews.length < 5
  ) {
    return null;
  }

  return {
    productId:
      String(
        detail.productId ??
          productId,
      ),

    title:
      String(
        detail.productName ??
          "",
      ),

    brand:
      String(
        detail.brand ??
          "",
      ),

    manufacturer:
      String(
        detail.manufacturer ??
          "",
      ),

    modelName:
      String(
        detail.modelName ??
          "",
      ),

    originalPrice:
      Number(
        price.originalPrice ??
          0,
      ),

    finalPrice,

    discountRate:
      Number(
        price.discountRate ??
          0,
      ),

    totalReviews:
      Number(
        detail.reviewCount ??
          0,
      ),

    averageRating:
      typeof detail.rating ===
        "number"
        ? detail.rating
        : null,

    sellerName:
      String(
        detail.sellerName ??
          "",
      ),

    categoryName:
      String(
        detail.categoryName ??
          "",
      ),

    imageUrl:
      String(
        detail.imageUrl ??
          "",
      ),

    topReviews:
      reviews as {
        rating: number;
        date: string;
        text: string;
        helpfulCount: number;
      }[],

    url:
      String(
        detail.sourceUrl ??
          "",
      ),
  } as NaverProductDetail;
}


async function getReusableAnalyzedProductFallback(
  productId: string,
): Promise<{
  detail: NaverProductDetail;
  reviewEvidenceCount: number;
} | null> {
  const originProductNo =
    Number(productId);

  if (
    !Number.isSafeInteger(
      originProductNo,
    )
  ) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("products")
      .select(
        "product_detail_analysis,review_analysis",
      )
      .eq(
        "origin_product_no",
        originProductNo,
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    console.warn(
      "Analyzed product fallback lookup warning:",
      error,
    );

    return null;
  }

  if (
    !data?.product_detail_analysis ||
    typeof data.product_detail_analysis !==
      "object" ||
    Array.isArray(
      data.product_detail_analysis,
    ) ||
    !data.review_analysis ||
    typeof data.review_analysis !==
      "object" ||
    Array.isArray(
      data.review_analysis,
    )
  ) {
    return null;
  }

  const detail =
    data.product_detail_analysis as Record<
      string,
      unknown
    >;

  const reviewAnalysis =
    data.review_analysis as Record<
      string,
      unknown
    >;

  const reviewEvidenceCount =
    Number(
      reviewAnalysis.reviewCount ??
      reviewAnalysis.review_count ??
      0,
    ) || 0;

  const criterionReasons =
    reviewAnalysis.criterionReasons &&
    typeof reviewAnalysis.criterionReasons ===
      "object" &&
    !Array.isArray(
      reviewAnalysis.criterionReasons,
    )
      ? reviewAnalysis.criterionReasons
      : (
          reviewAnalysis.criterion_reasons &&
          typeof reviewAnalysis.criterion_reasons ===
            "object" &&
          !Array.isArray(
            reviewAnalysis.criterion_reasons,
          )
            ? reviewAnalysis.criterion_reasons
            : null
        );

  if (
    reviewEvidenceCount < 5 ||
    !criterionReasons ||
    Object.keys(
      criterionReasons,
    ).length === 0
  ) {
    return null;
  }

  const price =
    detail.price &&
    typeof detail.price ===
      "object" &&
    !Array.isArray(
      detail.price,
    )
      ? (
          detail.price as Record<
            string,
            unknown
          >
        )
      : {};

  const finalPrice =
    Number(
      price.finalPrice ??
      detail.finalPrice ??
      0,
    );

  if (finalPrice <= 0) {
    return null;
  }

  const reviews =
    Array.isArray(
      detail.reviews,
    )
      ? detail.reviews
      : [];

  return {
    reviewEvidenceCount,

    detail: {
      productId:
        String(
          detail.productId ??
          productId,
        ),

      title:
        String(
          detail.productName ??
          "",
        ),

      brand:
        String(
          detail.brand ??
          "",
        ),

      manufacturer:
        String(
          detail.manufacturer ??
          "",
        ),

      modelName:
        String(
          detail.modelName ??
          "",
        ),

      originalPrice:
        Number(
          price.originalPrice ??
          detail.originalPrice ??
          finalPrice,
        ),

      finalPrice,

      discountRate:
        Number(
          price.discountRate ??
          detail.discountRate ??
          0,
        ),

      totalReviews:
        Number(
          detail.reviewCount ??
          reviewEvidenceCount,
        ),

      averageRating:
        typeof detail.rating ===
          "number"
          ? detail.rating
          : null,

      sellerName:
        String(
          detail.sellerName ??
          "",
        ),

      categoryName:
        String(
          detail.categoryName ??
          "",
        ),

      imageUrl:
        String(
          detail.imageUrl ??
          "",
        ),

      keySpecs:
        detail.keySpecs &&
        typeof detail.keySpecs ===
          "object" &&
        !Array.isArray(
          detail.keySpecs,
        )
          ? detail.keySpecs as Record<
              string,
              string
            >
          : {},

      evaluationEvidence:
        detail.evaluationEvidence &&
        typeof detail.evaluationEvidence ===
          "object" &&
        !Array.isArray(
          detail.evaluationEvidence,
        )
          ? detail.evaluationEvidence as Record<
              string,
              string[]
            >
          : {},

      topReviews:
        reviews as {
          rating: number;
          date: string;
          text: string;
          helpfulCount: number;
        }[],

      url:
        String(
          detail.sourceUrl ??
          "",
        ),
    } as NaverProductDetail,
  };
}

function getNaverProductUrlInfo(
  value: string,
) {
  try {
    const url =
      new URL(value);

    const match =
      url.pathname.match(
        /\/products\/(\d+)/i,
      );

    if (!match?.[1]) {
      return null;
    }

    if (
      url.hostname ===
      "brand.naver.com"
    ) {
      return {
        type:
          "brand" as const,

        productId:
          match[1],

        canonicalUrl:
          `${url.origin}${url.pathname}`,
      };
    }

    if (
      url.hostname ===
      "smartstore.naver.com"
    ) {
      return {
        type:
          "smartstore" as const,

        productId:
          match[1],

        canonicalUrl:
          `${url.origin}${url.pathname}`,
      };
    }

    return null;
  } catch {
    return null;
  }
}



function normalizeBrandLookupValue(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /(공식몰|공식스토어|공식점|브랜드스토어|스토어|store|official)/gi,
      " ",
    )
    .replace(
      /[^a-z0-9가-힣]+/g,
      "",
    )
    .trim();
}

/*
  /main/products/{id} 같은 Naver 공용 라우팅 URL은
  Bright Data SmartStore collector가 상품 본문을 읽지 못할 수 있다.

  이미 검증/저장된 같은 브랜드의 brand.naver.com URL이 있으면
  그 URL의 store slug만 재사용하고, 현재 reviewSource의 상품번호를 붙여
  seller-specific Brand Store URL을 복원한다.

  상품번호는 현재 reviewSource에서 확보한 값을 그대로 사용하므로
  다른 모델의 productId를 재사용하지 않는다.
*/
async function resolveReviewSourceNaverUrl(
  reviewUrl: string,
  productName: string,
  brandCandidates: string[],
): Promise<string> {
  const urlInfo =
    getNaverProductUrlInfo(
      reviewUrl,
    );

  if (!urlInfo) {
    return reviewUrl;
  }

  if (urlInfo.type === "brand") {
    return urlInfo.canonicalUrl;
  }

  /*
    SmartStore 상품 URL은 Bright Data Naver Product Dataset에
    직접 전달하지 않는다.

    과거 canonical 파이프라인과 동일하게 Brand resolver를 먼저 거쳐
    Bright Data가 읽을 수 있는 brand.naver.com 상품 URL을 확보한다.

    안전장치:
    - resolver가 실제 brand.naver.com canonical 상품 URL을 찾아 성공해야 한다.
    - 동일 productId는 resolver에서 최우선으로 선택한다.
    - productId가 다른 경우도 resolver 내부의 강한 모델 토큰/브랜드 검증을
      통과한 동일 상품 canonical만 허용한다.
    - route에서는 검증을 중복해 cross-ID 정상 상품을 다시 차단하지 않는다.
  */
  try {
    const resolved =
      await resolveNaverBrandProductUrl(
        urlInfo.canonicalUrl,
        productName,
        brandCandidates,
      );

    if (
      resolved.success &&
      resolved.canonicalUrl
    ) {
      return resolved.canonicalUrl;
    }
  } catch (error) {
    console.warn(
      "Review source Brand resolver warning:",
      error,
    );
  }

  /*
    과거에는 DB에서 같은 브랜드의 Brand Store slug를 찾은 뒤
    현재 SmartStore productId를 그대로 붙여 URL을 만들었다.

    SmartStore와 Brand Store의 동일 상품이 서로 다른 productId를
    사용할 수 있으므로 그 방식은 제거한다.

    Brand Store 탐색은 resolveNaverBrandProductUrl() 한 곳에서만 수행하고,
    brandCandidates는 slug-scoped 검색 힌트로만 사용한다.
    실제 /products/{id} 후보와 모델 검증을 통과하지 못하면 빈 문자열로 끝낸다.
  */

  /*
    여기서 SmartStore URL을 그대로 반환하면
    Bright Data가 dead_page / 404로 실패할 수 있다.

    따라서 Brand URL을 확보하지 못한 SmartStore reviewSource는
    collector용 URL 없음("")으로 처리한다.

    사용자에게 보여줄 review/purchase URL은 selectedReviewSource의
    원래 URL을 그대로 유지하므로 판매처 자체를 버리는 것은 아니다.
  */
  return "";
}


/*
  과거에 검증/저장한 Naver Brand canonical은
  상세 TTL과 별개로 재사용할 수 있다.

  목적:
  - 같은 모델을 매 실행마다 Resolver/SerpApi로 다시 찾지 않는다.
  - 상품 상세의 최신성은 기존 getCachedProductDetail()의 24시간 TTL이 담당한다.
  - 즉 canonical URL은 재사용하되, 상세가 오래됐으면 Bright Data만 새로 수집한다.

  안전장치:
  - 강한 모델 토큰으로 DB 후보를 먼저 좁힌다.
  - 저장된 source_url이 실제 brand.naver.com /products/{id} 형식이어야 한다.
  - validateProductMatch()가 동일 모델이라고 확인한 경우만 사용한다.
*/
async function getReusableCachedCanonicalResolution(
  marketName: string,
): Promise<{
  productId: string;
  canonicalUrl: string;
  brandName: string;
  brandSite: string;
} | null> {
  const marketTokens =
    marketName
      .split(/\s+/)
      .map(
        (value) =>
          value.trim(),
      )
      .filter(Boolean);

  const strongModelTokens =
    getStrongSearchModelTokens(
      marketTokens,
    );

  const primaryModelToken =
    strongModelTokens[0] ??
    "";

  if (!primaryModelToken) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("products")
      .select(
        "product_name,origin_product_no,source_url,product_detail_analysis",
      )
      .ilike(
        "product_name",
        `%${primaryModelToken}%`,
      )
      .not(
        "origin_product_no",
        "is",
        null,
      )
      .not(
        "source_url",
        "is",
        null,
      )
      .limit(20);

  if (error) {
    console.warn(
      "Reusable canonical cache lookup warning:",
      error,
    );

    return null;
  }

  for (const row of data ?? []) {
    const sourceUrl =
      String(
        row.source_url ??
          "",
      ).trim();

    const urlInfo =
      getNaverProductUrlInfo(
        sourceUrl,
      );

    if (
      !urlInfo ||
      urlInfo.type !==
        "brand"
    ) {
      continue;
    }

    const storedDetail =
      row.product_detail_analysis &&
      typeof row.product_detail_analysis ===
        "object" &&
      !Array.isArray(
        row.product_detail_analysis,
      )
        ? (
            row.product_detail_analysis as Record<
              string,
              unknown
            >
          )
        : {};

    const storedProductName =
      String(
        row.product_name ??
          storedDetail.productName ??
          "",
      );

    const storedModelName =
      String(
        storedDetail.modelName ??
          "",
      );

    const matchValidation =
      validateProductMatch(
        marketName,
        storedProductName,
        storedModelName,
      );

    if (
      !matchValidation.matched
    ) {
      continue;
    }

    const productId =
      String(
        row.origin_product_no ??
          urlInfo.productId,
      );

    if (
      productId !==
      urlInfo.productId
    ) {
      continue;
    }

    return {
      productId,

      canonicalUrl:
        urlInfo.canonicalUrl,

      brandName:
        String(
          storedDetail.brand ??
            "",
        ),

      brandSite:
        urlInfo.canonicalUrl.replace(
          /\/products\/\d+.*$/i,
          "",
        ),
    };
  }

  return null;
}

function createPartialMarketCandidate(
  market: CapturedProduct,
  position: number,
): FinalCandidate {
  const fallbackProductId =
    extractMarketProductId(
      market.url,
    );

  return {
    position,

    canonicalSource: {
      productId:
        fallbackProductId,
      brandName:
        "",
      brandSite:
        "",
      url:
        market.url,
    },

    reviewSource: {
      productName:
        market.name,
      seller:
        market.seller,
      price:
        market.price,
      reviewCount:
        market.reviewCount,
      rating:
        market.rating,
      url:
        market.url,
      resolvedUrl:
        market.url,
      sourceType:
        "naver-aggregate",
      isIndividualSeller:
        false,
      matchScore:
        0,
      reviewTextSource:
        "canonical-fallback",
      status:
        "fallback-canonical",
    },

    purchaseSource: {
      productName:
        market.name,
      seller:
        market.seller,
      price:
        market.price,
      reviewCount:
        market.reviewCount,
      rating:
        market.rating,
      url:
        market.url,
      resolvedUrl:
        market.url,
      sourceType:
        "naver-aggregate",
      isIndividualSeller:
        false,
      matchScore:
        0,
      status:
        "fallback-market",
    },

    market: {
      productName:
        market.name,
      seller:
        market.seller,
      listedPrice:
        market.price,
      reviewCount:
        market.reviewCount,
      rating:
        market.rating,
      imageUrl:
        market.imageUrl,
      sourceUrl:
        market.url,
    },

    resolution: {
      productId:
        fallbackProductId,
      brandName:
        "",
      brandSite:
        "",
      canonicalUrl:
        "",
    },

    detail: {
      productId:
        fallbackProductId,
      productName:
        market.name,
      brand:
        "",
      manufacturer:
        "",
      modelName:
        "",

      originalPrice:
        market.price,
      finalPrice:
        market.price,
      discountRate:
        0,

      reviewCount:
        market.reviewCount,
      rating:
        market.rating > 0
          ? market.rating
          : null,

      sellerName:
        market.seller,
      categoryName:
        "",

      imageUrl:
        market.imageUrl,

      keySpecs: {},

      evaluationEvidence: {},

      reviewSamples:
        0,
      reviews:
        [],

      sourceUrl:
        market.url,
      reviewSourceUrl:
        market.url,

      detailStatus:
        "partial-market",
    },
  };
}

export async function GET(
  request: Request,
) {
  try {
    const requestUrl =
      new URL(
        request.url,
      );

    const captureId =
      (
        requestUrl.searchParams.get(
          "captureId",
        ) ?? ""
      ).trim();

    if (!captureId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "captureId가 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    const captureUrl =
      new URL(
        "/api/naver-capture",
        requestUrl.origin,
      );

    captureUrl.searchParams.set(
      "id",
      captureId,
    );

    const captureResponse =
      await fetch(
        captureUrl,
        {
          cache:
            "no-store",
        },
      );

    const captureData =
      (
        await captureResponse.json()
      ) as CaptureResponse;

    if (
      !captureResponse.ok ||
      !captureData.success
    ) {
      throw new Error(
        captureData.message ??
          "후보 데이터를 불러오지 못했습니다.",
      );
    }

    const category =
      captureData.category ??
      "";

    /*
      Browser review wiring 무료 검증용 dry-run.

      외부 resolver / SerpApi / Bright Data 호출 전에
      naver-capture에서 복원된 실제 browserReviews가
      enriched에서 사용할 리뷰 형태로 정상 전달되는지만 확인한다.
    */
    if (
      requestUrl.searchParams.get(
        "browserReviewDryRun",
      ) === "1"
    ) {
      const products =
        Array.isArray(
          captureData.products,
        )
          ? captureData.products
          : [];

      const inspected =
        products.map(
          (product, index) => {
            const browserReviews =
              Array.isArray(
                product.browserReviews,
              )
                ? product.browserReviews
                    .filter(
                      (review) =>
                        Boolean(
                          review?.text?.trim(),
                        ),
                    )
                    .slice(0, 20)
                : [];

            const browserSpecs =
              product.browserSpecs &&
              typeof product.browserSpecs ===
                "object" &&
              !Array.isArray(
                product.browserSpecs,
              )
                ? product.browserSpecs
                : {};

            const dryRunKeySpecs = {
              ...browserSpecs,
            };

            const reviewDetail = {
              topReviews:
                browserReviews,

              totalReviews:
                Math.max(
                  Number(
                    product.reviewCount ??
                      0,
                  ),
                  browserReviews.length,
                ),

              url:
                product
                  .browserReviewSourceUrl ||
                product.url ||
                "",
            };

            return {
              position:
                index + 1,

              productName:
                product.name,

              browserReviewCount:
                browserReviews.length,

              browserSpecCount:
                Object.keys(
                  browserSpecs,
                ).length,

              keySpecsCount:
                Object.keys(
                  dryRunKeySpecs,
                ).length,

              keySpecs:
                dryRunKeySpecs,

              topReviewsCount:
                reviewDetail
                  .topReviews
                  .length,

              hasFullReviewEvidence:
                reviewDetail
                  .topReviews
                  .length >= 5,

              reviewSourceUrl:
                reviewDetail.url,

              firstReview:
                reviewDetail
                  .topReviews[0] ??
                null,
            };
          },
        );

      return NextResponse.json({
        success: true,

        browserReviewDryRun:
          true,

        externalApiCalls:
          0,

        productCount:
          inspected.length,

        productsWithReviews:
          inspected.filter(
            (item) =>
              item.browserReviewCount >
              0,
          ).length,

        productsWithAtLeast5Reviews:
          inspected.filter(
            (item) =>
              item
                .hasFullReviewEvidence,
          ).length,

        inspected,
      });
    }

    const minBudget =
      Number(
        captureData.minBudget ??
          0,
      ) || 0;

    const maxBudget =
      Number(
        captureData.maxBudget ??
          0,
      ) || 0;

    const zeroPaidOnly =
      requestUrl.searchParams.get(
        "zeroPaidOnly",
      ) === "1";

    function isZeroPaidBrowserCatalogCandidate(
      product: CapturedProduct,
    ) {
      const reviewSourceUrl =
        typeof product.browserReviewSourceUrl ===
          "string"
          ? product.browserReviewSourceUrl.trim()
          : "";

      const catalogMatch =
        reviewSourceUrl.match(
          /^https:\/\/search\.shopping\.naver\.com\/catalog\/(\d+)/i,
        );

      const catalogTitle =
        typeof product.browserCatalogTitle ===
          "string"
          ? product.browserCatalogTitle.trim()
          : "";

      const browserSpecs =
        product.browserSpecs &&
        typeof product.browserSpecs ===
          "object" &&
        !Array.isArray(
          product.browserSpecs,
        )
          ? product.browserSpecs
          : {};

      const browserReviews =
        Array.isArray(
          product.browserReviews,
        )
          ? product.browserReviews.filter(
              (review) =>
                Boolean(
                  review?.text?.trim(),
                ),
            )
          : [];

      const browserReviewTotalCount =
        Number(
          product.browserReviewTotalCount ??
          product.reviewCount ??
          0,
        ) || 0;

      const validation =
        catalogTitle
          ? validateProductMatch(
              product.name,
              catalogTitle,
              "",
            )
          : null;

      return (
        Boolean(
          catalogMatch?.[1],
        ) &&
        catalogTitle.length > 0 &&
        Object.keys(
          browserSpecs,
        ).length > 0 &&
        browserReviews.length >= 5 &&
        browserReviewTotalCount >=
          MIN_REVIEW_COUNT_FOR_DB &&
        product.price > 0 &&
        validation?.matched === true
      );
    }

    /*
      캡처 전체에서:

      1. 동일제품 제거
      2. 예산 안 상품을 최우선으로 정렬
      3. 목표 개수를 채우지 못하면
         예산 범위에서 가장 가까운 상품부터 자동 보충
      4. 같은 우선순위에서는 리뷰 수 / 평점 순 정렬
      5. 최대 60개까지 DB 풀 검증 후보로 보관

      중요:
      예산은 "우선 조건"이지 절대 탈락 조건이 아니다.

      예:
      예산 50만~150만원인데
      예산 안 후보가 3개뿐이라면
      159만원처럼 상한에 가장 가까운 제품부터
      fallback 후보로 이어서 처리한다.

      실제 Bright Data 호출은
      3개씩 하면서 full 유효 상품 30개가 되면 즉시 중단한다.
    */
    const dedupedMarketProducts =
      removeMarketDuplicates(
        captureData.products ??
          [],
      );

    function budgetDistance(
      price: number,
    ) {
      if (
        isWithinBudget(
          price,
          minBudget,
          maxBudget,
        )
      ) {
        return 0;
      }

      if (
        minBudget > 0 &&
        price < minBudget
      ) {
        return (
          minBudget -
          price
        );
      }

      if (
        maxBudget > 0 &&
        price > maxBudget
      ) {
        return (
          price -
          maxBudget
        );
      }

      return 0;
    }

    const marketCandidates =
      [...dedupedMarketProducts]
        .sort(
          (a, b) => {
            const aInBudget =
              isWithinBudget(
                a.price,
                minBudget,
                maxBudget,
              );

            const bInBudget =
              isWithinBudget(
                b.price,
                minBudget,
                maxBudget,
              );

            /*
              예산 안 상품은 항상 먼저.
            */
            if (
              aInBudget !==
              bInBudget
            ) {
              return aInBudget
                ? -1
                : 1;
            }

            /*
              둘 다 예산 밖이면
              예산 경계에서 가까운 상품 우선.
            */
            if (
              !aInBudget &&
              !bInBudget
            ) {
              const distanceDifference =
                budgetDistance(
                  a.price,
                ) -
                budgetDistance(
                  b.price,
                );

              if (
                distanceDifference !==
                0
              ) {
                return (
                  distanceDifference
                );
              }
            }

            /*
              같은 예산 우선순위에서는
              리뷰 수 / 평점 순.
            */
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
              b.rating -
              a.rating
            );
          },
        )
        .filter(
          (product) =>
            !zeroPaidOnly ||
            isZeroPaidBrowserCatalogCandidate(
              product,
            ),
        )
        .slice(
          0,
          MAX_CANDIDATE_COUNT,
        );

    const finalCandidates:
      FinalCandidate[] = [];

    /*
      URL/상세 확보에 실패한 partial 후보는
      즉시 DB 상품 풀 자리를 차지시키지 않는다.

      먼저 가능한 한 full 후보를 끝까지 확보하고,
      full 상품과 분리해 시장 순서대로
      partial 후보를 보충한다.
    */
    const partialCandidates:
      FinalCandidate[] = [];

    const failures:
      FailureItem[] = [];

    const seenIdentityKeys =
      new Set<string>();

    let resolverAttempts = 0;

    let brightDataCalls = 0;

    async function processCandidate(
      market:
        CapturedProduct,
      index: number,
    ): Promise<ProcessResult> {
      const position =
        index + 1;

      const startedAt =
        Date.now();

      console.log(
        `[ENRICH ${position}/${marketCandidates.length}] 시작`,
        market.name,
      );

      let resolvedProductId =
        "";

      let resolvedUrl =
        "";

      let resolvedBrandName =
        "";

      let resolvedBrandSite =
        "";

      let canonicalSourceType:
        | "naver-brand"
        | "manufacturer"
        | "naver-catalog" =
        "naver-brand";

      let identityKey =
        "";

      let manufacturerDetail:
        Awaited<
          ReturnType<
            typeof collectManufacturerProduct
          >
        > | null =
        null;

      /*
        URL 처리 원칙:

        1. brand.naver.com 상품 URL
           → 그대로 Bright Data에 전달

        2. smartstore.naver.com 상품 URL
           → Bright Data에 직접 넣지 않는다.
           → resolver로 공식 Brand 상품 URL을 찾은 뒤 사용

        3. 그 외 네이버 중간 URL
           → 기존 resolver 사용
      */
      const browserCatalogCanonicalSourceUrl =
        typeof market.browserReviewSourceUrl === "string"
          ? market.browserReviewSourceUrl.trim()
          : "";

      const browserCatalogCanonicalMatch =
        browserCatalogCanonicalSourceUrl.match(
          /^https:\/\/search\.shopping\.naver\.com\/catalog\/(\d+)/i,
        );

      const browserCatalogCanonicalProductId =
        browserCatalogCanonicalMatch?.[1] ?? "";

      const browserCatalogCanonicalUrl =
        browserCatalogCanonicalProductId
          ? `https://search.shopping.naver.com/catalog/${browserCatalogCanonicalProductId}`
          : "";

      const browserCatalogCanonicalTitle =
        typeof market.browserCatalogTitle === "string"
          ? market.browserCatalogTitle.trim()
          : "";

      const browserCatalogCanonicalSpecs =
        market.browserSpecs &&
        typeof market.browserSpecs === "object" &&
        !Array.isArray(market.browserSpecs)
          ? market.browserSpecs
          : {};

      const browserCatalogCanonicalReviews =
        Array.isArray(market.browserReviews)
          ? market.browserReviews
              .filter(
                (review) =>
                  Boolean(review?.text?.trim()),
              )
              .slice(0, 20)
          : [];

      const browserCatalogCanonicalTotalReviews =
        Number(
          market.browserReviewTotalCount ??
          market.reviewCount ??
          0,
        ) || 0;

      const browserCatalogCanonicalValidation =
        browserCatalogCanonicalTitle
          ? validateProductMatch(
              market.name,
              browserCatalogCanonicalTitle,
              "",
            )
          : null;

      const canUseBrowserCatalogCanonical =
        Boolean(browserCatalogCanonicalProductId) &&
        Boolean(browserCatalogCanonicalUrl) &&
        Boolean(browserCatalogCanonicalTitle) &&
        Object.keys(browserCatalogCanonicalSpecs).length > 0 &&
        browserCatalogCanonicalReviews.length >= 5 &&
        market.price > 0 &&
        browserCatalogCanonicalValidation?.matched === true;

      const urlInfo =
        getNaverProductUrlInfo(
          market.url,
        );

      let candidateResolverAttempts =
        0;

      /*
        Brand resolver / Manufacturer fallback이 모두 막힌 경우를 위한
        마지막 canonical 복구 경로.

        이미 구축된 searchProductOffers()로 동일 모델의 실제 판매처를 찾고,
        그 판매처 URL을 기존 Brand resolver에 다시 넣는다.

        중요:
        - 새로운 검색 체계를 만들지 않는다.
        - reviewSource / purchaseSource 중 Naver Store URL만 사용한다.
        - 성공한 Brand canonical만 채택한다.
        - 여기서 수행한 offer 검색 결과는 아래 review/purchase source 선택에서
          그대로 재사용해 같은 검색을 두 번 호출하지 않는다.
      */
      let offerCanonicalRecovered =
        false;

      let offerSearch:
        Awaited<
          ReturnType<
            typeof searchProductOffers
          >
        > | null =
        null;

      async function tryOfferBasedCanonicalRecovery() {
        try {
          if (!offerSearch) {
            offerSearch =
              await searchProductOffers(
                market.name,
              );
          }

          const offerCandidates = [
            offerSearch?.reviewSource,
            offerSearch?.purchaseSource,
          ].filter(Boolean);

          const attemptedUrls =
            new Set<string>();

          for (const offer of offerCandidates) {
            if (
              !offer ||
              offer.sourceType !==
                "naver-store" ||
              !offer.resolvedUrl ||
              attemptedUrls.has(
                offer.resolvedUrl,
              )
            ) {
              continue;
            }

            attemptedUrls.add(
              offer.resolvedUrl,
            );

            console.log(
              `[ENRICH ${position}] 판매처 기반 canonical 복구 시도`,
              offer.resolvedUrl,
            );

            candidateResolverAttempts++;

            const recovered =
              await resolveNaverBrandProductUrl(
                offer.resolvedUrl,
                market.name,
              );

            if (
              !recovered.success ||
              !recovered.canonicalUrl ||
              !recovered.productId
            ) {
              continue;
            }

            console.log(
              `[ENRICH ${position}] 판매처 기반 canonical 복구 성공`,
              recovered.canonicalUrl,
            );

            return recovered;
          }
        } catch (error) {
          console.warn(
            `[ENRICH ${position}] 판매처 기반 canonical 복구 warning`,
            error,
          );
        }

        return null;
      }

      if (
        canUseBrowserCatalogCanonical
      ) {
        canonicalSourceType =
          "naver-catalog";

        resolvedProductId =
          browserCatalogCanonicalProductId;

        resolvedUrl =
          browserCatalogCanonicalUrl;

        resolvedBrandName =
          browserCatalogCanonicalSpecs["브랜드"] ??
          browserCatalogCanonicalSpecs["제조사"] ??
          "";

        resolvedBrandSite =
          "https://search.shopping.naver.com";

        console.log(
          `[ENRICH ${position}] Catalog canonical 직접 사용 → resolver/SerpApi 생략`,
          {
            productId: resolvedProductId,
            title: browserCatalogCanonicalTitle,
            specCount:
              Object.keys(browserCatalogCanonicalSpecs).length,
            reviewCount:
              browserCatalogCanonicalReviews.length,
            url: resolvedUrl,
          },
        );
      } else if (
        urlInfo?.type ===
        "brand"
      ) {
        resolvedProductId =
          urlInfo.productId;

        resolvedUrl =
          urlInfo.canonicalUrl;

        resolvedBrandSite =
          resolvedUrl.replace(
            /\/products\/\d+.*$/i,
            "",
          );

        console.log(
          `[ENRICH ${position}] Brand 상품 URL 직접 사용`,
          resolvedUrl,
        );
      } else {
        const cachedCanonical =
          await getReusableCachedCanonicalResolution(
            market.name,
          );

        if (cachedCanonical) {
          resolvedProductId =
            cachedCanonical.productId;

          resolvedUrl =
            cachedCanonical.canonicalUrl;

          resolvedBrandName =
            cachedCanonical.brandName;

          resolvedBrandSite =
            cachedCanonical.brandSite;

          console.log(
            `[ENRICH ${position}] DB canonical 선재사용`,
            resolvedProductId,
            resolvedUrl,
          );
        } else {
          candidateResolverAttempts =
            1;

          const resolverStartedAt =
            Date.now();

          console.log(
            `[ENRICH ${position}] Brand URL resolver 시작`,
            market.url,
          );

          try {
          const resolved =
            await resolveNaverBrandProductUrl(
              market.url,
              market.name,
            );

          console.log(
            `[ENRICH ${position}] resolver 완료`,
            `${Math.round(
              (
                Date.now() -
                resolverStartedAt
              ) /
                1000,
            )}초`,
            resolved.success
              ? resolved.canonicalUrl
              : "",
          );

          if (
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
                .split(/\s+/)
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
            const inferredBrandAliases =
              marketTokens
                .flatMap((token) => {
                  const aliases:
                    string[] = [];

                  const latinPrefix =
                    token.match(
                      /^[A-Za-z]{2,12}/,
                    )?.[0];

                  if (latinPrefix) {
                    aliases.push(
                      latinPrefix,
                    );
                  }

                  if (
                    /^LG/i.test(token)
                  ) {
                    aliases.push(
                      "LG",
                    );
                  }

                  return aliases;
                })
                .filter(Boolean);

            const brandCandidates =
              Array.from(
                new Set([
                  ...marketTokens.slice(
                    0,
                    8,
                  ),

                  ...inferredBrandAliases,

                  marketTokens
                    .slice(0, 2)
                    .join(" "),

                  marketTokens
                    .slice(0, 3)
                    .join(" "),
                ]),
              ).filter(Boolean);

            let officialMapping =
              await findOfficialSiteMapping(
                brandCandidates,
              );

            if (!officialMapping) {
              try {
                const discoveredOfficialSite =
                  await discoverOfficialSite(
                    brandCandidates,
                    market.name,
                  );

                if (
                  discoveredOfficialSite.success &&
                  discoveredOfficialSite.officialSite
                ) {
                  officialMapping = {
                    brandKey: "",
                    brandName:
                      discoveredOfficialSite.brandName,
                    officialSite:
                      discoveredOfficialSite.officialSite,
                    source:
                      discoveredOfficialSite.source,
                    confidence:
                      discoveredOfficialSite.confidence,
                  };

                  console.log(
                    `[ENRICH ${position}] 공식몰 자동 탐색 성공`,
                    discoveredOfficialSite.officialSite,
                    discoveredOfficialSite.source,
                  );
                }
              } catch (error) {
                console.warn(
                  `[ENRICH ${position}] 공식몰 자동 탐색 실패`,
                  error,
                );
              }
            }

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
                `[ENRICH ${position}] Manufacturer fallback 시작`,
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
                    `[ENRICH ${position}] Manufacturer fallback 성공`,
                    resolvedUrl,
                  );
                } else {
                  console.log(
                    `[ENRICH ${position}] Manufacturer fallback 실패`,
                    collected.reason,
                  );
                }
              } catch (error) {
                console.warn(
                  `[ENRICH ${position}] Manufacturer fallback 오류`,
                  error,
                );
              }
            }

            if (
              !manufacturerDetail ||
              !manufacturerDetail.success
            ) {
              const recovered =
                await tryOfferBasedCanonicalRecovery();

              if (recovered) {
                resolvedProductId =
                  recovered.productId;

                resolvedUrl =
                  recovered.canonicalUrl;

                resolvedBrandName =
                  recovered.brandName;

                resolvedBrandSite =
                  recovered.brandSite;

                canonicalSourceType =
                  "naver-brand";

                offerCanonicalRecovered =
                  true;
              } else {
                console.log(
                  `[ENRICH ${position}] partial 유지(resolve 실패 + 판매처 복구 실패)`,
                  naverReason,
                );

                return {
                  success: true,

                  position,

                  productId:
                    extractMarketProductId(
                      market.url,
                    ) ||
                    `partial-${position}`,

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
            }
          }

          /*
            Manufacturer fallback이 성공한 경우에는
            그 직전에 확보한 제조사 canonical URL / officialSite를 유지한다.

            resolver가 success:false였던 값(resolved.canonicalUrl === "")으로
            Manufacturer 성공값을 다시 덮어쓰면
            identityKey가 "manufacturer:"로 비어 버리고,
            서로 다른 제조사 상품이 동일상품으로 오판될 수 있다.
          */
          if (
            !manufacturerDetail?.success &&
            !offerCanonicalRecovered
          ) {
            /*
              SmartStore 상품번호와
              resolver가 찾은 Brand 상품번호가 다르면
              잘못 연결된 공식상품일 가능성이 있으므로 차단.
            */
            if (
              urlInfo?.type ===
                "smartstore" &&
              urlInfo.productId &&
              resolved.productId &&
              urlInfo.productId !==
                resolved.productId
            ) {
              const reason =
                `SmartStore 상품번호 ${urlInfo.productId}와 Brand 상품번호 ${resolved.productId}가 다릅니다.`;

              console.log(
                `[ENRICH ${position}] 탈락(resolve)`,
                reason,
              );

              return {
                success: false,

                resolverAttempts:
                  candidateResolverAttempts,

                brightDataCalls: 0,

                failure: {
                  position,

                  marketProduct:
                    market.name,

                  stage:
                    "resolve",

                  reason,
                },
              };
            }

            resolvedProductId =
              resolved.productId;

            resolvedUrl =
              resolved.canonicalUrl;

            resolvedBrandName =
              resolved.brandName;

            resolvedBrandSite =
              resolved.brandSite;

            console.log(
              `[ENRICH ${position}] Bright Data용 Brand URL 확정`,
              resolvedUrl,
            );
          } else {
            console.log(
              offerCanonicalRecovered
                ? `[ENRICH ${position}] 판매처 기반 Brand canonical 유지`
                : `[ENRICH ${position}] Manufacturer canonical 유지`,
              resolvedUrl,
            );
          }
        } catch (error) {
          const reason =
            error instanceof Error
              ? error.message
              : "URL resolver 오류";

          console.warn(
            `[ENRICH ${position}] resolver 오류 → Manufacturer fallback 시도`,
            reason,
          );

          /*
            resolver가 success:false를 반환한 경우뿐 아니라
            예외를 던진 경우에도 동일하게 Manufacturer fallback을 시도한다.

            TS450처럼 시장 판매처/리뷰 소스는 정상인데
            Brand URL resolver 단계에서 예외가 발생한 상품이
            곧바로 partial-market으로 내려가는 것을 막는다.
          */
          try {
            const marketTokens =
              market.name
                .split(/\s+/)
                .map(
                  (value) =>
                    value.trim(),
                )
                .filter(Boolean);

            const inferredBrandAliases =
              marketTokens
                .flatMap((token) => {
                  const aliases:
                    string[] = [];

                  const latinPrefix =
                    token.match(
                      /^[A-Za-z]{2,12}/,
                    )?.[0];

                  if (latinPrefix) {
                    aliases.push(
                      latinPrefix,
                    );
                  }

                  if (
                    /^LG/i.test(token)
                  ) {
                    aliases.push(
                      "LG",
                    );
                  }

                  return aliases;
                })
                .filter(Boolean);

            const brandCandidates =
              Array.from(
                new Set([
                  ...marketTokens.slice(
                    0,
                    8,
                  ),

                  ...inferredBrandAliases,

                  marketTokens
                    .slice(0, 2)
                    .join(" "),

                  marketTokens
                    .slice(0, 3)
                    .join(" "),
                ]),
              ).filter(Boolean);

            let officialMapping =
              await findOfficialSiteMapping(
                brandCandidates,
              );

            if (!officialMapping) {
              try {
                const discoveredOfficialSite =
                  await discoverOfficialSite(
                    brandCandidates,
                    market.name,
                  );

                if (
                  discoveredOfficialSite.success &&
                  discoveredOfficialSite.officialSite
                ) {
                  officialMapping = {
                    brandKey: "",
                    brandName:
                      discoveredOfficialSite.brandName,
                    officialSite:
                      discoveredOfficialSite.officialSite,
                    source:
                      discoveredOfficialSite.source,
                    confidence:
                      discoveredOfficialSite.confidence,
                  };

                  console.log(
                    `[ENRICH ${position}] 공식몰 자동 탐색 성공`,
                    discoveredOfficialSite.officialSite,
                    discoveredOfficialSite.source,
                  );
                }
              } catch (error) {
                console.warn(
                  `[ENRICH ${position}] 공식몰 자동 탐색 실패`,
                  error,
                );
              }
            }

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
                `[ENRICH ${position}] Manufacturer fallback 시작(resolve 오류)`,
                officialMapping.officialSite,
                manufacturerSearchTerms.join(
                  " ",
                ),
              );

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
                  `[ENRICH ${position}] Manufacturer fallback 성공(resolve 오류)`,
                  resolvedUrl,
                );
              } else {
                console.log(
                  `[ENRICH ${position}] Manufacturer fallback 실패(resolve 오류)`,
                  collected.reason,
                );
              }
            }
          } catch (
            manufacturerError
          ) {
            console.warn(
              `[ENRICH ${position}] Manufacturer fallback 오류(resolve 오류)`,
              manufacturerError,
            );
          }

          if (
            !manufacturerDetail ||
            !manufacturerDetail.success
          ) {
            const recovered =
              await tryOfferBasedCanonicalRecovery();

            if (recovered) {
              resolvedProductId =
                recovered.productId;

              resolvedUrl =
                recovered.canonicalUrl;

              resolvedBrandName =
                recovered.brandName;

              resolvedBrandSite =
                recovered.brandSite;

              canonicalSourceType =
                "naver-brand";

              offerCanonicalRecovered =
                true;
            } else {
              console.log(
                `[ENRICH ${position}] partial 유지(resolve 오류 + Manufacturer 실패 + 판매처 복구 실패)`,
                reason,
              );

              return {
                success: true,

                position,

                productId:
                  extractMarketProductId(
                    market.url,
                  ) ||
                  `partial-${position}`,

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
          }
          }
        }
      }

      /*
        Brand / Manufacturer는 기존 공용 identity 규칙을 유지한다.
        Catalog는 별도 ID 체계이므로 catalog 전용 identity를 사용한다.
      */
      if (
        canonicalSourceType ===
          "naver-catalog"
      ) {
        identityKey =
          `naver-catalog:${resolvedProductId}`;
      } else {
        identityKey =
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
          }).identityKey;
      }

      /*
        이전 배치에서 이미 확보된 상품이면
        상세수집 전에 차단.
      */
      if (
        seenIdentityKeys.has(
          identityKey,
        )
      ) {
        const reason =
          `동일 canonical identity 중복: ${identityKey}`;

        console.log(
          `[ENRICH ${position}] 탈락(duplicate)`,
          reason,
        );

        return {
          success: false,

          resolverAttempts:
            candidateResolverAttempts,

          brightDataCalls: 0,

          failure: {
            position,

            marketProduct:
              market.name,

            stage:
              "duplicate",

            reason,
          },
        };
      }

      let detail:
        NaverProductDetail | null =
        null;

      let usedCache =
        false;

      let usedAnalyzedFallback =
        false;

      let usedBrowserCatalogDetail =
        false;

      let cachedAnalyzedReviewCount =
        0;

      if (
        canonicalSourceType ===
          "manufacturer" &&
        manufacturerDetail?.success
      ) {
        const manufacturer =
          manufacturerDetail.detail;

        /*
          제조사 공식페이지 가격은 최종 국내 판매가로 신뢰하지 않는다.

          이유:
          - 해외 공식몰은 다른 통화 가격을 숫자만 노출할 수 있다.
          - 렌탈/구독형 공식페이지는 월 요금을 본체 가격처럼 노출할 수 있다.
          - 제조사 페이지의 역할은 canonical identity / 모델명 / 스펙 확인이다.

          따라서 Manufacturer 경로의 기준 가격은 항상
          이미 시장 후보에서 확보한 국내 시장가격을 사용한다.

          이후 searchProductOffers()가 동일 모델의 실제 개별 판매처를
          찾으면 reviewSource / purchaseSource 가격은 별도로 갱신된다.
        */
        const manufacturerResolvedPrice =
          market.price;

        const manufacturerResolvedOriginalPrice =
          market.price;

        detail = {
          url:
            manufacturer.canonicalUrl,

          productId: "",

          title:
            manufacturer.title,

          originalPrice:
            manufacturerResolvedOriginalPrice,

          finalPrice:
            manufacturerResolvedPrice,

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

          keySpecs:
            manufacturer.keySpecs,

          evaluationEvidence:
            manufacturer.evaluationEvidence,

          topReviews: [],
        };

        console.log(
          `[ENRICH ${position}] Manufacturer 상세 사용`,
          detail.title,
        );
      } else if (
        canonicalSourceType ===
          "naver-brand"
      ) {
        detail =
          await getCachedProductDetail(
            resolvedProductId,
          );

        usedCache =
          Boolean(detail);

        if (detail) {
          console.log(
            `[ENRICH ${position}] DB 상세 캐시 재사용`,
            resolvedProductId,
          );
        }
      }

      const capturedBrowserCatalogProduct =
        (
          captureData.products ??
          []
        ).find(
          (captured) =>
            captured.url === market.url &&
            captured.name === market.name,
        ) ??
        (
          captureData.products ??
          []
        ).find(
          (captured) =>
            captured.url === market.url,
        );

      const browserCatalogTitleForDetail =
        typeof capturedBrowserCatalogProduct
          ?.browserCatalogTitle === "string"
          ? capturedBrowserCatalogProduct
              .browserCatalogTitle
              .trim()
          : "";

      const browserCatalogSpecsForDetail =
        capturedBrowserCatalogProduct
          ?.browserSpecs &&
        typeof capturedBrowserCatalogProduct
          .browserSpecs === "object" &&
        !Array.isArray(
          capturedBrowserCatalogProduct
            .browserSpecs,
        )
          ? capturedBrowserCatalogProduct
              .browserSpecs
          : {};

      const browserCatalogReviewsForDetail =
        Array.isArray(
          capturedBrowserCatalogProduct
            ?.browserReviews,
        )
          ? capturedBrowserCatalogProduct
              .browserReviews
              .filter(
                (review) =>
                  Boolean(
                    review?.text?.trim(),
                  ),
              )
              .slice(0, 20)
          : [];

      const browserCatalogTotalReviewsForDetail =
        Number(
          capturedBrowserCatalogProduct
            ?.browserReviewTotalCount ??
          capturedBrowserCatalogProduct
            ?.reviewCount ??
          0,
        ) || 0;

      const browserCatalogUrlForDetail =
        typeof capturedBrowserCatalogProduct
          ?.browserReviewSourceUrl === "string"
          ? capturedBrowserCatalogProduct
              .browserReviewSourceUrl
              .trim()
          : "";

      const browserCatalogUrlValid =
        /^https:\/\/search\.shopping\.naver\.com\/catalog\/\d+/i.test(
          browserCatalogUrlForDetail,
        );

      const browserCatalogDetailValidation =
        browserCatalogTitleForDetail
          ? validateProductMatch(
              market.name,
              browserCatalogTitleForDetail,
              "",
            )
          : null;

      if (
        !detail &&
        (
          canonicalSourceType ===
            "naver-brand" ||
          canonicalSourceType ===
            "naver-catalog"
        ) &&
        Boolean(resolvedProductId) &&
        browserCatalogUrlValid &&
        Object.keys(
          browserCatalogSpecsForDetail,
        ).length > 0 &&
        browserCatalogReviewsForDetail
          .length >= 5 &&
        market.price > 0 &&
        browserCatalogDetailValidation
          ?.matched === true
      ) {
        detail = {
          url:
            browserCatalogUrlForDetail,

          productId:
            resolvedProductId,

          title:
            browserCatalogTitleForDetail,

          originalPrice:
            market.price,

          finalPrice:
            market.price,

          discountRate: 0,

          currency: "KRW",

          imageUrl:
            market.imageUrl,

          totalReviews:
            Math.max(
              browserCatalogTotalReviewsForDetail,
              browserCatalogCanonicalTotalReviews,
              Number(
                market.reviewCount ?? 0,
              ),
              browserCatalogReviewsForDetail
                .length,
            ),

          averageRating:
            market.rating > 0
              ? market.rating
              : null,

          soldOut: false,

          sellerName:
            market.seller,

          sellers: [],

          purchaseSeller: "",

          purchasePrice: 0,

          purchaseUrl: "",

          brand:
            browserCatalogSpecsForDetail[
              "브랜드"
            ] ?? "",

          manufacturer:
            browserCatalogSpecsForDetail[
              "제조사"
            ] ?? "",

          modelName: "",

          categoryName:
            category,

          keySpecs:
            browserCatalogSpecsForDetail,

          evaluationEvidence: {},

          topReviews:
            browserCatalogReviewsForDetail,
        } as NaverProductDetail;

        usedBrowserCatalogDetail =
          true;

        console.log(
          `[ENRICH ${position}] Catalog 브라우저 상세 사용 → Bright Data 생략`,
          {
            title:
              browserCatalogTitleForDetail,

            specCount:
              Object.keys(
                browserCatalogSpecsForDetail,
              ).length,

            reviewCount:
              browserCatalogReviewsForDetail
                .length,

            canonicalProductId:
              resolvedProductId,

            catalogUrl:
              browserCatalogUrlForDetail,
          },
        );
      }

      const brightDataStartedAt =
        Date.now();

      if (
        !detail &&
        canonicalSourceType ===
          "naver-brand"
      ) {
        console.log(
          `[ENRICH ${position}] Bright Data 시작`,
          resolvedUrl,
        );

        try {
          detail =
            await collectNaverProduct(
              resolvedUrl,
            );
        } catch (error) {
          const reason =
            error instanceof Error
              ? error.message
              : "Bright Data 상세수집 실패";

          const analyzedFallback =
            await getReusableAnalyzedProductFallback(
              resolvedProductId,
            );

          if (analyzedFallback) {
            detail =
              analyzedFallback.detail;

            cachedAnalyzedReviewCount =
              analyzedFallback.reviewEvidenceCount;

            usedAnalyzedFallback =
              true;

            console.warn(
              `[ENRICH ${position}] Bright Data 실패 → 기존 리뷰분석 캐시 재사용`,
              `reviewAnalysis=${cachedAnalyzedReviewCount}`,
              resolvedProductId,
            );
          } else {
            console.log(
              `[ENRICH ${position}] 탈락(brightdata)`,
              `${Math.round(
                (
                  Date.now() -
                  brightDataStartedAt
                ) /
                  1000,
              )}초`,
              reason,
            );

            return {
              success: false,

              resolverAttempts:
                candidateResolverAttempts,

              brightDataCalls: 1,

              failure: {
                position,

                marketProduct:
                  market.name,

                stage:
                  "brightdata",

                reason,
              },
            };
          }
        }
      }

      if (
        canonicalSourceType ===
          "naver-brand" &&
        !usedCache &&
        !usedAnalyzedFallback &&
        !usedBrowserCatalogDetail &&
        detail
      ) {
        console.log(
          `[ENRICH ${position}] Bright Data 완료`,
        `${Math.round(
          (
            Date.now() -
            brightDataStartedAt
          ) /
            1000,
        )}초`,
        );
      }

      if (!detail) {
        return {
          success: false,

          resolverAttempts:
            candidateResolverAttempts,

          brightDataCalls:
            (usedCache || usedBrowserCatalogDetail) ? 0 : 1,

          failure: {
            position,

            marketProduct:
              market.name,

            stage:
              "brightdata",

            reason:
              "상품 상세정보를 확보하지 못했습니다.",
          },
        };
      }

      /*
        Catalog 브라우저 probe의 구조화 스펙은
        기존 canonical / 모델 검증을 대체하지 않는다.

        상세정보가 확보된 뒤 keySpecs에만 병합한다.
      */
      const capturedBrowserSpecProduct =
        (
          captureData.products ??
          []
        ).find(
          (captured) =>
            captured.url ===
              market.url &&
            captured.name ===
              market.name,
        ) ??
        (
          captureData.products ??
          []
        ).find(
          (captured) =>
            captured.url ===
            market.url,
        );

      const browserSpecs =
        capturedBrowserSpecProduct
          ?.browserSpecs &&
        typeof capturedBrowserSpecProduct
          .browserSpecs === "object" &&
        !Array.isArray(
          capturedBrowserSpecProduct
            .browserSpecs,
        )
          ? capturedBrowserSpecProduct
              .browserSpecs
          : {};

      const browserCatalogTitle =
        typeof capturedBrowserSpecProduct
          ?.browserCatalogTitle === "string"
          ? capturedBrowserSpecProduct
              .browserCatalogTitle
              .trim()
          : "";

      const browserCatalogMatchValidation =
        browserCatalogTitle
          ? validateProductMatch(
              market.name,
              browserCatalogTitle,
              "",
            )
          : null;

      if (
        Object.keys(
          browserSpecs,
        ).length > 0 &&
        browserCatalogMatchValidation
          ?.matched === true
      ) {
        detail = {
          ...detail,

          keySpecs: {
            ...(
              detail.keySpecs &&
              typeof detail.keySpecs ===
                "object" &&
              !Array.isArray(
                detail.keySpecs,
              )
                ? detail.keySpecs
                : {}
            ),

            ...browserSpecs,
          },
        } as NaverProductDetail;

        console.log(
          `[ENRICH ${position}] Catalog 브라우저 스펙 병합`,
          {
            specCount:
              Object.keys(
                browserSpecs,
              ).length,

            specs:
              browserSpecs,
          },
        );
      }

      const matchValidation =
        validateProductMatch(
          market.name,
          detail.title,
          detail.modelName,
        );

      const usable =
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
        );

      if (!usable) {
        const validationDiagnostic = {
          marketName:
            market.name,
          detailTitle:
            detail.title,
          detailModelName:
            detail.modelName,
          canonicalSourceType,
          hasTitle:
            Boolean(
              detail.title,
            ),
          finalPrice:
            detail.finalPrice,
          priceValid:
            detail.finalPrice > 0,
          productId:
            detail.productId,
          productIdValid:
            canonicalSourceType ===
              "manufacturer" ||
            Boolean(
              detail.productId,
            ),
          matchValidation,
        };

        const reason =
          "상세수집은 완료됐지만 필수 상품정보가 없습니다." +
          ` [hasTitle=${validationDiagnostic.hasTitle}` +
          `, priceValid=${validationDiagnostic.priceValid}` +
          `, productIdValid=${validationDiagnostic.productIdValid}` +
          `, modelMatched=${validationDiagnostic.matchValidation.modelMatched}` +
          `, variantMatched=${validationDiagnostic.matchValidation.variantMatched}` +
          `, marketModelTokens=${validationDiagnostic.matchValidation.marketModelTokens.join("|") || "-"}` +
          `, detailModelTokens=${validationDiagnostic.matchValidation.detailModelTokens.join("|") || "-"}` +
          `, marketVariantTokens=${validationDiagnostic.matchValidation.marketVariantTokens.join("|") || "-"}` +
          `, detailVariantTokens=${validationDiagnostic.matchValidation.detailVariantTokens.join("|") || "-"}` +
          "]";

        console.log(
          `[ENRICH ${position}] 탈락(validation)`,
          reason,
          validationDiagnostic,
        );

        return {
          success: false,

          resolverAttempts:
            candidateResolverAttempts,

          brightDataCalls:
            (usedCache || usedBrowserCatalogDetail) ? 0 : 1,

          failure: {
            position,

            marketProduct:
              market.name,

            stage:
              "validation",

            reason,
          },
        };
      }

      /*
        최종 후보의 예산은 상세조회한 실제 판매가를 기준으로
        반드시 엄수한다.

        시장 검색의 표시가격은 1차 후보 필터에 사용하고,
        상세가격을 확보한 뒤에는 fallback 예외를 허용하지 않는다.
      */
      if (
        !isWithinBudget(
          detail.finalPrice,
          minBudget,
          maxBudget,
        )
      ) {
        const reason =
          `실제 판매가 ${detail.finalPrice.toLocaleString(
            "ko-KR",
          )}원이 설정 예산 범위를 벗어났습니다.`;

        console.log(
          `[ENRICH ${position}] 탈락(budget)`,
          reason,
        );

        return {
          success: false,

          resolverAttempts:
            candidateResolverAttempts,

          brightDataCalls:
            (usedCache || usedBrowserCatalogDetail) ? 0 : 1,

          failure: {
            position,

            marketProduct:
              market.name,

            stage:
              "budget",

            reason,
          },
        };
      }


      /*
        같은 모델의 네이버 판매처를 다시 검색해
        역할을 분리한다.

        canonicalSource:
          공식 Brand 상품 URL
          → 제품 식별 / 스펙 / 대표 이미지용

        reviewSource:
          동일 모델/구성 후보 중 리뷰 수가 가장 많은 판매처
          → 현재는 "어느 판매처 리뷰를 써야 하는지"만 선택한다.
          → 실제 리뷰 텍스트는 아직 detail.topReviews를 유지한다.

        purchaseSource:
          동일 모델/구성 후보 중 최저가 판매처
          → 최종 구매 버튼용 후보.
      */
      try {
        if (
          !offerSearch &&
          canonicalSourceType !==
            "naver-catalog"
        ) {
          offerSearch =
            await searchProductOffers(
              canonicalSourceType ===
                "manufacturer"
                ? market.name
                : detail.title ||
                    market.name,
            );
        }
      } catch (error) {
        console.warn(
          `[ENRICH ${position}] 판매처 재검색 warning`,
          error,
        );
      }

      const selectedReviewSource =
        offerSearch?.reviewSource;

      let selectedPurchaseSource =
        offerSearch?.purchaseSource;

      /*
        최저가라는 이유만으로 다른 모델을 구매처로 선택하지 않는다.

        reviewSource가 더 강한 모델 일치 점수를 가지고 있는데
        purchaseSource의 matchScore가 더 낮다면,
        구매처도 reviewSource로 맞춘다.

        JONR X9 Pro에서 X9 Pro(matchScore 100) 리뷰소스를 찾고도
        더 싼 T5 Pro Gen 2(matchScore 50)가 구매처로 선택되는
        오매칭을 방지한다.
      */
      if (
        selectedReviewSource &&
        selectedPurchaseSource &&
        selectedReviewSource.sourceType ===
          "naver-store" &&
        selectedPurchaseSource.matchScore <
          selectedReviewSource.matchScore
      ) {
        console.log(
          `[ENRICH ${position}] 구매처 모델 일치도 보정`,
          selectedPurchaseSource.name,
          selectedPurchaseSource.matchScore,
          "→",
          selectedReviewSource.name,
          selectedReviewSource.matchScore,
        );

        selectedPurchaseSource =
          selectedReviewSource;
      }

      const finalProductId =
        (
          canonicalSourceType ===
            "naver-brand" ||
          canonicalSourceType ===
            "naver-catalog"
        )
          ? String(
              detail.productId,
            )
          : "";

      let normalizedReviewSourceUrl =
        selectedReviewSource?.resolvedUrl ??
        "";

      if (
        selectedReviewSource?.resolvedUrl &&
        selectedReviewSource.sourceType ===
          "naver-store"
      ) {
        normalizedReviewSourceUrl =
          await resolveReviewSourceNaverUrl(
            selectedReviewSource.resolvedUrl,
            selectedReviewSource.name,
            [
              resolvedBrandName,
              detail.brand,
              detail.manufacturer,
              selectedReviewSource.brand,
              market.seller,
            ],
          );

        if (
          normalizedReviewSourceUrl !==
          selectedReviewSource.resolvedUrl
        ) {
          console.log(
            `[ENRICH ${position}] 리뷰소스 Store URL 복원`,
            selectedReviewSource.resolvedUrl,
            "→",
            normalizedReviewSourceUrl,
          );
        }
      }

      console.log(
        `[REVIEW-DIAG ${position}] review-source-state`,
        {
          canonicalSourceType,
          finalProductId,
          selectedReviewSourceUrl:
            selectedReviewSource?.resolvedUrl ?? "",
          normalizedReviewSourceUrl,
          selectedReviewSourceType:
            selectedReviewSource?.sourceType ?? "",
          selectedReviewMatchScore:
            selectedReviewSource?.matchScore ?? 0,
        },
      );

      /*
        실제 리뷰 본문은 reviewSource에서 가져오는 것을 원칙으로 한다.

        단, reviewSource의 실제 네이버 상품번호가 canonicalSource와
        같다면 같은 상품 페이지이므로 Bright Data를 한 번 더 호출하지 않고
        이미 수집한 detail.topReviews를 그대로 재사용한다.

        상품번호가 다를 때만 reviewSource.resolvedUrl을 Bright Data로
        추가 수집한다. 실패하면 자동으로 canonical 리뷰로 fallback 한다.
      */
      let reviewDetail:
        NaverProductDetail =
        detail;

      let reviewTextSource:
        | "selected-source"
        | "canonical-reuse"
        | "canonical-fallback"
        | "unavailable" =
        "canonical-fallback";

      let reviewSourceUrl =
        detail.url;

      let extraReviewBrightDataCalls =
        0;

      const capturedBrowserReviewProduct =
        (
          captureData.products ??
          []
        ).find(
          (captured) =>
            captured.url ===
              market.url &&
            captured.name ===
              market.name,
        ) ??
        (
          captureData.products ??
          []
        ).find(
          (captured) =>
            captured.url ===
            market.url,
        );

      const browserReviews =
        Array.isArray(
          capturedBrowserReviewProduct
            ?.browserReviews,
        )
          ? capturedBrowserReviewProduct
              .browserReviews
              .filter(
                (review) =>
                  Boolean(
                    review?.text?.trim(),
                  ),
              )
              .slice(0, 20)
          : [];

      const hasBrowserReviewEvidence =
        browserReviews.length >= 5;

      if (hasBrowserReviewEvidence) {
        reviewDetail = {
          ...detail,

          totalReviews:
            Math.max(
              Number(
                detail.totalReviews ??
                  0,
              ),
              Number(
                capturedBrowserReviewProduct
                  ?.browserReviewTotalCount ??
                  0,
              ),
              Number(
                market.reviewCount ??
                  0,
              ),
              browserReviews.length,
            ),

          topReviews:
            browserReviews,
        } as NaverProductDetail;

        reviewSourceUrl =
          capturedBrowserReviewProduct
            ?.browserReviewSourceUrl ||
          market.url ||
          detail.url;

        reviewTextSource =
          "selected-source";

        console.log(
          `[ENRICH ${position}] 브라우저 리뷰 재사용`,
          {
            count:
              browserReviews.length,
            url:
              reviewSourceUrl,
          },
        );
      }

      if (
        !hasBrowserReviewEvidence &&
        selectedReviewSource?.resolvedUrl &&
        selectedReviewSource.sourceType ===
          "naver-store"
      ) {
        const selectedReviewProductId =
          extractMarketProductId(
            normalizedReviewSourceUrl ||
              selectedReviewSource.resolvedUrl,
          );

        if (
          selectedReviewProductId &&
          selectedReviewProductId ===
            finalProductId
        ) {
          reviewDetail =
            detail;

          reviewSourceUrl =
            normalizedReviewSourceUrl ||
              selectedReviewSource.resolvedUrl;

          reviewTextSource =
            "canonical-reuse";

          console.log(
            `[ENRICH ${position}] 리뷰소스 canonical 재사용`,
            selectedReviewProductId,
          );
        } else {
          let collectedReviewDetail:
            NaverProductDetail | null =
            null;

          if (
            selectedReviewProductId
          ) {
            console.log(
              `[REVIEW-DIAG ${position}] review-cache-query`,
              selectedReviewProductId,
            );

            collectedReviewDetail =
              await getCachedProductDetail(
                selectedReviewProductId,
              );

            console.log(
              `[REVIEW-DIAG ${position}] review-cache-result`,
              {
                selectedReviewProductId,
                cacheHit:
                  Boolean(
                    collectedReviewDetail,
                  ),
                cachedTopReviews:
                  collectedReviewDetail
                    ?.topReviews
                    ?.length ?? 0,
                cachedUrl:
                  collectedReviewDetail
                    ?.url ?? "",
              },
            );
          }

          if (
            collectedReviewDetail
          ) {
            reviewDetail =
              collectedReviewDetail;

            reviewSourceUrl =
              normalizedReviewSourceUrl ||
                selectedReviewSource.resolvedUrl;

            reviewTextSource =
              "selected-source";

            console.log(
              `[ENRICH ${position}] 리뷰소스 DB 캐시 사용`,
              selectedReviewProductId,
            );
          } else {
            try {
              const diagnosticCollectUrl =
                normalizedReviewSourceUrl;

              if (!diagnosticCollectUrl) {
                console.warn(
                  `[ENRICH ${position}] 리뷰소스 Bright Data 건너뜀`,
                  "SmartStore reviewSource의 Brand URL을 확보하지 못했습니다.",
                );
              } else {
                console.log(
                  `[ENRICH ${position}] 리뷰소스 Bright Data 시작`,
                  diagnosticCollectUrl,
                );

                console.log(
                  `[REVIEW-DIAG ${position}] collector-input`,
                  {
                    url:
                      diagnosticCollectUrl,
                    selectedReviewProductId,
                  },
                );

                const collected =
                  await collectNaverProduct(
                    diagnosticCollectUrl,
                  );

                console.log(
                  `[REVIEW-DIAG ${position}] collector-result`,
                  {
                    url:
                      diagnosticCollectUrl,
                    productId:
                      collected.productId,
                    totalReviews:
                      collected.totalReviews,
                    topReviews:
                      collected.topReviews.length,
                    collectedUrl:
                      collected.url,
                  },
                );

                if (
                  collected.topReviews.length >=
                  5
                ) {
                  reviewDetail =
                    collected;

                  reviewSourceUrl =
                    selectedReviewSource.resolvedUrl;

                  reviewTextSource =
                    "selected-source";

                  extraReviewBrightDataCalls =
                    1;

                  console.log(
                    `[ENRICH ${position}] 리뷰소스 Bright Data 완료`,
                    collected.topReviews.length,
                  );
                } else {
                  console.warn(
                    `[ENRICH ${position}] 리뷰소스 샘플 부족 → canonical fallback`,
                    collected.topReviews.length,
                  );
                }
              }

            } catch (error) {
              console.warn(
                `[REVIEW-DIAG ${position}] collector-error`,
                error instanceof Error
                  ? {
                      name:
                        error.name,
                      message:
                        error.message,
                      stack:
                        error.stack,
                    }
                  : error,
              );

              console.warn(
                `[ENRICH ${position}] 리뷰소스 Bright Data 실패 → canonical fallback`,
                error,
              );
            }
          }
        }
      }

      /*
        추천 가능한 FULL 후보 판정.

        순서가 중요하다:
        - 먼저 reviewSource까지 탐색하고 실제 리뷰 본문 확보를 시도한다.
        - 그 뒤 실제 리뷰 본문이 5개 이상이거나,
          제조사 공식페이지의 evaluationEvidence가
          3개 이상의 평가기준에 존재하는 경우만 FULL로 인정한다.

        reviewCount 같은 숫자 메타데이터만으로는 통과시키지 않는다.
        실제 리뷰 텍스트 또는 공식페이지 평가근거가 있어야 한다.
      */
      if (
        reviewDetail.topReviews.length <
        5
      ) {
        reviewTextSource =
          "unavailable";
      }

      const evaluationEvidence =
        detail.evaluationEvidence &&
        typeof detail.evaluationEvidence ===
          "object" &&
        !Array.isArray(
          detail.evaluationEvidence,
        )
          ? detail.evaluationEvidence
          : {};

      const evidenceCriterionCount =
        Object.values(
          evaluationEvidence,
        ).filter(
          (items) =>
            Array.isArray(items) &&
            items.some(
              (item) =>
                typeof item ===
                  "string" &&
                item.trim().length >
                  0,
            ),
        ).length;

      const reviewEvidenceCount =
        Array.isArray(
          reviewDetail.topReviews,
        )
          ? reviewDetail.topReviews.filter(
              (review) =>
                Boolean(
                  review?.text?.trim(),
                ),
            ).length
          : 0;

      const availableReviewCount =
        Math.max(
          Number(
            selectedReviewSource
              ?.reviewCount ??
              0,
          ) || 0,
          Number(
            reviewDetail.totalReviews ??
              0,
          ) || 0,
          Number(
            market.reviewCount ??
              0,
          ) || 0,
          cachedAnalyzedReviewCount,
        );

      /*
        고객 추천용 DB 상품은
        동일 모델의 정상 reviewSource / Catalog / 시장 메타데이터를
        모두 확인한 뒤 리뷰가 최소 30개 이상인 경우만 허용한다.

        브라우저에서 처음 열린 판매처의 리뷰가 0~3개여도
        즉시 탈락시키지 않는 이유는 같은 모델의 다른 판매처나
        Catalog에 충분한 리뷰가 있을 수 있기 때문이다.

        다만 최종적으로 확인 가능한 리뷰 총량이 30개 미만이면
        제조사 공식 스펙 근거가 충분하더라도 고객 추천용 DB에는
        포함시키지 않는다.
      */
      const hasMinimumReviewVolume =
        availableReviewCount >=
        MIN_REVIEW_COUNT_FOR_DB;

      const hasEvaluationEvidence =
        hasMinimumReviewVolume &&
        (
          reviewEvidenceCount >= 5 ||
          cachedAnalyzedReviewCount >= 5 ||
          evidenceCriterionCount >= 3
        );

      if (!hasEvaluationEvidence) {
        const reason =
          !hasMinimumReviewVolume
            ? `추천용 리뷰 총량 부족: availableReviews=${availableReviewCount}, minimum=${MIN_REVIEW_COUNT_FOR_DB}`
            : (
                `추천 평가근거 부족: reviews=${reviewEvidenceCount}, ` +
                `analyzedReviews=${cachedAnalyzedReviewCount}, ` +
                `evaluationCriteria=${evidenceCriterionCount}`
              );

        console.log(
          `[ENRICH ${position}] 탈락(evidence)`,
          reason,
        );

        return {
          success: false,

          resolverAttempts:
            candidateResolverAttempts,

          brightDataCalls:
            (
              canonicalSourceType ===
                "naver-brand"
                ? (
                    (usedCache || usedBrowserCatalogDetail) ? 0 : 1
                  )
                : 0
            ) +
            extraReviewBrightDataCalls,

          failure: {
            position,

            marketProduct:
              market.name,

            stage:
              "evidence",

            reason,
          },
        };
      }

      console.log(
        `[ENRICH ${position}] 검증 통과`,
        `${Math.round(
          (
            Date.now() -
            startedAt
          ) /
            1000,
        )}초`,
        detail.title,
      );

      return {
        success: true,

        position,

        productId:
          finalProductId,

        identityKey,

        resolverAttempts:
          candidateResolverAttempts,

        brightDataCalls:
          (
            canonicalSourceType ===
              "naver-brand"
              ? (
                  (usedCache || usedBrowserCatalogDetail) ? 0 : 1
                )
              : 0
          ) +
          extraReviewBrightDataCalls,

        candidate: {
          position,

          canonicalSource: {
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
          },

          reviewSource:
            selectedReviewSource
              ? {
                  productName:
                    selectedReviewSource.name,

                  seller:
                    selectedReviewSource.brand,

                  price:
                    selectedReviewSource.price,

                  reviewCount:
                    selectedReviewSource.reviewCount,

                  rating:
                    selectedReviewSource.rating,

                  url:
                    selectedReviewSource.url,

                  resolvedUrl:
                    selectedReviewSource.resolvedUrl,

                  sourceType:
                    selectedReviewSource.sourceType,

                  isIndividualSeller:
                    selectedReviewSource.isIndividualSeller,

                  matchScore:
                    selectedReviewSource.matchScore,

                  reviewTextSource,

                  status:
                    "selected" as const,
                }
              : {
                  productName:
                    detail.title,

                  seller:
                    detail.sellerName,

                  price:
                    detail.finalPrice,

                  reviewCount:
                    detail.totalReviews,

                  rating:
                    detail.averageRating ??
                    0,

                  url:
                    resolvedUrl,

                  resolvedUrl:
                    resolvedUrl,

                  sourceType:
                    canonicalSourceType ===
                      "manufacturer"
                      ? "external-store" as const
                      : canonicalSourceType ===
                          "naver-catalog"
                        ? "naver-aggregate" as const
                        : "naver-store" as const,

                  isIndividualSeller:
                    canonicalSourceType !==
                    "naver-catalog",

                  matchScore:
                    0,

                  reviewTextSource:
                    "canonical-fallback" as const,

                  status:
                    "fallback-canonical" as const,
                },

          purchaseSource:
            selectedPurchaseSource
              ? {
                  productName:
                    selectedPurchaseSource.name,

                  seller:
                    selectedPurchaseSource.brand,

                  price:
                    selectedPurchaseSource.price,

                  reviewCount:
                    selectedPurchaseSource.reviewCount,

                  rating:
                    selectedPurchaseSource.rating,

                  url:
                    selectedPurchaseSource.url,

                  resolvedUrl:
                    selectedPurchaseSource.resolvedUrl,

                  sourceType:
                    selectedPurchaseSource.sourceType,

                  isIndividualSeller:
                    selectedPurchaseSource.isIndividualSeller,

                  matchScore:
                    selectedPurchaseSource.matchScore,

                  status:
                    "selected" as const,
                }
              : {
                  productName:
                    market.name,

                  seller:
                    market.seller,

                  price:
                    market.price,

                  reviewCount:
                    market.reviewCount,

                  rating:
                    market.rating,

                  url:
                    market.url,

                  resolvedUrl:
                    market.url,

                  sourceType:
                    "unknown" as const,

                  isIndividualSeller:
                    false,

                  matchScore:
                    0,

                  status:
                    "fallback-market" as const,
                },

          market: {
            productName:
              market.name,

            seller:
              market.seller,

            listedPrice:
              market.price,

            reviewCount:
              market.reviewCount,

            rating:
              market.rating,

            imageUrl:
              market.imageUrl,

            sourceUrl:
              market.url,
          },

          resolution: {
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
          },

          detail: {
            productId:
              finalProductId,

            productName:
              detail.title,

            brand:
              detail.brand,

            manufacturer:
              detail.manufacturer,

            modelName:
              detail.modelName,

            originalPrice:
              detail.originalPrice,

            finalPrice:
              detail.finalPrice,

            discountRate:
              detail.discountRate,

            reviewCount:
              selectedReviewSource?.reviewCount ??
              reviewDetail.totalReviews,

            rating:
              selectedReviewSource?.rating ??
              reviewDetail.averageRating,

            sellerName:
              detail.sellerName,

            categoryName:
              detail.categoryName,

            imageUrl:
              detail.imageUrl,

            keySpecs:
              detail.keySpecs &&
              typeof detail.keySpecs === "object" &&
              !Array.isArray(detail.keySpecs)
                ? detail.keySpecs
                : {},

            evaluationEvidence:
              detail.evaluationEvidence &&
              typeof detail.evaluationEvidence ===
                "object" &&
              !Array.isArray(
                detail.evaluationEvidence,
              )
                ? detail.evaluationEvidence
                : {},

            reviewSamples:
              reviewDetail.topReviews.length,

            reviews:
              reviewDetail.topReviews,

            sourceUrl:
              detail.url,

            reviewSourceUrl,

            detailStatus:
              "full",
          },
        },
      };
    }

    /*
      3개씩 병렬 처리.

      한 묶음이 끝날 때마다 결과를 반영하고,
      DB 상품 풀 목표 30개가 확보되면 다음 묶음은 시작하지 않는다.
    */
    for (
      let start = 0;
      start <
      marketCandidates.length;
      start +=
        BATCH_SIZE
    ) {
      if (
        finalCandidates.length >=
        TARGET_COUNT
      ) {
        break;
      }

      const batch =
        marketCandidates.slice(
          start,
          start +
            BATCH_SIZE,
        );

      console.log(
        `[ENRICH BATCH] ${start + 1}~${start + batch.length}번 병렬 시작`,
      );

      const results =
        await Promise.all(
          batch.map(
            (
              market,
              batchIndex,
            ) =>
              processCandidate(
                market,
                start +
                  batchIndex,
              ),
          ),
        );

      for (
        const result of
        results
      ) {
        resolverAttempts +=
          result.resolverAttempts;

        brightDataCalls +=
          result.brightDataCalls;

        if (
          !result.success
        ) {
          failures.push(
            result.failure,
          );

          continue;
        }

        /*
          같은 배치 안에서
          동일 canonical 상품이 동시에 통과했을 수 있으므로
          여기서 최종 중복검사.
        */
        const resultIdentityKey =
          result.identityKey ||
          (
            result.productId
              ? `legacy:${result.productId}`
              : `market:${result.position}:${result.candidate.market.sourceUrl}`
          );

        if (
          seenIdentityKeys.has(
            resultIdentityKey,
          )
        ) {
          const failure:
            FailureItem = {
              position:
                result.position,

              marketProduct:
                result.candidate
                  .market
                  .productName,

              stage:
                "duplicate",

              reason:
                `Canonical 기준 동일상품 중복: ${resultIdentityKey}`,
            };

          failures.push(
            failure,
          );

          console.log(
            `[ENRICH ${result.position}] 탈락(duplicate)`,
            failure.reason,
          );

          continue;
        }

        if (
          result.candidate
            .detail
            .detailStatus ===
          "partial-market"
        ) {
          /*
            partial은 예비 후보로만 보관한다.
            뒤쪽 후보에서 full 상세를 확보할 가능성이 있으므로
            지금 full DB 상품 풀 자리를 차지시키지 않는다.
          */
          seenIdentityKeys.add(
            resultIdentityKey,
          );

          partialCandidates.push(
            result.candidate,
          );

          console.log(
            `[ENRICH ${result.position}] partial 예비 후보 보관`,
            `${partialCandidates.length}개`,
            result.candidate
              .market
              .productName,
          );

          continue;
        }

        if (
          finalCandidates.length >=
          TARGET_COUNT
        ) {
          /*
            이 배치에서 이미 full 상품 풀 목표 30개가 찼으면
            추가 성공 결과는 저장하지 않는다.
            다음 배치는 호출하지 않는다.
          */
          continue;
        }

        seenIdentityKeys.add(
            resultIdentityKey,
          );

        finalCandidates.push(
          result.candidate,
        );

        console.log(
          `[ENRICH ${result.position}] full 최종 후보 확정`,
          `${finalCandidates.length}/${TARGET_COUNT}`,
          result.candidate
            .detail
            .productName,
        );
      }

      console.log(
        `[ENRICH BATCH] 완료`,
        `현재 최종 ${finalCandidates.length}/${TARGET_COUNT}`,
      );
    }

    /*
      partial 후보는 끝까지 예비 후보로만 유지한다.

      중요:
      - finalCandidates에는 detailStatus === "full"인 후보만 들어간다.
      - partial 후보로 DB 상품 풀 목표 수를 채워 targetReached=true가 되는 일을 막는다.
      - resolver / Manufacturer 개선 후 재검증할 수 있도록
        partialCandidates는 응답에 별도로 남긴다.
    */

    if (
      zeroPaidOnly &&
      (
        resolverAttempts !== 0 ||
        brightDataCalls !== 0
      )
    ) {
      throw new Error(
        `zeroPaidOnly 안전장치 위반: resolver=${resolverAttempts}, Bright Data=${brightDataCalls}`,
      );
    }

    console.log(
      "Market candidates enriched summary:",
      {
        category,

        zeroPaidOnly,

        marketCandidateCount:
          marketCandidates.length,

        resolverAttempts,

        brightDataCalls,

        finalCandidateCount:
          finalCandidates.length,

        partialCandidateCount:
          partialCandidates.length,

        targetReached:
          finalCandidates.length >=
          TARGET_COUNT,

        failureCount:
          failures.length,
      },
    );

    if (
      failures.length >
      0
    ) {
      console.log(
        "Market candidates enriched failures:",
        failures,
      );
    }

    return NextResponse.json({
      success: true,

      category,

      zeroPaidOnly,

      zeroPaidCatalogQualifiedCount:
        marketCandidates.filter(
          (product) =>
            isZeroPaidBrowserCatalogCandidate(
              product,
            ),
        ).length,

      budget: {
        minBudget,
        maxBudget,
      },

      targetCount:
        TARGET_COUNT,

      marketCandidateCount:
        marketCandidates.length,

      resolverAttempts,

      brightDataCalls,

      finalCandidateCount:
        finalCandidates.length,

      partialCandidateCount:
        partialCandidates.length,

      targetReached:
        finalCandidates.length >=
        TARGET_COUNT,

      finalCandidates,

      partialCandidates,

      failureCount:
        failures.length,

      failures,
    });
  } catch (error) {
    console.error(
      "Market candidates enriched error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "후보상품 상세검증 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}
