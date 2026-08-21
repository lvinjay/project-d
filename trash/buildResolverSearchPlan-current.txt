export type ResolverSearchPlanInput = {
  cleanedName: string;
  initialBrandCandidate: string;
  learnedBrandSite?: string;
  modelTokens: string[];
  modelLikeTokens: string[];
  inputProductId?: string;
};

export type ResolverSearchPlanStep = {
  type:
    | "naver"
    | "google-broad";

  query: string;

  label: string;
};

const SEARCH_VARIANT_TOKENS =
  new Set([
    "ultra",
    "slim",
    "master",
    "pro",
    "maxv",
    "max",
    "plus",
    "mini",
  ]);

/*
  상품명의 앞 단어를 기계적으로 사용하는 대신
  실제 검색에 강한 모델 토큰을 우선 선택한다.

  예:
  TS450 쓰리스핀 26년 -> TS450
  X60 Ultra X60ULTRA -> X60 Ultra
  P70 Pro Ultra -> P70 Pro

  특정 카테고리나 브랜드명은 하드코딩하지 않는다.
*/
export function getStrongSearchModelTokens(
  tokens: string[],
): string[] {
  const normalized =
    tokens
      .map((token) =>
        String(token ?? "")
          .trim(),
      )
      .filter(Boolean);

  const strongModel =
    normalized.find(
      (token) =>
        /[a-zA-Z]/.test(token) &&
        /\d/.test(token),
    );

  if (!strongModel) {
    return normalized
      .filter(
        (token) =>
          /[a-zA-Z0-9]/.test(
            token,
          ),
      )
      .slice(0, 2);
  }

  const result =
    [strongModel];

  const strongIndex =
    normalized.indexOf(
      strongModel,
    );

  for (
    let i =
      strongIndex + 1;
    i < normalized.length;
    i += 1
  ) {
    const token =
      normalized[i];

    if (
      SEARCH_VARIANT_TOKENS.has(
        token.toLowerCase(),
      )
    ) {
      result.push(token);
      break;
    }

    /*
      다음 모델번호가 나오면
      현재 모델 표현은 끝난 것으로 본다.
    */
    if (
      /[a-zA-Z]/.test(token) &&
      /\d/.test(token)
    ) {
      break;
    }
  }

  return result.slice(0, 2);
}
function getBrandSlug(
  brandSite?: string,
) {
  return String(
    brandSite ?? "",
  )
    .replace(
      /^https?:\/\/brand\.naver\.com\//i,
      "",
    )
    .replace(
      /\/+$/,
      "",
    )
    .trim();
}

export function buildResolverSearchPlan(
  input: ResolverSearchPlanInput,
): ResolverSearchPlanStep[] {
  const {
    cleanedName,
    initialBrandCandidate,
    learnedBrandSite,
    modelTokens,
    modelLikeTokens,
    inputProductId,
  } = input;

  const steps:
    ResolverSearchPlanStep[] = [];

  /*
    1. 신뢰 가능한 실제 productId가 있는 경우
       productId + 상품명 검색을 가장 먼저 사용.
  */
  if (inputProductId) {
    steps.push({
      type: "naver",

      query:
        `${inputProductId} ${cleanedName}`,

      label:
        "product-id",
    });
  }

  /*
    2. 기본 상품명 검색.
  */
  steps.push({
    type: "naver",

    query:
      `${cleanedName} brand.naver.com`,

    label:
      "product-name",
  });

  /*
    3. 브랜드스토어 한정 검색.

       학습된 브랜드스토어가 있으면
       해당 slug를 직접 사용한다.

       예:
       everybot
       -> site:brand.naver.com/everybot TS450
  */
  if (initialBrandCandidate) {
    const shortModel =
      getStrongSearchModelTokens(
        modelTokens,
      ).join(" ");

    const brandSlug =
      getBrandSlug(
        learnedBrandSite,
      );

    const query =
      brandSlug
        ? `site:brand.naver.com/${brandSlug} ${shortModel}`
        : `site:brand.naver.com ${initialBrandCandidate} ${shortModel}`;

    steps.push({
      type: "naver",
      query,
      label:
        "brand-site",
    });
  }

  /*
    4. 미학습 브랜드에만 추가 Naver 검색.

       학습 브랜드는 검색비용을 줄이기 위해
       이 단계를 생략한다.
  */
  if (
    initialBrandCandidate &&
    modelLikeTokens.length > 0 &&
    !learnedBrandSite
  ) {
    steps.push({
      type: "naver",

      query:
        `${initialBrandCandidate} ${modelLikeTokens
          .slice(0, 3)
          .join(" ")} 공식`,

      label:
        "brand-model",
    });
  }

  /*
    5. Google broad fallback.

       모델 토큰을 과도하게 넣지 않는다.

       X60 Ultra X60ULTRA
       -> X60 Ultra
  */
  const googleModelTokens =
    getStrongSearchModelTokens(
      modelLikeTokens.length > 0
        ? modelLikeTokens
        : modelTokens,
    ).join(" ");

  const googleQuery =
    [
      initialBrandCandidate,
      googleModelTokens,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  if (googleQuery) {
    steps.push({
      type:
        "google-broad",

      query:
        `"${googleQuery}" "brand.naver.com"`,

      label:
        "google-broad",
    });
  }

  return steps;
}

export function getResolverSearchBudget(
  learnedBrandSite?: string,
) {
  /*
    현재 정책:

    학습 브랜드
    - 기본 Naver
    - brandSite 한정 Naver
    - Google broad
    => 최대 3회

    미학습 브랜드
    - 기본 Naver
    - 일반 brand.naver.com 검색
    - 브랜드/모델 Naver
    - Google broad
    => 최대 4회
  */
  return learnedBrandSite
    ? 3
    : 4;
}

