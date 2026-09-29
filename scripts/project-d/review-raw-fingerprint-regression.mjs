import assert from "node:assert/strict";
import fs from "node:fs";

const {
  resolveReviewRawInputFingerprint,
} = await import(
  "../../lib/project-d-review-raw-fingerprint.ts"
);

let count = 0;

function check(
  value,
  message,
) {
  assert.ok(
    value,
    message,
  );

  count++;
}

const legacy =
  "a".repeat(64);

const v6 =
  "b".repeat(64);

const invalid =
  "c".repeat(64);

const v6Result =
  resolveReviewRawInputFingerprint(
    v6,
    legacy,
    v6,
  );

check(
  v6Result.accepted === true,
  "V6 fingerprint must be accepted"
);

check(
  v6Result.inputFingerprint ===
    v6,
  "V6 fingerprint must be preserved"
);

check(
  v6Result.matchedPipeline ===
    "v6",
  "V6 pipeline identity must be explicit"
);

const legacyResult =
  resolveReviewRawInputFingerprint(
    legacy,
    legacy,
    v6,
  );

check(
  legacyResult.accepted === true,
  "Legacy fingerprint must remain accepted"
);

check(
  legacyResult.inputFingerprint ===
    legacy,
  "Legacy fingerprint must be preserved"
);

check(
  legacyResult.matchedPipeline ===
    "legacy",
  "Legacy pipeline identity must be explicit"
);

const invalidResult =
  resolveReviewRawInputFingerprint(
    invalid,
    legacy,
    v6,
  );

check(
  invalidResult.accepted === false,
  "Unknown fingerprint must fail closed"
);

check(
  invalidResult.inputFingerprint ===
    legacy,
  "Unknown fingerprint must retain legacy diagnostic fallback"
);

check(
  invalidResult.matchedPipeline ===
    "none",
  "Unknown fingerprint must not claim a pipeline"
);

const route =
  fs.readFileSync(
    "app/api/save-review-raw-batch/route.ts",
    "utf8"
  );

check(
  route.includes(
    "resolveReviewRawInputFingerprint("
  ),
  "Raw save route must use the shared fingerprint resolver"
);

check(
  route.includes(
    "!fingerprintResolution"
  ) &&
    route.includes(
      ".accepted"
    ),
  "Raw save route must reject unsupported fingerprints"
);

console.log(
  "REVIEW RAW FINGERPRINT REGRESSION: PASS: " +
    count +
    " assertions; OpenAI calls 0; DB writes 0."
);
