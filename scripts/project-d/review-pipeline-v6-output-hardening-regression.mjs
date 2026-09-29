import assert from "node:assert/strict";
import fs from "node:fs";

const engine = fs.readFileSync("lib/project-d-review-v6-combined-experimental.ts", "utf8").replace(/\r\n/g, "\n");

let count = 0;
function check(value, message) { assert.ok(value, message); count++; }

check(engine.includes("stage0-v6-combined-dynamic-c1c5-v4-production"), "v4 pipeline missing");
check(engine.includes("stage0-v6-combined-compatibility-mapping-v2"), "quality v2 missing");
check(engine.includes("stage0-server-derived-plus-c1c5-events-v2"), "decision v2 missing");
check(engine.includes("invalidRejectedCandidateCount: 0"), "legacy invalid candidate accounting changed");
check(engine.includes("invalidSegmentReferenceCount: 0"), "legacy invalid segment accounting changed");
check(engine.includes("stage0InvalidAnchorDiscardedCount"), "Stage0 audit missing");
check(engine.includes("invalidCriterionSlotDiscardedCount"), "slot audit missing");
check(engine.includes("duplicateCriterionSlotDiscardedCount"), "duplicate audit missing");
check(engine.includes("missingCriterionSlotSynthesizedCount"), "missing slot audit missing");
check(engine.includes("invalidCriterionEventDiscardedCount"), "event audit missing");
check(engine.includes("invalidCriterionSegmentDiscardedCount"), "segment audit missing");
check(engine.includes("neutralOverlapDiscardedCount"), "neutral audit missing");
check(!engine.includes("exactly five criterion slots required."), "slot count still hard fails");
check(!engine.includes("invalid or duplicate criterion slot."), "duplicate still hard fails");
check(!engine.includes("missing ${alias}."), "missing alias still hard fails");
check(!engine.includes("invalid criterion event."), "invalid event still hard fails");
check(!engine.includes("invalid cross-review or unknown criterion segment"), "bad segment still hard fails");
check(!engine.includes("neutral event overlaps directional evidence"), "neutral overlap still hard fails");
check(engine.includes("duplicateAliases.has(alias)"), "duplicate alias fail-closed missing");
check(engine.includes("const safeNeutral ="), "safe neutral sanitizer missing");
check(engine.includes("nonDirectCriterionEventsDiscarded"), "non-direct audit missing");

console.log("V6 final hardening regression PASS: " + count + " assertions; paid calls 0; DB writes 0.");
