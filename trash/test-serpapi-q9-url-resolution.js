const fs = require("fs");

const env = fs.readFileSync(
  ".env.local",
  "utf8"
);

const line = env
  .split(/\r?\n/)
  .find((row) =>
    row
      .trim()
      .startsWith(
        "SERPAPI_API_KEY="
      )
  );

if (!line) {
  throw new Error(
    "SERPAPI_API_KEY를 찾지 못했습니다."
  );
}

const apiKey = line
  .slice(
    line.indexOf("=") + 1
  )
  .trim()
  .replace(
    /^["']|["']$/g,
    ""
  );

async function main() {
  const params =
    new URLSearchParams({
      engine: "naver",
      query:
        "10775617216 에브리봇 Q9",
      where:
        "nexearch",
      output:
        "json",
      api_key:
        apiKey,
    });

  const response =
    await fetch(
      "https://serpapi.com/search?" +
        params.toString()
    );

  const data =
    await response.json();

  fs.writeFileSync(
    "./trash/serpapi-q9-url-resolution.json",
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );

  const text =
    JSON.stringify(data);

  const urls =
    [
      ...text.matchAll(
        /https?:\\?\/\\?\/(?:brand|smartstore)\.naver\.com[^"\\\s]*/g
      ),
    ].map((match) =>
      match[0]
        .replace(/\\\//g, "/")
        .replace(/\\u0026/g, "&")
    );

  console.log(
    "발견된 네이버 상품/스토어 URL:"
  );

  console.log(
    [...new Set(urls)]
  );

  console.log("");
  console.log(
    "저장 완료: ./trash/serpapi-q9-url-resolution.json"
  );
}

main().catch(console.error);
