const fs = require("fs");

const envText = fs.readFileSync(".env.local", "utf8");

function getEnv(name) {
  const line = envText
    .split(/\r?\n/)
    .find((row) =>
      row.trim().startsWith(name + "=")
    );

  if (!line) {
    throw new Error(
      name + " 환경변수를 찾지 못했습니다."
    );
  }

  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

async function main() {
  const apiKey =
    getEnv("SERPAPI_API_KEY");

  const keyword =
    "캠핑용 에어컨";

  const params =
    new URLSearchParams({
      engine: "naver",
      query: keyword,
      where: "nexearch",
      api_key: apiKey,
      output: "json",
    });

  const response = await fetch(
    "https://serpapi.com/search?" +
      params.toString()
  );

  const data =
    await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error ||
        "SerpApi 검색에 실패했습니다."
    );
  }

  const raw =
    Array.isArray(data.shopping_results)
      ? data.shopping_results
      : [];

  const products =
    raw.slice(0, 20).map(
      (item, index) => ({
        position:
          item.position ??
          index + 1,

        title:
          item.title ?? "",

        price:
          item.price ?? "",

        rating:
          item.rating ?? null,

        reviews:
          item.reviews ?? null,

        stores:
          item.stores ?? null,

        link:
          item.link ?? "",

        thumbnail:
          item.thumbnail ?? "",

        additional:
          item.additional ?? [],
      })
    );

  const result = {
    keyword,
    searchStatus:
      data.search_metadata?.status ??
      null,

    shoppingResultCount:
      raw.length,

    candidateCount:
      products.length,

    candidates:
      products,
  };

  fs.writeFileSync(
    "./trash/serpapi-camping-aircon-test.json",
    JSON.stringify(
      result,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "검색 성공"
  );

  console.log(
    "쇼핑 결과:",
    raw.length,
    "개"
  );

  console.log(
    "저장:",
    "./trash/serpapi-camping-aircon-test.json"
  );
}

main().catch((error) => {
  console.error(
    "테스트 실패:",
    error
  );

  process.exit(1);
});
