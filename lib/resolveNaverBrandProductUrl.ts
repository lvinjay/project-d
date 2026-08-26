import {
  gotScraping,
} from "got-scraping";

import {
  buildResolverSearchPlan,
  getResolverSearchBudget,
  getStrongSearchModelTokens,
} from "./buildResolverSearchPlan";
import {
  findBrandStoreMapping,
  saveBrandStoreMapping,
} from "./brandStoreMappings";
type SerpApiResult = {
  organic_results?: {
    title?: string;
    link?: string;
    snippet?: string;
  }[];

  ads_results?: {
    site?: string;
    title?: string;
    sub_title?: string;
    description?: string;
  }[];

  web_results?: {
    title?: string;
    link?: string;
    snippet?: string;
  }[];

  shopping_results?: {
    title?: string;
    link?: string;
    stores?: string;
    price?: number | string;
    rating?: number | string;
    reviews?: number | string;
  }[];
};

type SerpApiResponse =
  SerpApiResult & {
    error?: string;
  };

type CanonicalCandidate = {
  productId: string;
  brandSite: string;
  canonicalUrl: string;
  title: string;
};

/*
  A Brand Store search can return accessories/consumables whose title contains
  the parent product's model token. Reject those only when the source market
  product itself does not look like an accessory/consumable.
  This is intentionally category-agnostic and is used as an identity guard,
  not as a robot-vacuum-specific rule.
*/
const STRONG_ACCESSORY_OR_CONSUMABLE_PATTERNS: RegExp[] = [
  /(?:replacement|spare|refill|accessor(?:y|ies)|attachment|consumable|replacement\s+part|spare\s+part)/i,
  /(?:compatible\s+with|made\s+for|designed\s+for)/i,
  /(?:교체용|리필|소모품|액세서리|악세사리|부속품|부품|호환용|호환품|전용\s*(?:품|부품|소모품|액세서리|악세사리|필터|브러시|브러쉬|패드|걸레|배터리|리모컨|물통|먼지통|먼지봉투))/i,
  /*
    Some nouns are strong enough to identify the sold item itself as an
    accessory even without "replacement"/"dedicated" wording. Keep this list
    conservative: these are items that are not normally the main product.
  */
  /(?:remote\s*control|remote|replacement\s*remote|spare\s*remote)/i,
  /(?:리모컨|리모콘)/i,
];

const ACCESSORY_NOUN_PATTERNS: RegExp[] = [
  /(?:case|cover|bag|pouch|strap|stand|holder|mount|dock|charger|adapter|cable|cord)/i,
  /(?:filter|brush|pad|mop|cloth|wipe|roller|wheel|battery|remote|tray|tank|bin|dust\s*bag)/i,
  /(?:cartridge|ink|toner|paper|film|label|blade|bit|nozzle|hose|belt|cap|lid)/i,
  /(?:케이스|커버|가방|파우치|스트랩|거치대|홀더|마운트|충전기|어댑터|케이블|코드)/i,
  /(?:필터|브러시|브러쉬|패드|걸레|천|와이프|롤러|바퀴|배터리|리모컨|리모콘|트레이|물통|먼지통|먼지봉투)/i,
  /(?:카트리지|잉크|토너|용지|필름|라벨|날|비트|노즐|호스|벨트|캡|뚜껑)/i,
];

const ACCESSORY_PACKAGING_PATTERNS: RegExp[] = [
  /(?:\bset\b|\bkit\b|\bpack\b|\bpcs?\b|\bpieces?\b)/i,
  /(?:세트|키트|팩|묶음|\d+\s*(?:개|매|팩|세트))/i,
];

function hasStrongAccessoryOrConsumableSignal(
  value: string,
) {
  const text = String(value ?? "").trim();

  if (!text) {
    return false;
  }

  if (
    STRONG_ACCESSORY_OR_CONSUMABLE_PATTERNS.some(
      (pattern) => pattern.test(text),
    )
  ) {
    return true;
  }

  const hasAccessoryNoun =
    ACCESSORY_NOUN_PATTERNS.some(
      (pattern) => pattern.test(text),
    );

  const hasPackagingSignal =
    ACCESSORY_PACKAGING_PATTERNS.some(
      (pattern) => pattern.test(text),
    );

  return (
    hasAccessoryNoun &&
    hasPackagingSignal
  );
}

function isAccessoryOrConsumableMismatch(
  marketProductName: string,
  candidateTitle: string,
) {
  /*
    Do not reject a main product merely because its title contains a word
    that can also name an accessory (for example "mop", "filter", "battery",
    or Korean equivalents). Require stronger accessory evidence such as
    replacement/compatible/dedicated wording or accessory + pack/set wording.

    This keeps the guard category-agnostic while still rejecting cases such as
    "model X dedicated mop 6-pack" or "replacement filter set".
  */
  return (
    !hasStrongAccessoryOrConsumableSignal(
      marketProductName,
    ) &&
    hasStrongAccessoryOrConsumableSignal(
      candidateTitle,
    )
  );
}

function normalizeBrandSite(
  value: unknown,
) {
  const text =
    String(value ?? "")
      .trim();

  const match =
    text.match(
      /(?:https?:\/\/)?brand\.naver\.com\/([a-zA-Z0-9_-]+)/i,
    );

  if (!match) {
    return "";
  }

  return (
    "https://brand.naver.com/" +
    match[1]
  );
}

function normalizeCanonicalProductUrl(
  value: unknown,
) {
  const text =
    String(value ?? "")
      .trim();

  const match =
    text.match(
      /https?:\/\/brand\.naver\.com\/([a-zA-Z0-9_-]+)\/products\/(\d+)/i,
    );

  if (!match) {
    return null;
  }

  const brandSite =
    `https://brand.naver.com/${match[1]}`;

  const productId =
    match[2];

  return {
    productId,
    brandSite,
    canonicalUrl:
      `${brandSite}/products/${productId}`,
  };
}

async function searchNaver(
  query: string,
): Promise<SerpApiResponse> {
  const apiKey =
    process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "SERPAPI_API_KEY가 설정되지 않았습니다.",
    );
  }

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
      "https://serpapi.com/search?" +
        params.toString(),
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
        `SerpApi 검색 실패 (${response.status})`,
    );
  }

  return data;
}


async function searchGoogle(
  query: string,
): Promise<SerpApiResponse> {
  const apiKey =
    process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "SERPAPI_API_KEY가 설정되지 않았습니다.",
    );
  }

  const params =
    new URLSearchParams({
      engine: "google",
      q: query,
      hl: "ko",
      gl: "kr",
      api_key: apiKey,
    });

  const response =
    await fetch(
      "https://serpapi.com/search?" +
        params.toString(),
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
        `SerpApi Google 검색 실패 (${response.status})`,
    );
  }

  return data;
}

function extractGoogleCanonicalCandidates(
  data: SerpApiResult,
) {
  const candidates =
    new Map<
      string,
      CanonicalCandidate
    >();

  const add = (
    value: unknown,
    title = "",
  ) => {
    const normalized =
      normalizeCanonicalProductUrl(
        value,
      );

    if (!normalized) {
      return;
    }

    if (
      !candidates.has(
        normalized.canonicalUrl,
      )
    ) {
      candidates.set(
        normalized.canonicalUrl,
        {
          ...normalized,
          title,
        },
      );
    }
  };

  for (
    const result of
    data.organic_results ?? []
  ) {
    add(
      result.link,
      String(
        result.title ?? "",
      ),
    );

    const snippet =
      String(
        result.snippet ?? "",
      );

    const snippetMatches =
      snippet.match(
        /https?:\/\/brand\.naver\.com\/[a-zA-Z0-9_-]+\/products\/\d+/gi,
      ) ?? [];

    for (
      const match of
      snippetMatches
    ) {
      add(
        match,
        String(
          result.title ?? "",
        ),
      );
    }
  }

  const serialized =
    JSON.stringify(data);

  const matches =
    serialized.match(
      /https?:\/\/brand\.naver\.com\/[a-zA-Z0-9_-]+\/products\/\d+/gi,
    ) ?? [];

  for (
    const match of
    matches
  ) {
    add(match);
  }

  return [
    ...candidates.values(),
  ];
}

function extractBrandSites(
  data: SerpApiResult,
) {
  const sites =
    new Set<string>();

  const add = (
    value: unknown,
  ) => {
    const site =
      normalizeBrandSite(
        value,
      );

    if (site) {
      sites.add(site);
    }
  };

  for (
    const ad of
    data.ads_results ?? []
  ) {
    add(ad.site);
  }

  for (
    const result of
    data.web_results ?? []
  ) {
    add(result.link);
  }

  for (
    const result of
    data.shopping_results ?? []
  ) {
    add(result.link);
  }

  const serialized =
    JSON.stringify(data);

  const matches =
    serialized.match(
      /brand\.naver\.com\/[a-zA-Z0-9_-]+/gi,
    ) ?? [];

  for (
    const match of
    matches
  ) {
    add(match);
  }

  return [...sites];
}

function extractCanonicalCandidates(
  data: SerpApiResult,
) {
  const candidates =
    new Map<
      string,
      CanonicalCandidate
    >();

  const add = (
    value: unknown,
    title = "",
  ) => {
    const normalized =
      normalizeCanonicalProductUrl(
        value,
      );

    if (!normalized) {
      return;
    }

    const key =
      normalized.canonicalUrl;

    if (
      !candidates.has(key)
    ) {
      candidates.set(
        key,
        {
          ...normalized,
          title,
        },
      );
    }
  };

  for (
    const result of
    data.web_results ?? []
  ) {
    add(
      result.link,
      String(
        result.title ?? "",
      ),
    );
  }

  for (
    const result of
    data.shopping_results ?? []
  ) {
    add(
      result.link,
      String(
        result.title ?? "",
      ),
    );
  }

  /*
    구조화 필드 밖에 공식 상품 URL이
    들어오는 경우도 대응한다.
  */
  const serialized =
    JSON.stringify(data);

  const matches =
    serialized.match(
      /https?:\/\/brand\.naver\.com\/[a-zA-Z0-9_-]+\/products\/\d+/gi,
    ) ?? [];

  for (
    const match of
    matches
  ) {
    add(match);
  }

  return [
    ...candidates.values(),
  ];
}

function extractBrandName(
  data: SerpApiResult,
) {
  for (
    const result of
    data.web_results ?? []
  ) {
    const combined =
      [
        result.title,
        result.snippet,
      ]
        .filter(Boolean)
        .join(" ");

    const match =
      combined.match(
        /브랜드\s*[:：]\s*([가-힣A-Za-z0-9._+-]+)/,
      );

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function getProductId(
  productUrl: string,
) {
  /*
    1. smartstore / brand 상품 URL

    예:
    /products/10775617216
    /main/products/10775617216
  */
  const pathMatch =
    productUrl.match(
      /\/(?:main\/)?products\/(\d+)/,
    );

  if (pathMatch?.[1]) {
    return pathMatch[1];
  }

  /*
    2. 네이버 쇼핑 bridge / 광고 URL의 nv_mid는
    네이버 쇼핑 상품번호이지
    brand.naver.com의 실제 productId가 아니다.

    따라서 nv_mid를 공식 상품번호로 반환하지 않는다.

    bridge URL은 빈 문자열을 반환해
    아래 Resolver 검색 단계에서
    실제 brand.naver.com 상품 URL과
    실제 productId를 찾도록 한다.
  */
  return "";
}

function cleanProductName(
  value: string,
) {
  return value
    .replace(
      /\[[^\]]*\]/g,
      " ",
    )
    .replace(
      /\([^)]*\)/g,
      " ",
    )
    .replace(
      /[,/|]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function getUsefulTokens(
  productName: string,
) {
  const ignored =
    new Set([
      "로봇청소기",
      "청소기",
      "로봇",
      "무선",
      "가정용",
      "자동",
      "단품",
      "화이트",
      "블랙",
      "공식",
      "정품",
      "신제품",
      "인공지능",
      "올인원",
    ]);

  return cleanProductName(
    productName,
  )
    .split(" ")
    .map(
      (token) =>
        token.trim(),
    )
    .filter(
      (token) =>
        token.length >= 2 &&
        !ignored.has(token),
    );
}

function getBrandCandidate(
  productName: string,
) {
  const tokens =
    cleanProductName(
      productName,
    ).split(" ");

  return (
    tokens.find(
      (token) =>
        token.length >= 2 &&
        ![
          "로봇청소기",
          "청소기",
          "로봇",
        ].includes(token),
    ) ?? ""
  );
}

function candidateScore(
  candidate:
    CanonicalCandidate,
  productName: string,
  expectedProductId: string,
) {
  if (
    expectedProductId &&
    candidate.productId ===
      expectedProductId
  ) {
    return 1000;
  }

  const wantedTokens =
    getUsefulTokens(
      productName,
    )
      .map(
        (token) =>
          token.toLowerCase(),
      );

  const title =
    candidate.title
      .toLowerCase();

  let score = 0;

  for (
    const token of
    wantedTokens
  ) {
    if (
      title.includes(token)
    ) {
      score += 10;
    }
  }

  return score;
}


function decodeBasicHtmlEntities(
  value: string,
) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlForCandidateTitle(
  value: string,
) {
  return decodeBasicHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function searchBrandStoreDirect(
  slug: string,
  query: string,
): Promise<CanonicalCandidate[]> {
  const normalizedSlug =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "")
      .trim();

  if (!normalizedSlug) {
    return [];
  }

  const searchUrl =
    `https://brand.naver.com/${normalizedSlug}/search?q=${encodeURIComponent(query)}`;

  const response =
    await gotScraping.get(
      searchUrl,
      {
        headers: {
          "accept-language":
            "ko-KR,ko;q=0.9,en;q=0.8",
        },
        timeout: {
          request: 15000,
        },
        throwHttpErrors: false,
      },
    );

  if (
    response.statusCode < 200 ||
    response.statusCode >= 300
  ) {
    throw new Error(
      `Brand Store direct search failed (${response.statusCode})`,
    );
  }

  const html =
    String(
      response.body ?? "",
    );

  const candidates =
    new Map<
      string,
      CanonicalCandidate
    >();

  const hrefPattern =
    new RegExp(
      `href=["']/${normalizedSlug}/products/(\\d+)[^"']*["']`,
      "gi",
    );

  for (
    const match of
    html.matchAll(hrefPattern)
  ) {
    const productId =
      match[1];

    if (!productId) {
      continue;
    }

    const index =
      match.index ?? 0;

    const chunk =
      html.slice(
        Math.max(0, index - 900),
        Math.min(
          html.length,
          index + 1500,
        ),
      );

    const altMatches =
      [
        ...chunk.matchAll(
          /alt=["']([^"']{2,300})["']/gi,
        ),
      ];

    const strongMatches =
      [
        ...chunk.matchAll(
          /<strong[^>]*>([\s\S]{2,500}?)<\/strong>/gi,
        ),
      ];

    const titleCandidates =
      [
        ...altMatches.map(
          (item) =>
            decodeBasicHtmlEntities(
              String(
                item[1] ?? "",
              ),
            ),
        ),
        ...strongMatches.map(
          (item) =>
            stripHtmlForCandidateTitle(
              String(
                item[1] ?? "",
              ),
            ),
        ),
      ]
        .map((value) =>
          value
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            b.length -
            a.length,
        );

    const brandSite =
      `https://brand.naver.com/${normalizedSlug}`;

    const canonicalUrl =
      `${brandSite}/products/${productId}`;

    if (
      !candidates.has(
        canonicalUrl,
      )
    ) {
      candidates.set(
        canonicalUrl,
        {
          productId,
          brandSite,
          canonicalUrl,
          title:
            titleCandidates[0] ??
            "",
        },
      );
    }
  }

  const result =
    [
      ...candidates.values(),
    ];

  if (result.length === 0) {
    console.warn(
      "Brand Store direct parse warning:",
      {
        slug: normalizedSlug,
        statusCode:
          response.statusCode,
        htmlLength:
          html.length,
        hasProductPath:
          html.includes(
            `/${normalizedSlug}/products/`,
          ),
      },
    );
  }

  return result;
}

/*
  SerpApi 비용 상한.
  Naver 검색 + Google broad fallback을 합쳐
  제품당 최대 4회까지만 허용한다.
*/
const MAX_SERPAPI_QUERIES_PER_PRODUCT = 4;

export async function resolveNaverBrandProductUrl(
  productUrl: string,
  productName: string,
  brandHints: string[] = [],
) {
  /*
    direct smartstore/brand URL이면
    여기서 상품번호가 바로 잡힌다.

    ader/cr3 같은 중간 URL이면
    productId는 빈 문자열로 시작하고,
    아래 SerpApi 공식상품 검색에서
    실제 productId를 다시 확보한다.
  */
  const inputProductId =
    getProductId(
      productUrl,
    );

  const cleanedName =
    cleanProductName(
      productName,
    );

  const usefulTokens =
    getUsefulTokens(
      productName,
    );

  const initialBrandCandidate =
    getBrandCandidate(
      productName,
    );

  /*
    route가 이미 알고 있는 브랜드/제조사/판매자 힌트도 resolver에 전달할 수 있다.
    이 값은 canonical URL을 확정하는 근거가 아니라,
    마지막 Brand Store 한정 검색의 slug 후보를 만드는 탐색 힌트로만 사용한다.
  */
  const normalizedBrandHints =
    Array.from(
      new Set(
        [
          initialBrandCandidate,
          ...brandHints,
        ]
          .map((value) =>
            String(value ?? "")
              .trim(),
          )
          .filter(Boolean),
      ),
    );

  const brandSlugCandidates =
    Array.from(
      new Set(
        normalizedBrandHints
          .map((value) =>
            value
              .toLowerCase()
              .replace(
                /(공식몰|공식스토어|공식점|브랜드스토어|스토어|store|official)/gi,
                " ",
              )
              .replace(
                /[^a-z0-9_-]+/g,
                "",
              )
              .trim(),
          )
          .filter(
            (value) =>
              value.length >= 2 &&
              value.length <= 40,
          ),
      ),
    );

  /*
    브랜드명만으로도 기존에 학습된
    공식 브랜드스토어 매핑을 미리 조회한다.

    bridge URL처럼 inputProductId가 없어도
    이후 검색 결과 후보의 브랜드스토어를
    판별하는 데 사용한다.
  */
  const learnedBrandMapping =
    normalizedBrandHints.length > 0
      ? await findBrandStoreMapping(
          normalizedBrandHints,
        )
      : null;

  /*
    학습된 brandSite만으로 productId를 조합해 즉시 반환하지 않는다.

    SmartStore와 Brand Store에서 같은 상품이 서로 다른 productId를
    사용할 수 있고, 반대로 학습된 brandSite에 현재 productId가 실제로
    존재한다는 보장도 없다. 아래 검색 결과에서 실제 canonical 상품 URL을
    확보한 뒤 모델 토큰까지 검증해서 선택한다.
  */

  const modelTokens =
    usefulTokens
      .filter(
        (token) =>
          token !==
          initialBrandCandidate,
      )
      .slice(
        0,
        3,
      );

  const triedQueries:
    string[] = [];

  let brandName = "";

  const canonicalCandidates:
    CanonicalCandidate[] = [];

  const brandSites =
    new Set<string>();

  const tryQuery =
    async (
      query: string,
    ) => {
      const normalized =
        query
          .replace(
            /\s+/g,
            " ",
          )
          .trim();

      if (
        !normalized ||
        triedQueries.includes(
          normalized,
        )
      ) {
        return;
      }

      triedQueries.push(
        normalized,
      );

      let data:
        SerpApiResponse;

      try {
        data =
          await searchNaver(
            normalized,
          );
      } catch (error) {
        /*
          SerpApi Naver가 특정 검색어에서
          "Naver hasn't returned any results for this query."
          같은 오류를 반환하더라도 resolver 전체를 종료하지 않는다.

          이 호출 자체는 이미 시도된 것으로 triedQueries에 남겨
          비용/호출 상한 계산에는 포함시키고,
          다음 Naver 단계 또는 마지막 Google broad fallback으로 진행한다.
        */
        console.warn(
          "Naver resolver query warning:",
          normalized,
          error,
        );

        return;
      }

      for (
        const site of
        extractBrandSites(
          data,
        )
      ) {
        brandSites.add(site);
      }

      for (
        const candidate of
        extractCanonicalCandidates(
          data,
        )
      ) {
        if (
          !canonicalCandidates.some(
            (existing) =>
              existing.canonicalUrl ===
              candidate.canonicalUrl,
          )
        ) {
          canonicalCandidates.push(
            candidate,
          );
        }
      }

      if (!brandName) {
        brandName =
          extractBrandName(
            data,
          );
      }
    };

  /*
    학습된 공식 브랜드스토어와 일치하는 canonical 후보를
    확보했다면 남은 Naver 검색을 생략한다.

    canonical 후보가 단순히 하나 존재한다는 이유만으로
    중단하지 않는다. 검색 결과에는 다른 브랜드 상품 URL도
    섞일 수 있기 때문이다.
  */
  const hasTrustedBrandCandidate =
    () =>
      Boolean(
        learnedBrandMapping?.brandSite &&
        canonicalCandidates.some(
          (candidate) =>
            candidate.brandSite ===
            learnedBrandMapping.brandSite,
        ),
      );

  const modelLike =
    usefulTokens.filter(
      (token) =>
        /[a-zA-Z]/.test(
          token,
        ) ||
        /\d/.test(
          token,
        ),
    );

  /*
    검색 순서 자체는 공용 모듈에서 관리한다.

    중요한 점:
    계획을 처음부터 전부 실행하지 않는다.

    각 Naver 검색 후 신뢰 가능한 공식 브랜드 후보가
    확보되면 남은 Naver 검색은 즉시 중단한다.

    따라서:
    - 회귀 테스트와 생산 코드가 같은 검색계획 사용
    - 기존 조기 종료 최적화 유지
    - 불필요한 SerpApi 검색 방지
  */
  /*
    무료 Brand Store 내부검색을 SerpApi보다 먼저 시도한다.

    브랜드/판매자 힌트에서 만든 slug는 "탐색 범위"로만 사용하고,
    실제 검색 HTML에 존재하는 /products/{id} 링크만 후보로 넣는다.

    우선순위:
    1. 입력 SmartStore productId와 동일한 Brand 상품
    2. 동일 ID가 없으면 아래 기존 strong-model/cross-ID 검증

    이 단계에서 실제 canonical 후보를 확보하면
    유료 SerpApi 검색을 건너뛸 수 있다.
  */
  if (
    canonicalCandidates.length === 0 &&
    brandSlugCandidates.length > 0
  ) {
    const directSearchQuery =
      modelTokens
        .slice(0, 2)
        .join(" ")
        .trim() ||
      cleanedName;

    for (
      const slug of
      brandSlugCandidates.slice(0, 2)
    ) {
      const label =
        `[brand-direct] https://brand.naver.com/${slug}/search?q=${directSearchQuery}`;

      triedQueries.push(label);

      try {
        const directCandidates =
          await searchBrandStoreDirect(
            slug,
            directSearchQuery,
          );

        for (
          const candidate of
          directCandidates
        ) {
          if (
            !canonicalCandidates.some(
              (existing) =>
                existing.canonicalUrl ===
                candidate.canonicalUrl,
            )
          ) {
            canonicalCandidates.push(
              candidate,
            );
          }
        }

        /*
          동일 productId가 Brand Store 검색 HTML에 실제 존재하면
          가장 강한 근거이므로 추가 slug 검색은 즉시 중단한다.
        */
        if (
          inputProductId &&
          canonicalCandidates.some(
            (candidate) =>
              candidate.productId ===
              inputProductId,
          )
        ) {
          break;
        }
      } catch (error) {
        console.warn(
          "Brand Store direct search warning:",
          slug,
          error,
        );
      }
    }
  }

  const resolverSearchPlan =
    buildResolverSearchPlan({
      cleanedName,
      initialBrandCandidate:
        initialBrandCandidate || "",
      learnedBrandSite:
        learnedBrandMapping?.brandSite ||
        "",
      modelTokens,
      modelLikeTokens:
        modelLike,
      inputProductId:
        inputProductId || "",
    });

  const resolverSearchBudget =
    Math.min(
      MAX_SERPAPI_QUERIES_PER_PRODUCT,
      getResolverSearchBudget(
        learnedBrandMapping?.brandSite,
      ),
    );

  const hasGoogleBroadStep =
    resolverSearchPlan.some(
      (step) =>
        step.type ===
        "google-broad",
    );

  if (
    canonicalCandidates.length === 0
  ) {
  for (
    const step of
    resolverSearchPlan
  ) {
    if (
      triedQueries.length >=
      resolverSearchBudget
    ) {
      break;
    }

    if (
      step.type === "naver"
    ) {
      /*
        Naver 검색이 계속 빈 결과/오류로 끝나는 경우에도
        총 SerpApi 상한 안에서 마지막 1회를 Google broad에 남긴다.

        예: budget=4이면 canonical 후보가 아직 0개일 때
        Naver는 최대 3회까지만 시도하고 Google broad 1회를 확보한다.
      */
      if (
        hasGoogleBroadStep &&
        canonicalCandidates.length ===
          0 &&
        resolverSearchBudget > 0 &&
        triedQueries.length >=
          resolverSearchBudget - 1
      ) {
        continue;
      }
      /*
        product-id는 입력 상품번호가 있을 때
        가장 먼저 실행되는 강한 검색이다.

        이후 Naver 단계는 이미 신뢰 공식 후보를
        확보했다면 실행하지 않는다.
      */
      if (
        step.label !==
          "product-id" &&
        hasTrustedBrandCandidate()
      ) {
        continue;
      }

      await tryQuery(
        step.query,
      );

      continue;
    }

    /*
      Google broad는 Naver 검색으로 canonical 후보를
      하나도 확보하지 못했을 때만 사용한다.

      Naver의 "no results" 오류는 tryQuery 내부에서 흡수되므로
      JONR처럼 Naver 검색이 비어도 이 단계까지 정상 도달할 수 있다.

      총 SerpApi 상한은 위에서 마지막 1회를 예약해 그대로 유지한다.
    */
    if (
      step.type ===
        "google-broad"
    ) {
      if (
        canonicalCandidates.length >
        0
      ) {
        continue;
      }

      const labeledQuery =
        `[google-broad] ${step.query}`;

      triedQueries.push(
        labeledQuery,
      );

      try {
        const googleData =
          await searchGoogle(
            step.query,
          );

        for (
          const candidate of
          extractGoogleCanonicalCandidates(
            googleData,
          )
        ) {
          if (
            !canonicalCandidates.some(
              (existing) =>
                existing.canonicalUrl ===
                candidate.canonicalUrl,
            )
          ) {
            canonicalCandidates.push(
              candidate,
            );
          }
        }

        for (
          const site of
          extractBrandSites(
            googleData,
          )
        ) {
          brandSites.add(
            site,
          );
        }
      } catch (error) {
        console.warn(
          "Google broad fallback warning:",
          error,
        );
      }
    }
  }
  }

  /*
    일반 Naver/Google 검색에서도 canonical 후보를 찾지 못한 경우에만
    브랜드 힌트에서 만든 slug를 이용해 Brand Store 범위를 좁혀 한 번 더 찾는다.

    중요:
    - slug는 탐색 힌트일 뿐 canonical 확정 근거가 아니다.
    - SmartStore productId를 Brand Store URL에 붙여 만들지 않는다.
    - 검색 결과에서 실제 /products/{id} URL을 확보한 뒤 아래 기존
      strong-model / cross-ID 검증을 그대로 통과해야 한다.
    - 비용 폭증 방지를 위해 slug 후보는 최대 2개만 사용한다.
  */
  if (
    canonicalCandidates.length === 0 &&
    brandSlugCandidates.length > 0
  ) {
    const scopedModelQuery =
      (
        modelLike.length > 0
          ? modelLike.slice(0, 2)
          : modelTokens.slice(0, 2)
      )
        .join(" ")
        .trim() ||
      cleanedName;

    for (
      const slug of
      brandSlugCandidates.slice(0, 2)
    ) {
      const scopedQuery =
        `site:brand.naver.com/${slug} "${scopedModelQuery}"`;

      const labeledQuery =
        `[google-brand-slug] ${scopedQuery}`;

      if (
        triedQueries.includes(
          labeledQuery,
        )
      ) {
        continue;
      }

      triedQueries.push(
        labeledQuery,
      );

      try {
        const googleData =
          await searchGoogle(
            scopedQuery,
          );

        for (
          const candidate of
          extractGoogleCanonicalCandidates(
            googleData,
          )
        ) {
          if (
            candidate.brandSite !==
            `https://brand.naver.com/${slug}`
          ) {
            continue;
          }

          if (
            !canonicalCandidates.some(
              (existing) =>
                existing.canonicalUrl ===
                candidate.canonicalUrl,
            )
          ) {
            canonicalCandidates.push(
              candidate,
            );
          }
        }

        if (
          canonicalCandidates.length > 0
        ) {
          break;
        }
      } catch (error) {
        console.warn(
          "Google brand-slug fallback warning:",
          slug,
          error,
        );
      }
    }
  }

  /*
    공식 상품 URL 후보가 확보됐으면
    상품번호 일치 또는 상품명 토큰 일치도가
    가장 높은 후보를 선택한다.
  */
  /*
    중간 Naver URL처럼 신뢰 가능한 inputProductId가 없는 경우에는
    "같은 브랜드스토어"라는 이유만으로 다른 모델을 선택하면 안 된다.

    예:
    드리미 X60 Master
    -> 오염된 학습 매핑이 lezen을 가리킴
    -> 같은 lezen 후보에 +1000점
    -> 실제 상세는 3D / RS20인데 canonical로 잘못 채택

    따라서 모델번호처럼 영문+숫자가 섞인 강한 모델 토큰이 있으면
    후보 title에도 그 모델 토큰이 실제로 존재하는 후보만
    최종 canonical 후보로 인정한다.

    direct product URL처럼 inputProductId가 이미 신뢰 가능한 경우에는
    기존 productId 일치 규칙을 그대로 사용한다.
  */
  const strongModelTokens =
    getStrongSearchModelTokens(
      modelLike.length > 0
        ? modelLike
        : modelTokens,
    );

  const primaryStrongModelToken =
    strongModelTokens.find(
      (token) =>
        /[a-zA-Z]/.test(token) &&
        /\d/.test(token),
    ) ?? "";

  const rankedCandidates =
    [...canonicalCandidates]
      .map(
        (candidate) => {
          const modelTokenMatched =
            !primaryStrongModelToken ||
            candidate.title
              .toLowerCase()
              .includes(
                primaryStrongModelToken
                  .toLowerCase(),
              );

          const accessoryOrConsumableMismatch =
            isAccessoryOrConsumableMismatch(
              productName,
              candidate.title,
            );

          return {
            candidate,
            modelTokenMatched,
            accessoryOrConsumableMismatch,
            score:
              candidateScore(
                candidate,
                productName,
                inputProductId,
              ) +
              (
                learnedBrandMapping
                  ?.brandSite ===
                candidate.brandSite
                  ? 1000
                  : 0
              ),
          };
        },
      )
      .sort(
        (a, b) =>
          b.score -
          a.score,
      );

  /*
    같은 productId는 가장 강한 근거이므로 우선 허용한다.

    다만 SmartStore와 Brand Store에서 동일 상품이 서로 다른 productId를
    가질 수 있으므로, ID가 다르더라도 강한 모델 토큰이 실제 후보 제목에
    존재하고 상품명 토큰 점수가 충분한 공식 canonical 후보는 허용한다.

    learned brandSite가 있으면 반드시 그 공식 스토어 후보여야 한다.
    강한 모델 토큰이 없는 cross-ID 후보는 오매칭 위험 때문에 허용하지 않는다.
  */
  const best =
    rankedCandidates.find(
      (item) => {
        const sameProductId =
          Boolean(
            inputProductId &&
            item.candidate.productId ===
              inputProductId,
          );

        /*
          Exact productId equality is stronger than title heuristics.
          This must be checked before the accessory/consumable guard because
          a main product title can legitimately contain words such as
          "물걸레", "필터", or "배터리" as part of its product category/features.
        */
        if (sameProductId) {
          return true;
        }

        if (
          item.accessoryOrConsumableMismatch
        ) {
          return false;
        }

        const trustedBrandSite =
          !learnedBrandMapping?.brandSite ||
          item.candidate.brandSite ===
            learnedBrandMapping.brandSite;

        const crossIdModelMatch =
          Boolean(primaryStrongModelToken) &&
          item.modelTokenMatched &&
          item.score >= 10 &&
          trustedBrandSite;

        if (inputProductId) {
          return crossIdModelMatch;
        }

        return (
          item.modelTokenMatched &&
          item.score > 0 &&
          trustedBrandSite
        );
      },
    );

  if (best) {
    /*
      최종 선택된 공식 brandSite와 브랜드명을 함께 맞춘다.

      검색 중 extractBrandName()이 다른 검색결과의 브랜드명을
      먼저 잡을 수 있으므로 brandName을 무조건 우선하지 않는다.

      기존 학습 매핑이 최종 brandSite와 정확히 일치하면
      그 매핑의 브랜드명을 가장 신뢰한다.

      그렇지 않으면 원래 시장 상품명에서 추출한 브랜드명을
      우선 사용하고, 마지막 fallback으로 검색 추출값을 사용한다.
    */
    const matchedLearnedBrandName =
      learnedBrandMapping?.brandSite ===
      best.candidate.brandSite
        ? learnedBrandMapping.brandName
        : "";

    const resolvedBrandName =
      matchedLearnedBrandName ||
      initialBrandCandidate ||
      brandName;

    /*
      매핑 저장 시에도 검색 중 우연히 추출된 brandName을
      alias로 넣지 않는다.

      잘못된 브랜드명이 올바른 brandSite에 학습되는
      매핑 오염을 방지한다.
    */
    try {
      await saveBrandStoreMapping(
        [
          ...normalizedBrandHints,
          resolvedBrandName,
        ],
        best.candidate
          .brandSite,
        {
          source:
            "serpapi_product_match",
          confidence:
            100,
        },
      );
    } catch (error) {
      console.warn(
        "Brand mapping save warning:",
        error,
      );
    }

    return {
      success: true as const,

      productId:
        best.candidate
          .productId,

      brandName:
        resolvedBrandName,

      brandSite:
        best.candidate
          .brandSite,

      canonicalUrl:
        best.candidate
          .canonicalUrl,

      triedQueries,
    };
  }

  /*
    검색 결과에서 실제 canonical 상품 URL을 확보하지 못했다면 실패한다.

    brandSite만 발견했거나 학습 매핑만 존재한다는 이유로
    `${brandSite}/products/${inputProductId}`를 조합하지 않는다.
    존재하지 않는 Brand 상품 URL을 만들어 Bright Data에 전달하는 것을
    방지하기 위한 안전장치다.
  */

  return {
    success: false as const,

    productId:
      inputProductId,

    brandName:
      brandName ||
      initialBrandCandidate,

    brandSite:
      learnedBrandMapping?.brandSite ||
      [...brandSites][0] ||
      "",

    canonicalUrl: "",

    triedQueries,

    diagnostic: {
      primaryStrongModelToken,
      canonicalCandidateCount:
        canonicalCandidates.length,
      canonicalCandidates:
        rankedCandidates
          .slice(0, 10)
          .map((item) => ({
            productId:
              item.candidate.productId,
            brandSite:
              item.candidate.brandSite,
            canonicalUrl:
              item.candidate.canonicalUrl,
            title:
              item.candidate.title,
            score:
              item.score,
            modelTokenMatched:
              item.modelTokenMatched,
            accessoryOrConsumableMismatch:
              item.accessoryOrConsumableMismatch,
          })),
      discoveredBrandSites:
        [...brandSites],
      learnedBrandSite:
        learnedBrandMapping?.brandSite ||
        "",
    },

    reason:
      inputProductId
        ? "brand.naver.com 공식 상품 URL을 찾지 못했습니다."
        : "중간 네이버 URL에서 공식 상품번호와 brand.naver.com 상품 URL을 확인하지 못했습니다.",
  };
}
















