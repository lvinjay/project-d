import assert from "node:assert/strict";
import fs from "node:fs";

const files = {
  advisor:
    "app/advisor/AdvisorClient.tsx",
  questions:
    "app/advisor/questions/QuestionsClient.tsx",
  results:
    "app/advisor/results/ResultsClient.tsx",
};

const read = (file) =>
  fs.readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n");

const advisor =
  read(files.advisor);
const questions =
  read(files.questions);
const results =
  read(files.results);

let checks = 0;

function check(
  actual,
  expected,
  label,
) {
  assert.deepEqual(
    actual,
    expected,
    label,
  );
  checks += 1;
}

check(
  advisor.includes(
    "recommendationPoolIds",
  ),
  true,
  "Advisor imports Recommendation Pool IDs",
);

check(
  /assertPublicCategoryReadiness[\s\S]{0,300}recommendationPoolIds\s*\(\s*selected\.manifest\s*\)/.test(
    advisor,
  ),
  true,
  "Advisor public readiness checks Recommendation Pool",
);

check(
  /\bselectedFiveIds\s*\(/.test(
    advisor,
  ),
  false,
  "Advisor does not score-check legacy five",
);

check(
  questions.includes(
    "recommendationPoolIds",
  ),
  true,
  "Questions uses Recommendation Pool",
);

check(
  /\bselectedFiveIds\s*\(/.test(
    questions,
  ),
  false,
  "Questions has no legacy selected-five product scope",
);

check(
  results.includes(
    "recommendationPoolIds",
  ),
  true,
  "Results uses Recommendation Pool",
);

check(
  results.includes(
    "assertSameRecommendationPoolIds",
  ),
  true,
  "Results preserves Recommendation Pool identity",
);

check(
  /\bselectedFiveIds\s*\(/.test(
    results,
  ),
  false,
  "Results has no legacy selected-five product scope",
);

check(
  /\bassertSameSelectedIds\s*\(/.test(
    results,
  ),
  false,
  "Results does not compare pool IDs with legacy exact-five assertion",
);

check(
  advisor.includes("무선청소기") ||
    questions.includes("무선청소기") ||
    results.includes("무선청소기") ||
    advisor.includes("280000") ||
    questions.includes("280000") ||
    results.includes("280000"),
  false,
  "No category-specific one-off customer wiring",
);

console.log(
  `Recommendation Pool customer flow regression PASS: ${checks} assertions; paid calls 0; DB writes 0.`,
);
