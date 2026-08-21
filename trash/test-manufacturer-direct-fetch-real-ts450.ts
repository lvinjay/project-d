import {
  writeFile,
} from "node:fs/promises";

async function main() {
  const url =
    "https://everybotmall.com/product/%241/325/";

  console.log("");
  console.log(
    "===== TS450 실제 공식몰 Direct Fetch =====",
  );

  console.log(
    "URL:",
    url,
  );

  const startedAt =
    Date.now();

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
      "448,000",
      html.includes(
        "448,000",
      ) ||
      html.includes(
        "448000",
      ),
    ],

    [
      "419,000",
      html.includes(
        "419,000",
      ) ||
      html.includes(
        "419000",
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
  ] as const;

  console.log("");
  console.log(
    "===== 상품정보 흔적 =====",
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

  await writeFile(
    "./trash/ts450-real-direct-fetch.html",
    html,
    "utf8",
  );

  const patterns = [
    "TS450",
    "419,000",
    "448,000",
    "application/ld+json",
    "og:title",
    "og:image",
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
          index - 700,
        ),
        Math.min(
          html.length,
          index + 1800,
        ),
      ),
    );
  }

  await writeFile(
    "./trash/ts450-real-direct-fetch-snippets.txt",
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
    "trash\\ts450-real-direct-fetch.html",
  );

  console.log(
    "trash\\ts450-real-direct-fetch-snippets.txt",
  );

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
