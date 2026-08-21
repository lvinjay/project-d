const urls = [
  "https://smartstore.naver.com/main/products/10775617216",
  "https://smartstore.naver.com/main/products/11662274981",
  "https://smartstore.naver.com/main/products/13280227814",
];

async function test(url) {
  console.log("");
  console.log("====================================");
  console.log("INPUT:", url);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml",
        "Accept-Language":
          "ko-KR,ko;q=0.9,en;q=0.8",
      },
    });

    console.log(
      "STATUS:",
      response.status
    );

    console.log(
      "FINAL URL:",
      response.url
    );

    const html =
      await response.text();

    console.log(
      "HTML LENGTH:",
      html.length
    );

    const brandUrls =
      [
        ...html.matchAll(
          /https?:\/\/brand\.naver\.com\/[^"'<>\\\s]+/g
        ),
      ]
        .map((match) =>
          match[0]
            .replace(/&amp;/g, "&")
            .replace(/\\u002F/g, "/")
        )
        .slice(0, 10);

    console.log(
      "BRAND URLS:",
      brandUrls
    );

    const smartstoreUrls =
      [
        ...html.matchAll(
          /https?:\/\/smartstore\.naver\.com\/[^"'<>\\\s]+/g
        ),
      ]
        .map((match) =>
          match[0]
            .replace(/&amp;/g, "&")
            .replace(/\\u002F/g, "/")
        )
        .slice(0, 10);

    console.log(
      "SMARTSTORE URLS:",
      smartstoreUrls
    );
  } catch (error) {
    console.error(
      "ERROR:",
      error
    );
  }
}

async function main() {
  for (const url of urls) {
    await test(url);
  }
}

main();
