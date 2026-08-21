import {
  buildResolverSearchPlan,
  getResolverSearchBudget,
} from "../lib/buildResolverSearchPlan";

type Result = {
  name: string;
  pass: boolean;
  detail: string;
};

const results: Result[] = [];

function expect(
  name: string,
  actual: unknown,
  expected: unknown,
) {
  const pass =
    JSON.stringify(actual) ===
    JSON.stringify(expected);

  results.push({
    name,
    pass,
    detail:
      `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
  });
}

function labels(
  plan: ReturnType<
    typeof buildResolverSearchPlan
  >,
) {
  return plan.map(
    (step) => step.label,
  );
}

function queries(
  plan: ReturnType<
    typeof buildResolverSearchPlan
  >,
) {
  return plan.map(
    (step) => step.query,
  );
}

/*
  P70 - 학습 브랜드
*/
{
  const plan =
    buildResolverSearchPlan({
      cleanedName:
        "모바 로봇청소기 P70 Pro Ultra RLP54HE AI센서 자동세척 화이트 단품",
      initialBrandCandidate:
        "모바",
      learnedBrandSite:
        "https://brand.naver.com/mova",
      modelTokens: [
        "P70",
        "Pro",
        "Ultra",
      ],
      modelLikeTokens: [
        "P70",
        "Pro",
        "Ultra",
      ],
    });

  expect(
    "P70 학습 브랜드 검색단계",
    labels(plan),
    [
      "product-name",
      "brand-site",
      "google-broad",
    ],
  );

  expect(
    "P70 MOVA store 직접검색 포함",
    queries(plan).includes(
      "site:brand.naver.com/mova P70 Pro",
    ),
    true,
  );
}

/*
  X60 - 학습 브랜드
*/
{
  const plan =
    buildResolverSearchPlan({
      cleanedName:
        "드리미 로봇청소기 X60 Ultra X60ULTRA 올인원 물통형 화이트",
      initialBrandCandidate:
        "드리미",
      learnedBrandSite:
        "https://brand.naver.com/dreame",
      modelTokens: [
        "X60",
        "Ultra",
        "X60ULTRA",
      ],
      modelLikeTokens: [
        "X60",
        "Ultra",
        "X60ULTRA",
      ],
    });

  expect(
    "X60 학습 브랜드 검색단계",
    labels(plan),
    [
      "product-name",
      "brand-site",
      "google-broad",
    ],
  );

  expect(
    "X60 Dreame store 직접검색 포함",
    queries(plan).includes(
      "site:brand.naver.com/dreame X60 Ultra",
    ),
    true,
  );
}

/*
  TS450 - 학습 브랜드
*/
{
  const plan =
    buildResolverSearchPlan({
      cleanedName:
        "에브리봇 TS450 쓰리스핀 슬림 물걸레 로봇청소기 26년 NEW",
      initialBrandCandidate:
        "에브리봇",
      learnedBrandSite:
        "https://brand.naver.com/everybot",
      modelTokens: [
        "TS450",
        "26년",
      ],
      modelLikeTokens: [
        "TS450",
        "26년",
      ],
    });

  expect(
    "TS450 학습 브랜드 검색단계",
    labels(plan),
    [
      "product-name",
      "brand-site",
      "google-broad",
    ],
  );

  expect(
    "TS450 Everybot store 직접검색 포함",
    queries(plan).includes(
      "site:brand.naver.com/everybot TS450",
    ),
    true,
  );
}

/*
  JONR - 미학습 브랜드
*/
{
  const plan =
    buildResolverSearchPlan({
      cleanedName:
        "JONR 존알 로봇청소기 X1 MAX",
      initialBrandCandidate:
        "JONR",
      learnedBrandSite:
        "",
      modelTokens: [
        "X1",
        "MAX",
      ],
      modelLikeTokens: [
        "X1",
        "MAX",
      ],
    });

  expect(
    "JONR 미학습 검색단계",
    labels(plan),
    [
      "product-name",
      "brand-site",
      "brand-model",
      "google-broad",
    ],
  );
}

/*
  검색 예산
*/
expect(
  "학습 브랜드 예산 3",
  getResolverSearchBudget(
    "https://brand.naver.com/mova",
  ),
  3,
);

expect(
  "미학습 브랜드 예산 4",
  getResolverSearchBudget(
    "",
  ),
  4,
);

console.log("");
console.log(
  "===== Resolver 검색계획 회귀 테스트 =====",
);
console.log("");

for (const result of results) {
  console.log(
    result.pass
      ? `[PASS] ${result.name}`
      : `[FAIL] ${result.name}`,
  );

  if (!result.pass) {
    console.log(
      "       " +
        result.detail,
    );
  }
}

const passed =
  results.filter(
    (item) => item.pass,
  ).length;

const failed =
  results.length - passed;

console.log("");
console.log(
  "===== 결과 =====",
);
console.log(
  "전체:",
  results.length,
);
console.log(
  "PASS:",
  passed,
);
console.log(
  "FAIL:",
  failed,
);

console.log("");
console.log(
  "SerpApi 호출: 0",
);
console.log(
  "Bright Data 호출: 0",
);

if (failed > 0) {
  process.exitCode = 1;
}

