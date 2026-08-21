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
    engine: "naver",
    query: "로봇청소기",
    where: "nexearch",
    api_key: apiKey,
    output: "json",
  });

  const response = await fetch(
    "https://serpapi.com/search?" + params.toString()
  );

  const data = await response.json();

  const result = {
    shoppingResultsCount:
      Array.isArray(data.shopping_results)
        ? data.shopping_results.length
        : 0,

    shoppingResults:
      data.shopping_results ?? null,

    shoppingResultsSeeMoreLink:
      data.shopping_results?.see_more_link ?? null,

    keys:
      Object.keys(data),
  };

  fs.writeFileSync(
    "./trash/naver-shopping-structure.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );

  console.log(
    "완료: ./trash/naver-shopping-structure.json"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
