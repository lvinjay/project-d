import assert from "node:assert/strict";
import fs from "node:fs";

const source =
  fs.readFileSync(
    "app/advisor/results/ResultsClient.tsx",
    "utf8",
  ).replace(/\r\n/g, "\n");

const start =
  source.indexOf(
    "function formatPrice(",
  );

const end =
  source.indexOf(
    "\n\nfunction getRankCardCautions(",
    start,
  );

assert.ok(
  start >= 0 && end > start,
  "formatPrice block must exist before getRankCardCautions",
);

const block =
  source.slice(
    start,
    end,
  );

let checks = 0;

function check(actual, expected, label) {
  assert.equal(actual, expected, label);
  checks += 1;
}

check(
  block.includes('toLocaleString("ko-KR")'),
  true,
  "exact won locale formatter exists",
);

check(
  block.includes("원"),
  true,
  "won text exists in formatter",
);

check(
  block.includes("toFixed(1)"),
  false,
  "approximate one-decimal manwon formatter removed",
);

check(
  block.includes("const manwon"),
  false,
  "legacy manwon conversion removed",
);

check(
  source.includes("function getRankCardCautions("),
  true,
  "following result-card caution logic preserved",
);

check(
  source.includes("budgetAlternatives"),
  true,
  "budget alternatives flow preserved",
);

console.log(
  "Exact price display regression PASS: " +
    checks +
    " assertions; paid calls 0; DB writes 0.",
);
