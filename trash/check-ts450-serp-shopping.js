const fs = require("fs");

function loadEnv() {
  const text = fs.readFileSync(".env.local", "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const index = line.indexOf("=");
    if (index <= 0) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnv();

  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY 없음");
  }

  const query = "에브리봇 TS450";

  const params = new URLSearchParams({
    engine: "naver",
    query,
    where: "nexearch",
    output: "json",
    api_key: apiKey,
  });

  const response = await fetch(
    "https://serpapi.com/search?" + params.toString()
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  const results = Array.isArray(data.shopping_results)
    ? data.shopping_results
    : [];

  const simplified = results.map((x, i) => ({
    index: i + 1,
    title: x.title ?? null,
    stores: x.stores ?? null,
    price: x.price ?? null,
    reviews: x.reviews ?? null,
    rating: x.rating ?? null,
    link: x.link ?? null,
  }));

  const out = {
    query,
    count: simplified.length,
    results: simplified,
  };

  fs.writeFileSync(
    "./trash/ts450-serp-shopping-results.json",
    JSON.stringify(out, null, 2),
    "utf8"
  );

  console.log("");
  console.log("===== TS450 SERP RESULT =====");
  console.log("검색어:", query);
  console.log("결과 수:", simplified.length);
  console.log("");

  simplified.forEach((x) => {
    console.log(
      `[${x.index}]`,
      x.title,
      "| 판매처:",
      x.stores,
      "| 리뷰:",
      x.reviews
    );
  });

  console.log("");
  console.log(
    "저장 파일: ./trash/ts450-serp-shopping-results.json"
  );
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});