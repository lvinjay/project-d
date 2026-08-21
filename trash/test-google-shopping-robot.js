const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");

const line = env
  .split(/\r?\n/)
  .find((row) =>
    row.trim().startsWith("SERPAPI_API_KEY=")
  );

if (!line) {
  throw new Error("SERPAPI_API_KEY를 찾지 못했습니다.");
}

const apiKey = line
  .slice(line.indexOf("=") + 1)
  .trim()
  .replace(/^["']|["']$/g, "");

async function main() {
  const params = new URLSearchParams({
    engine: "google_shopping_light",
    q: "로봇청소기",
    gl: "kr",
    hl: "ko",
    api_key: apiKey,
  });

  const response = await fetch(
    "https://serpapi.com/search.json?" +
      params.toString()
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error ||
      "Google Shopping 검색에 실패했습니다."
    );
  }

  const results =
    Array.isArray(data.shopping_results)
      ? data.shopping_results
      : [];

  const output = results
    .slice(0, 30)
    .map((item, index) => ({
      position:
        item.position ?? index + 1,

      title:
        item.title ?? "",

      source:
        item.source ?? "",

      price:
        item.price ?? "",

      extractedPrice:
        item.extracted_price ?? null,

      oldPrice:
        item.old_price ?? "",

      extractedOldPrice:
        item.extracted_old_price ?? null,

      rating:
        item.rating ?? null,

      reviews:
        item.reviews ?? null,

      productLink:
        item.product_link ?? "",

      thumbnail:
        item.thumbnail ?? "",
    }));

  fs.writeFileSync(
    "./trash/google-shopping-robot-test.json",
    JSON.stringify(
      {
        count: output.length,
        candidates: output,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "Google Shopping 후보:",
    output.length,
    "개"
  );

  console.log(
    "저장: ./trash/google-shopping-robot-test.json"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
