const fs = require("fs");

const src = "./trash/fresh-manufacturer-enriched-full.json";
const out = "./trash/ts450-node-debug.txt";

try {
  const raw = fs.readFileSync(src, "utf8");
  const data = JSON.parse(raw);

  const results = [];

  function walk(value, path = "$") {
    if (value === null || value === undefined) return;

    if (typeof value === "object") {
      let text = "";
      try {
        text = JSON.stringify(value);
      } catch {}

      if (/TS450/i.test(text)) {
        results.push({
          path,
          value
        });
      }

      if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, `${path}[${i}]`));
      } else {
        for (const [key, item] of Object.entries(value)) {
          walk(item, `${path}.${key}`);
        }
      }
    }
  }

  walk(data);

  const unique = [];
  const seen = new Set();

  for (const item of results) {
    const text = JSON.stringify(item.value);
    if (seen.has(text)) continue;
    seen.add(text);

    unique.push({
      path: item.path,
      value: item.value
    });
  }

  const report = [
    "===== TOP LEVEL =====",
    `success: ${data.success}`,
    `marketCandidateCount: ${data.marketCandidateCount}`,
    `resolverAttempts: ${data.resolverAttempts}`,
    `brightDataCalls: ${data.brightDataCalls}`,
    `finalCandidateCount: ${data.finalCandidateCount}`,
    `failureCount: ${data.failureCount}`,
    "",
    "===== TS450 OBJECTS =====",
    ...unique.map((item, i) =>
      [
        "",
        `--- MATCH ${i + 1} ---`,
        `PATH: ${item.path}`,
        JSON.stringify(item.value, null, 2)
      ].join("\n")
    )
  ].join("\n");

  fs.writeFileSync(out, report, "utf8");

  console.log("");
  console.log("JSON PARSE: PASS");
  console.log(`TS450 MATCHES: ${unique.length}`);
  console.log(`저장 파일: ${out}`);
} catch (err) {
  console.error("");
  console.error("JSON PARSE: FAIL");
  console.error(err.message);
  process.exit(1);
}