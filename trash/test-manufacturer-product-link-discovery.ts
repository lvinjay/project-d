import {
  writeFile,
} from "node:fs/promises";

function decodeHtml(
  value: string,
) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchHtml(
  url: string,
) {
  return fetch(
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
}

async function main() {
  const officialSite =
    "https://everybotmall.com/";

  const model =
    "TS450";

  console.log("");
  console.log(
    "===== 공식몰 상품링크 자동 발견 테스트 =====",
  );

  /*
    1. 공식몰 메인 무료 fetch
  */
  const homeResponse =
    await fetchHtml(
      officialSite,
    );

  console.log(
    "메인 HTTP:",
    homeResponse.status,
  );

  const homeHtml =
    await homeResponse.text();

  console.log(
    "메인 HTML 길이:",
    homeHtml.length,
  );

  console.log(
    "메인 TS450:",
    homeHtml
      .toLowerCase()
      .includes(
        model.toLowerCase(),
      )
      ? "YES"
      : "NO",
  );

  /*
    모든 링크를 수집한다.
  */
  const links:
    {
      url: string;
      context: string;
    }[] = [];

  const anchorRegex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match:
    RegExpExecArray | null;

  while (
    (
      match =
        anchorRegex.exec(
          homeHtml,
        )
    ) !== null
  ) {
    const href =
      decodeHtml(
        match[1] ?? "",
      ).trim();

    const innerHtml =
      String(
        match[2] ?? "",
      );

    const context =
      innerHtml
        .replace(
          /<[^>]+>/g,
          " ",
        )
        .replace(
          /\s+/g,
          " ",
        )
        .trim();

    if (!href) {
      continue;
    }

    try {
      links.push({
        url:
          new URL(
            href,
            officialSite,
          ).toString(),

        context,
      });
    } catch {
      // 무시
    }
  }

  /*
    TS450 텍스트가 anchor 내부에 직접 없는 쇼핑몰도 있으므로
    URL / 주변 anchor text 양쪽을 먼저 검사한다.
  */
  let candidates =
    links.filter(
      (item) =>
        item.url
          .toLowerCase()
          .includes(
            "ts450",
          ) ||
        item.context
          .toLowerCase()
          .includes(
            "ts450",
          ),
    );

  /*
    Cafe24 같은 쇼핑몰은 상품명과 링크가
    서로 다른 HTML 요소에 떨어져 있을 수 있다.

    이 경우 TS450 문자열 주변 HTML에서
    /product/... 링크를 추가 추출한다.
  */
  const lowerHome =
    homeHtml.toLowerCase();

  let searchFrom = 0;

  while (true) {
    const index =
      lowerHome.indexOf(
        model.toLowerCase(),
        searchFrom,
      );

    if (index < 0) {
      break;
    }

    const nearby =
      homeHtml.slice(
        Math.max(
          0,
          index - 5000,
        ),
        Math.min(
          homeHtml.length,
          index + 5000,
        ),
      );

    const hrefRegex =
      /href=["']([^"']+)["']/gi;

    let hrefMatch:
      RegExpExecArray | null;

    while (
      (
        hrefMatch =
          hrefRegex.exec(
            nearby,
          )
      ) !== null
    ) {
      const href =
        decodeHtml(
          hrefMatch[1] ?? "",
        );

      if (
        !href.includes(
          "/product/",
        )
      ) {
        continue;
      }

      try {
        candidates.push({
          url:
            new URL(
              href,
              officialSite,
            ).toString(),

          context:
            "TS450 주변 HTML",
        });
      } catch {
        // 무시
      }
    }

    searchFrom =
      index +
      model.length;
  }

  /*
    중복 제거
  */
  candidates =
    [
      ...new Map(
        candidates.map(
          (item) => [
            item.url,
            item,
          ],
        ),
      ).values(),
    ];

  console.log("");
  console.log(
    "발견 후보:",
    candidates.length,
  );

  for (
    const item of
    candidates.slice(
      0,
      10,
    )
  ) {
    console.log(
      "-",
      item.url,
    );
  }

  if (
    candidates.length === 0
  ) {
    console.log("");
    console.log(
      "[FAIL] TS450 상품 URL을 발견하지 못했습니다.",
    );

    return;
  }

  /*
    후보를 직접 무료 fetch해서
    실제 TS450 상품페이지인지 확인한다.
  */
  let selected:
    {
      url: string;
      html: string;
      status: number;
    } | null =
    null;

  for (
    const candidate of
    candidates
  ) {
    const response =
      await fetchHtml(
        candidate.url,
      );

    const html =
      await response.text();

    const containsModel =
      html
        .toLowerCase()
        .includes(
          model.toLowerCase(),
        );

    if (
      response.ok &&
      containsModel
    ) {
      selected = {
        url:
          response.url ||
          candidate.url,

        html,

        status:
          response.status,
      };

      break;
    }
  }

  console.log("");

  if (!selected) {
    console.log(
      "[FAIL] 후보는 찾았지만 정상 TS450 상세페이지 확인 실패",
    );

    return;
  }

  console.log(
    "[PASS] 실제 TS450 상세페이지 발견",
  );

  console.log(
    "HTTP:",
    selected.status,
  );

  console.log(
    "실제 상품 URL:",
    selected.url,
  );

  console.log(
    "HTML 길이:",
    selected.html.length,
  );

  const lower =
    selected.html.toLowerCase();

  const checks = [
    [
      "TS450",
      lower.includes(
        "ts450",
      ),
    ],

    [
      "에브리봇",
      selected.html.includes(
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
      "448000/448,000",
      selected.html.includes(
        "448000",
      ) ||
      selected.html.includes(
        "448,000",
      ),
    ],

    [
      "판매가 흔적",
      /(?:판매가|price)[\s\S]{0,300}[0-9][0-9,]{4,}/i.test(
        selected.html,
      ),
    ],
  ] as const;

  console.log("");
  console.log(
    "===== 상품정보 흔적 =====",
  );

  for (
    const [
      name,
      found,
    ] of checks
  ) {
    console.log(
      `${name}:`,
      found
        ? "YES"
        : "NO",
    );
  }

  await writeFile(
    "./trash/ts450-discovered-product.html",
    selected.html,
    "utf8",
  );

  await writeFile(
    "./trash/ts450-discovered-url.txt",
    selected.url,
    "utf8",
  );

  console.log("");
  console.log(
    "저장:",
  );

  console.log(
    "trash\\ts450-discovered-url.txt",
  );

  console.log(
    "trash\\ts450-discovered-product.html",
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
