const fs = require("fs");

async function main() {
  const query = "로봇청소기";

  const url =
    "https://search.shopping.naver.com/search/all?query=" +
    encodeURIComponent(query);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
      "Accept-Language":
        "ko-KR,ko;q=0.9,en;q=0.8",
      "Accept":
        "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  const html = await response.text();

  const checks = {
    status: response.status,
    finalUrl: response.url,
    length: html.length,

    hasRobotVacuum:
      html.includes("로봇청소기"),

    hasShoppingProduct:
      html.includes("product") ||
      html.includes("상품"),

    hasInitialState:
      html.includes("__NEXT_DATA__") ||
      html.includes("__APOLLO_STATE__") ||
      html.includes("__INITIAL_STATE__"),

    hasCaptcha:
      /captcha|캡차|비정상적인\s*접근/i.test(html),
  };

  fs.writeFileSync(
    "./trash/naver-shopping-direct-check.json",
    JSON.stringify(checks, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    "./trash/naver-shopping-direct-page.html",
    html,
    "utf8"
  );

  console.log("");
  console.log(checks);
  console.log("");
  console.log(
    "저장: ./trash/naver-shopping-direct-check.json"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
