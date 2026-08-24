function decodeHtml(
  value: string,
) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(
  value: string,
) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeSearchTerms(
  terms: string[],
) {
  return [
    ...new Set(
      terms
        .map((term) =>
          String(term ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
}

function scoreCandidate(
  url: string,
  context: string,
  terms: string[],
) {
  const urlText =
    decodeURIComponent(
      url,
    ).toLowerCase();

  const contextText =
    context.toLowerCase();

  let score = 0;

  for (
    const term of terms
  ) {
    if (
      urlText.includes(term)
    ) {
      score += 10;
    }

    if (
      contextText.includes(term)
    ) {
      score += 5;
    }
  }

  return score;
}

export type ManufacturerProductUrlDiscoveryResult =
  | {
      success: true;

      url: string;

      html: string;

      status: number;

      candidatesChecked: number;
    }
  | {
      success: false;

      reason: string;

      candidatesChecked: number;
    };

export async function discoverManufacturerProductUrl(
  officialSite: string,
  searchTerms: string[],
): Promise<ManufacturerProductUrlDiscoveryResult> {
  const terms =
    normalizeSearchTerms(
      searchTerms,
    );

  if (
    !officialSite ||
    terms.length === 0
  ) {
    return {
      success: false,
      reason:
        "공식몰 주소 또는 상품 검색어가 없습니다.",
      candidatesChecked: 0,
    };
  }

  let siteUrl: URL;

  try {
    siteUrl =
      new URL(
        officialSite,
      );
  } catch {
    return {
      success: false,
      reason:
        "공식몰 URL 형식이 올바르지 않습니다.",
      candidatesChecked: 0,
    };
  }

  const homeResponse =
    await fetchHtml(
      siteUrl.toString(),
    );

  if (
    !homeResponse.ok
  ) {
    return {
      success: false,
      reason:
        `공식몰 메인페이지 응답 실패 (${homeResponse.status})`,
      candidatesChecked: 0,
    };
  }

  const homeHtml =
    await homeResponse.text();

  const candidates:
    {
      url: string;
      context: string;
      score: number;
    }[] = [];

  /*
    1. 일반 anchor 링크에서 검색어가 포함된 후보 수집
  */
  const anchorRegex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let anchorMatch:
    RegExpExecArray | null;

  while (
    (
      anchorMatch =
        anchorRegex.exec(
          homeHtml,
        )
    ) !== null
  ) {
    const href =
      decodeHtml(
        anchorMatch[1] ??
        "",
      ).trim();

    if (!href) {
      continue;
    }

    const context =
      cleanText(
        anchorMatch[2] ??
        "",
      );

    let absoluteUrl =
      "";

    try {
      absoluteUrl =
        new URL(
          href,
          siteUrl,
        ).toString();
    } catch {
      continue;
    }

    const score =
      scoreCandidate(
        absoluteUrl,
        context,
        terms,
      );

    if (score <= 0) {
      continue;
    }

    candidates.push({
      url:
        absoluteUrl,
      context,
      score,
    });
  }

  /*
    2. 상품명과 링크가 서로 다른 DOM 요소에 있는 쇼핑몰 대응.

    검색어가 등장하는 주변 HTML에서
    product 성격의 링크를 추가로 수집한다.
  */
  const lowerHome =
    homeHtml.toLowerCase();

  for (
    const term of terms
  ) {
    let searchFrom = 0;

    while (true) {
      const index =
        lowerHome.indexOf(
          term,
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
            hrefMatch[1] ??
            "",
          ).trim();

        if (!href) {
          continue;
        }

        let absoluteUrl =
          "";

        try {
          absoluteUrl =
            new URL(
              href,
              siteUrl,
            ).toString();
        } catch {
          continue;
        }

        /*
          사이트별 URL 형식을 하드코딩하지 않되,
          상품 페이지일 가능성이 전혀 없는 링크의
          우선순위는 낮춘다.
        */
        const context =
          cleanText(
            nearby,
          );

        let score =
          scoreCandidate(
            absoluteUrl,
            context,
            terms,
          );

        if (
          /\/product(?:\/|s\/|\?|$)/i.test(
            absoluteUrl,
          )
        ) {
          score += 3;
        }

        if (score <= 0) {
          continue;
        }

        candidates.push({
          url:
            absoluteUrl,
          context,
          score,
        });
      }

      searchFrom =
        index +
        term.length;
    }
  }

  /*
    중복 제거 후 점수가 높은 후보부터 확인.
  */
  const unique =
    [
      ...new Map(
        candidates
          .sort(
            (a, b) =>
              b.score -
              a.score,
          )
          .map(
            (item) => [
              item.url,
              item,
            ],
          ),
      ).values(),
    ];

  let checked = 0;

  /*
    지나치게 많은 페이지를 열지 않도록
    상위 10개까지만 검증한다.
  */
  for (
    const candidate of
    unique.slice(
      0,
      10,
    )
  ) {
    checked += 1;

    let response:
      Response;

    try {
      response =
        await fetchHtml(
          candidate.url,
        );
    } catch {
      continue;
    }

    if (
      !response.ok
    ) {
      continue;
    }

    const html =
      await response.text();

    /*
      HTML 전체를 decodeURIComponent에 넣으면
      일반 % 문자가 포함된 페이지에서
      URI malformed가 발생할 수 있다.

      URL만 안전하게 decode하고
      HTML은 원문 그대로 비교한다.
    */
    const decodedResponseUrl =
      (() => {
        try {
          return decodeURIComponent(
            response.url ||
            candidate.url,
          );
        } catch {
          return (
            response.url ||
            candidate.url
          );
        }
      })();

    const text =
      `${decodedResponseUrl} ${html}`
        .toLowerCase();

    /*
      검색어 중 최소 하나가 실제 상세페이지에도
      존재해야 상품 후보로 인정한다.

      이후 상품 일치 여부는 별도
      validateProductMatch에서 다시 검증한다.
    */
    const matched =
      terms.some(
        (term) =>
          text.includes(
            term,
          ),
      );

    if (!matched) {
      continue;
    }

    return {
      success: true,

      url:
        response.url ||
        candidate.url,

      html,

      status:
        response.status,

      candidatesChecked:
        checked,
    };
  }

  return {
    success: false,

    reason:
      "공식몰에서 일치하는 실제 상품 상세페이지를 찾지 못했습니다.",

    candidatesChecked:
      checked,
  };
}

