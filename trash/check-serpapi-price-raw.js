const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");

const line = env
  .split(/\r?\n/)
  .find((row) =>
    row.trim().startsWith("SERPAPI_API_KEY=")
  );

if (!line) {
  throw new Error(
    "SERPAPI_API_KEY를 찾지 못했습니다."
  );
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
    "https://serpapi.com/search?" +
      params.toString()
  );

  const data = await response.json();

  const products =
    Array.isArray(data.shopping_results)
      ? data.shopping_results
      : [];

  const robrock = products.filter(
    (item) =>
      String(item.title ?? "")
        .toLowerCase()
        .includes("s10")
  );

  fs.writeFileSync(
    "./trash/serpapi-price-raw-check.json",
    JSON.stringify(
      robrock,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "로보락 가격 원본 확인 완료"
  );
  console.log(
    "저장: ./trash/serpapi-price-raw-check.json"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
