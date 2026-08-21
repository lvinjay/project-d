const ids = [
  "59760912197",
  "59215055197",
  "59204433943"
];

async function main() {
  for (const id of ids) {
    const url =
      "https://search.shopping.naver.com/catalog/" + id;

    console.log("");
    console.log("================================");
    console.log("CATALOG:", url);

    try {
      const response =
        await fetch(url, {
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
            "Accept-Language":
              "ko-KR,ko;q=0.9"
          }
        });

      const html =
        await response.text();

      console.log(
        "STATUS:",
        response.status
      );

      console.log(
        "FINAL URL:",
        response.url
      );

      console.log(
        "HTML LENGTH:",
        html.length
      );

      const brandMatches =
        html.match(
          /https?:\\?\/\\?\/brand\.naver\.com\\?\/[a-zA-Z0-9_-]+\\?\/products\\?\/\d+/g
        ) || [];

      const brandUrls =
        [...new Set(
          brandMatches.map(
            (value) =>
              value.replace(/\\\//g, "/")
          )
        )];

      console.log(
        "BRAND PRODUCT URLS:",
        brandUrls.slice(0, 10)
      );
    } catch (error) {
      console.log(
        "ERROR:",
        error instanceof Error
          ? error.message
          : error
      );
    }
  }
}

main();
