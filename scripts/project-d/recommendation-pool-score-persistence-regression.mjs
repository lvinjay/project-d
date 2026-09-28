import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const historical =
  "supabase/migrations/0001_project_d_h07_atomic_persistence.sql";
const migration =
  "supabase/migrations/0002_project_d_recommendation_pool_score_persistence.sql";

const raw =
  fs.readFileSync(historical);

const historicalSha =
  crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex");

const sql =
  fs.readFileSync(migration, "utf8")
    .replace(/\r\n/g, "\n");

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
  historicalSha,
  "3686e589bd8f952da52f4a2278ab0d8fc7fac1e218a65baeb3e86ffe9d9434f7",
  "historical H07 migration remains unchanged",
);

check(
  sql.includes(
    "project_d_commit_product_scores_v1",
  ),
  true,
  "score atomic RPC replacement exists",
);

check(
  sql.includes(
    "v_requested_count < 2",
  ),
  true,
  "existing lower bound 2 is preserved",
);

check(
  sql.includes(
    "v_requested_count > 15",
  ),
  true,
  "Recommendation Pool upper bound 15 is enabled",
);

check(
  sql.includes(
    "v_requested_count > 5",
  ),
  false,
  "old upper bound 5 is removed from replacement function",
);

check(
  sql.includes(
    "PROJECT_D_SCORE_PRODUCT_COUNT_INVALID",
  ),
  true,
  "existing count error contract is preserved",
);

check(
  sql.includes(
    "for update",
  ),
  true,
  "row locking remains in atomic persistence",
);

check(
  sql.includes(
    "criterion_scores",
  ),
  true,
  "criterion score write remains",
);

check(
  sql.includes(
    "score_generation_fingerprint",
  ),
  true,
  "profile fingerprint write remains",
);

check(
  sql.includes("무선청소기") ||
    sql.includes("280000"),
  false,
  "no category-specific one-off rule",
);

console.log(
  `Recommendation Pool score persistence regression PASS: ${checks} assertions; paid calls 0; DB writes 0.`,
);
