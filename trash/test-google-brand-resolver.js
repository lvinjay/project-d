const products = [
  "모바 P70 Pro Ultra RLP54HE",
  "드리미 X60 Ultra X60ULTRA",
  "드리미 X60 Master"
];

async function main() {
  const apiKey =
    process.env.SERPAPI_API_KEY;

  for (const productName of products) {
    console.log("");
    console.log("================================");
    console.log("검색:", productName);

    const params =
      new URLSearchParams({
        engine: "google",
        q:
          `site:brand.naver.com ${productName}`,
        google_domain:
          "google.co.kr",
        hl: "ko",
        gl: "kr",
        api_key:
          apiKey
      });

    const response =
      await fetch(
        "https://serpapi.com/search?" +
          params.toString()
      );

    const data =
      await response.json();

    if (!response.ok || data.error) {
      console.log(
        "ERROR:",
        data.error ||
          response.status
      );
      continue;
    }

    const organic =
      Array.isArray(
        data.organic_results
      )
        ? data.organic_results
        : [];

    const results =
      organic
        .map((item) => ({
          title:
            item.title || "",
          link:
            item.link || ""
        }))
        .filter((item) =>
          item.link.includes(
            "brand.naver.com"
          )
        );

    console.log(
      "공식 브랜드 검색결과:",
      results.slice(0, 10)
    );

    const productUrls =
      results
        .map((item) =>
          item.link
        )
        .filter((link) =>
          /brand\.naver\.com\/[^/]+\/products\/\d+/i.test(
            link
          )
        );

    console.log(
      "공식 상품 URL:",
      [
        ...new Set(
          productUrls
        )
      ]
    );
  }
}

main().catch(console.error);
