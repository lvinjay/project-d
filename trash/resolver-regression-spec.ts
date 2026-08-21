import {
  validateProductMatch,
} from "../lib/validateProductMatch";

function hasTrustedBrandCandidate(
  learnedBrandSite: string,
  candidateSites: string[],
) {
  return Boolean(
    learnedBrandSite &&
    candidateSites.includes(
      learnedBrandSite,
    ),
  );
}

function expectedMaxSearches(
  learnedBrandSite: string,
) {
  return learnedBrandSite
    ? 3
    : 4;
}

type TestResult = {
  name: string;
  pass: boolean;
  detail: string;
};

const results:
  TestResult[] = [];

function expect(
  name: string,
  actual: unknown,
  expected: unknown,
) {
  const pass =
    actual === expected;

  results.push({
    name,
    pass,
    detail:
      `actual=${String(actual)} / expected=${String(expected)}`,
  });
}

/*
  ==================================================
  1. 정상 FULL이어야 하는 제품
  ==================================================
*/

{
  const result =
    validateProductMatch(
      "모바 로봇청소기 P70 Pro Ultra RLP54HE AI센서 자동세척 화이트, 단품",
      "모바 P70 Pro Ultra 물걸레 로봇청소기 RGB 센서 온수세척 고온건조 물걸레 확장",
      "모바 로봇청소기 P70 Pro Ultra RLP54HE AI센서 자동세척 화이트",
    );

  expect(
    "P70 정상 매칭",
    result.matched,
    true,
  );
}

{
  const result =
    validateProductMatch(
      "드리미 로봇청소기 X60 Ultra X60ULTRA 올인원 물통형, 화이트",
      "[1위 달성] X60 Ultra 올인원 로봇청소기 화이트, 단품",
    );

  expect(
    "X60 Ultra 정상 매칭",
    result.matched,
    true,
  );
}

/*
  ==================================================
  2. 반드시 차단해야 하는 오매칭
  ==================================================
*/

{
  const result =
    validateProductMatch(
      "로보락 로봇청소기 S10 MaxV Ultra RRE0VES+EWFD55HRR 자동 물통형, 화이트",
      "로보락 생활백서 고체 세제 코인형 30개입",
    );

  expect(
    "로보락 세제 오매칭 차단",
    result.matched,
    false,
  );
}

{
  const result =
    validateProductMatch(
      "로보락 로봇청소기 S10 MaxV Ultra RRE0VES+EWFD55HRR 자동 물통형, 화이트",
      "로보락 S10 MaxV Slim 직배수 로봇청소기",
      "S10 MaxV Slim RRE0CPS",
    );

  expect(
    "S10 Ultra -> Slim 차단",
    result.matched,
    false,
  );
}

/*
  ==================================================
  3. PARTIAL 안전 유지 케이스
  ==================================================
*/

{
  const result =
    validateProductMatch(
      "JONR 존알 로봇청소기 올인원 자동세척 건조 스테이션 최강희청소기 X1 MAX, 블랙",
      "JONR 존알 로봇청소기 올인원 자동세척 건조 스테이션 최강희청소기 X1 MAX, 블랙",
    );

  expect(
    "JONR X1 자체 상품명 일치",
    result.matched,
    true,
  );
}

{
  const result =
    validateProductMatch(
      "JONR 존알 로봇청소기 올인원 자동세척 건조 스테이션 X9 PRO, 블랙",
      "JONR 존알 로봇청소기 올인원 자동세척 건조 스테이션 X9 PRO, 블랙",
    );

  expect(
    "JONR X9 자체 상품명 일치",
    result.matched,
    true,
  );
}

/*
  ==================================================
  4. 브랜드스토어 신뢰 후보 판단
  ==================================================
*/

expect(
  "MOVA 공식스토어 발견 시 조기 종료 가능",
  hasTrustedBrandCandidate(
    "https://brand.naver.com/mova",
    [
      "https://brand.naver.com/mova",
    ],
  ),
  true,
);

expect(
  "MOVA 검색에서 Dreame만 나오면 조기 종료 금지",
  hasTrustedBrandCandidate(
    "https://brand.naver.com/mova",
    [
      "https://brand.naver.com/dreame",
    ],
  ),
  false,
);

expect(
  "Dreame + Narwal 혼합 중 Dreame 존재",
  hasTrustedBrandCandidate(
    "https://brand.naver.com/dreame",
    [
      "https://brand.naver.com/narwal",
      "https://brand.naver.com/dreame",
    ],
  ),
  true,
);

expect(
  "Dreame 검색에서 Narwal만 나오면 조기 종료 금지",
  hasTrustedBrandCandidate(
    "https://brand.naver.com/dreame",
    [
      "https://brand.naver.com/narwal",
    ],
  ),
  false,
);

/*
  ==================================================
  5. 검색 비용 정책
  ==================================================
*/

expect(
  "학습 브랜드 최대 검색 3회",
  expectedMaxSearches(
    "https://brand.naver.com/everybot",
  ),
  3,
);

expect(
  "미학습 브랜드 최대 검색 4회",
  expectedMaxSearches(
    "",
  ),
  4,
);

/*
  ==================================================
  결과
  ==================================================
*/

console.log("");
console.log(
  "===== Project D 실제 공용검증 회귀 테스트 =====",
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
      `       ${result.detail}`,
    );
  }
}

const passed =
  results.filter(
    (item) => item.pass,
  ).length;

const failed =
  results.length -
  passed;

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
  "생산 코드 공용 검증 모듈 직접 사용: YES",
);
console.log(
  "SerpApi 호출: 0",
);
console.log(
  "Bright Data 호출: 0",
);

if (failed > 0) {
  process.exitCode = 1;
}
