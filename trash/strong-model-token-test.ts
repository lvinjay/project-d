import {
  getStrongSearchModelTokens,
} from "../lib/buildResolverSearchPlan";

const cases = [
  {
    name: "TS450",
    input: [
      "TS450",
      "쓰리스핀",
      "26년",
      "NEW",
    ],
    expected: [
      "TS450",
    ],
  },
  {
    name: "X60",
    input: [
      "X60",
      "Ultra",
      "X60ULTRA",
    ],
    expected: [
      "X60",
      "Ultra",
    ],
  },
  {
    name: "P70",
    input: [
      "P70",
      "Pro",
      "Ultra",
      "RLP54HE",
    ],
    expected: [
      "P70",
      "Pro",
    ],
  },
  {
    name: "S10",
    input: [
      "S10",
      "MaxV",
      "Ultra",
    ],
    expected: [
      "S10",
      "MaxV",
    ],
  },
];

let failed = 0;

console.log("");
console.log(
  "===== 강한 모델토큰 무료 테스트 =====",
);
console.log("");

for (const test of cases) {
  const actual =
    getStrongSearchModelTokens(
      test.input,
    );

  const pass =
    JSON.stringify(actual) ===
    JSON.stringify(test.expected);

  if (!pass) {
    failed += 1;
  }

  console.log(
    pass
      ? "[PASS]"
      : "[FAIL]",
    test.name,
    "=>",
    actual.join(" "),
  );

  if (!pass) {
    console.log(
      "  expected:",
      test.expected.join(" "),
    );
  }
}

console.log("");
console.log(
  "FAIL:",
  failed,
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
