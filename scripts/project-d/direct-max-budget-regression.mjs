import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) =>
  fs.readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n");

const questions =
  read(
    "app/advisor/questions/QuestionsClient.tsx",
  );

const advisor =
  read(
    "app/api/advisor-recommendations/route.ts",
  );

const personal =
  read(
    "app/api/analyze-personal-preferences/route.ts",
  );

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
  questions.includes(
    'const [directBudgetWon, setDirectBudgetWon] = useState("");',
  ),
  true,
  "direct maximum budget state exists",
);

check(
  questions.includes(
    "function updateDirectBudgetWon(",
  ),
  true,
  "direct maximum budget handler exists",
);

check(
  questions.includes(
    '.replace(/\\D/g, "")',
  ),
  true,
  "direct input is normalized to digits",
);

check(
  questions.includes(
    '`up_to_${won}`',
  ),
  true,
  "direct budget uses existing up_to contract",
);

check(
  questions.includes(
    "storedDirectBudgetMatch",
  ),
  true,
  "direct budget is restored after re-entry",
);

check(
  questions.includes(
    "최대 예산 직접 입력",
  ),
  true,
  "customer direct-budget UI exists",
);

check(
  questions.includes(
    'aria-label="최대 예산 직접 입력"',
  ),
  true,
  "direct-budget input has accessible label",
);

check(
  advisor.includes(
    'choice.match(/^up_to_(\\d+)$/)',
  ),
  true,
  "advisor recommendation API supports exact max budget",
);

check(
  personal.includes(
    'value.startsWith("up_to_")',
  ) &&
    personal.includes(
      "max: numbers[0]",
    ),
  true,
  "personal-preference API supports exact max budget",
);

check(
  questions.includes(
    "recommendationPoolIds",
  ),
  true,
  "Recommendation Pool customer wiring remains",
);

check(
  questions.includes("무선청소기") ||
    questions.includes("280000"),
  false,
  "no category-specific or test-budget one-off source logic",
);

console.log(
  `Direct maximum budget regression PASS: ${checks} assertions; paid calls 0; DB writes 0.`,
);
