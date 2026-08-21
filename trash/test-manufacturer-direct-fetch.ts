import {
  writeFile,
} from "node:fs/promises";

async function main() {
  const url =
    "https://www.everybotmall.com/product/ts450";

  console.log("");
  console.log(
    "===== Manufacturer Direct Fetch 무료 테스트 =====",
  );

  console.log(
    "URL:",
    url,
  );

  const startedAt =
    Date.now();

  try {
    const response =
      await fetch(
        url,
        {
          redirect:
            "follow",

          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

            Accept:
              "text/html,application/xhtml+xml",
          },
        },
      );

    console.log(
      "HTTP:",
      response.status,
    );

    console.log(
      "최종 URL:",
      response.url,
    );

    const html =
      await response.text();

    console.log(
      "HTML 길이:",
      html.length,
    );

    await writeFile(
      "./trash/ts450-direct-fetch.html",
      html,
      "utf8",
    );

    const lower =
      html.toLowerCase();

    const checks = [
      [
        "TS450",
        lower.includes(
          "ts450",
        ),
      ],

      [
        "에브리봇",
        html.includes(
          "에브리봇",
        ),
      ],

      [
        "application/ld+json",
        lower.includes(
          "application/ld+json",
        ),
      ],

      [
        "og:title",
        lower.includes(
          "og:title",
        ),
      ],

      [
        "og:image",
        lower.includes(
          "og:image",
        ),
      ],

      [
        "product:price",
        lower.includes(
          "product:price",
        ),
      ],
    ] as const;

    console.log("");
    console.log(
      "===== HTML 상품정보 흔적 =====",
    );

    for (
      const [
        label,
        found,
      ] of checks
    ) {
      console.log(
        `${label}:`,
        found
          ? "YES"
          : "NO",
      );
    }

    /*
      실제 값 자체를 대량 출력하지 않고
      상품 관련 키워드 주변 일부만 별도 저장한다.
    */
    const patterns = [
      "TS450",
      "application/ld+json",
      "og:title",
      "og:image",
      "price",
    ];

    const snippets:
      string[] = [];

    for (
      const pattern of patterns
    ) {
      const index =
        lower.indexOf(
          pattern.toLowerCase(),
        );

      if (index < 0) {
        continue;
      }

      snippets.push(
        `===== ${pattern} =====\n` +
        html.slice(
          Math.max(
            0,
            index - 500,
          ),
          Math.min(
            html.length,
            index + 1500,
          ),
        ),
      );
    }

    await writeFile(
      "./trash/ts450-direct-fetch-snippets.txt",
      snippets.join(
        "\n\n",
      ),
      "utf8",
    );

    console.log("");
    console.log(
      "저장 파일:",
    );

    console.log(
      "trash\\ts450-direct-fetch.html",
    );

    console.log(
      "trash\\ts450-direct-fetch-snippets.txt",
    );
  } catch (error) {
    console.log(
      "FETCH ERROR:",
      error instanceof Error
        ? error.message
        : String(error),
    );
  }

  console.log("");
  console.log(
    "소요 시간:",
    (
      (Date.now() -
        startedAt) /
      1000
    ).toFixed(1),
    "초",
  );

  console.log("");
  console.log(
    "SerpApi 호출: 0",
  );

  console.log(
    "Bright Data 호출: 0",
  );

  console.log(
    "유료 API 호출: 0",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
