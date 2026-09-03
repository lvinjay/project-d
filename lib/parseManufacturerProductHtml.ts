import type {
  ManufacturerRawProduct,
} from "./normalizeManufacturerProduct";

function decodeHtmlEntities(
  value: string,
) {
  return String(value ?? "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(
        Number(code),
      ),
    );
}

function cleanText(
  value: unknown,
) {
  return decodeHtmlEntities(
    String(value ?? ""),
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMetaContent(
  html: string,
  key: string,
) {
  const escaped =
    key.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );

  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i",
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      html.match(pattern);

    if (match?.[1]) {
      return decodeHtmlEntities(
        match[1],
      ).trim();
    }
  }

  return "";
}

function getJsonLdObjects(
  html: string,
): unknown[] {
  const results:
    unknown[] = [];

  const regex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match:
    RegExpExecArray | null;

  while (
    (
      match =
        regex.exec(html)
    ) !== null
  ) {
    const text =
      String(
        match[1] ?? "",
      ).trim();

    if (!text) {
      continue;
    }

    try {
      const parsed =
        JSON.parse(text);

      if (
        Array.isArray(parsed)
      ) {
        results.push(
          ...parsed,
        );
      } else {
        results.push(
          parsed,
        );
      }
    } catch {
      /*
        깨진 JSON-LD는 무시하고
        OG fallback으로 넘어간다.
      */
    }
  }

  return results;
}

function flattenJsonLd(
  input: unknown[],
) {
  const result:
    Record<string, any>[] = [];

  const visit = (
    value: unknown,
  ) => {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return;
    }

    if (
      Array.isArray(value)
    ) {
      for (
        const item of value
      ) {
        visit(item);
      }

      return;
    }

    const record =
      value as
        Record<string, any>;

    result.push(
      record,
    );

    if (
      Array.isArray(
        record["@graph"],
      )
    ) {
      visit(
        record["@graph"],
      );
    }
  };

  visit(input);

  return result;
}

function findProductJsonLd(
  html: string,
) {
  const objects =
    flattenJsonLd(
      getJsonLdObjects(
        html,
      ),
    );

  return (
    objects.find(
      (item) => {
        const type =
          item["@type"];

        if (
          Array.isArray(type)
        ) {
          return type
            .map(String)
            .some(
              (value) =>
                value.toLowerCase() ===
                "product",
            );
        }

        return (
          String(
            type ?? "",
          ).toLowerCase() ===
          "product"
        );
      },
    ) ?? null
  );
}

function extractPrice(
  product:
    Record<string, any> | null,
  html: string,
) {
  if (product) {
    const offers =
      product.offers;

    const offer =
      Array.isArray(offers)
        ? offers[0]
        : offers;

    const jsonPrice =
      offer?.price ??
      offer?.lowPrice ??
      offer?.highPrice;

    if (jsonPrice) {
      return jsonPrice;
    }
  }

  return (
    getMetaContent(
      html,
      "product:price:amount",
    ) ||
    getMetaContent(
      html,
      "og:price:amount",
    ) ||
    ""
  );
}

function extractImage(
  product:
    Record<string, any> | null,
  html: string,
) {
  const image =
    product?.image;

  if (
    typeof image ===
    "string"
  ) {
    return image;
  }

  if (
    Array.isArray(image) &&
    image.length > 0
  ) {
    const first =
      image[0];

    if (
      typeof first ===
      "string"
    ) {
      return first;
    }

    if (
      first &&
      typeof first ===
        "object"
    ) {
      return String(
        first.url ??
        first.contentUrl ??
        "",
      );
    }
  }

  if (
    image &&
    typeof image ===
      "object"
  ) {
    return String(
      image.url ??
      image.contentUrl ??
      "",
    );
  }

  return getMetaContent(
    html,
    "og:image",
  );
}


function getEmbeddedJsonValues(
  html: string,
  keys: string[],
) {
  const values: string[] = [];

  for (const key of keys) {
    const escaped =
      key.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

    const patterns = [
      new RegExp(
        `["']${escaped}["']\\s*:\\s*["']([^"']+)["']`,
        "gi",
      ),
      new RegExp(
        `["']${escaped}["']\\s*:\\s*(\\d+(?:\\.\\d+)?)`,
        "gi",
      ),
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;

      while (
        (match = pattern.exec(html)) !== null
      ) {
        const value =
          cleanText(match[1] ?? "");

        if (value) {
          values.push(value);
        }
      }
    }
  }

  return [
    ...new Set(values),
  ];
}

function firstEmbeddedJsonValue(
  html: string,
  keys: string[],
) {
  return (
    getEmbeddedJsonValues(
      html,
      keys,
    )[0] ?? ""
  );
}

function extractFallbackTitle(
  html: string,
) {
  return (
    getMetaContent(
      html,
      "og:title",
    ) ||
    getMetaContent(
      html,
      "twitter:title",
    ) ||
    firstEmbeddedJsonValue(
      html,
      [
        "productName",
        "product_name",
        "name",
        "title",
      ],
    )
  );
}

function extractFallbackPrice(
  html: string,
) {
  return firstEmbeddedJsonValue(
    html,
    [
      "salePrice",
      "sale_price",
      "sellingPrice",
      "selling_price",
      "finalPrice",
      "final_price",
      "price",
      "lowPrice",
      "low_price",
    ],
  );
}

function extractFallbackModelName(
  html: string,
) {
  return firstEmbeddedJsonValue(
    html,
    [
      "modelName",
      "model_name",
      "model",
      "mpn",
      "sku",
      "productCode",
      "product_code",
    ],
  );
}

function extractBodyModelCandidates(
  html: string,
) {
  const text = cleanText(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " "),
  );

  const candidates: string[] = [];
  const patterns = [
    /\b([A-Z][A-Z0-9-]*\d[A-Z0-9-]*(?:\s+(?:Master|Ultra|Pro|MaxV|Max|Plus)){1,3})\b/gi,
    /\b([A-Z]+\d+[A-Z0-9-]*(?:\s+(?:Master|Ultra|Pro|MaxV|Max|Plus)){1,3})\b/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = cleanText(match[1] ?? "");
      if (value) candidates.push(value);
    }
  }

  return [...new Set(candidates)];
}

function extractFallbackBodyModelName(
  html: string,
) {
  const candidates = extractBodyModelCandidates(html);
  return candidates.length === 1 ? candidates[0] : "";
}

function normalizeSpecKey(
  value: unknown,
) {
  return cleanText(value)
    .replace(/[:：]\s*$/, "")
    .trim();
}

function normalizeSpecValue(
  value: unknown,
) {
  return cleanText(value)
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeySpecs(
  product:
    Record<string, any> | null,
  html: string,
) {
  const specs =
    new Map<string, string>();

  /*
    제조사 페이지의 구조화된 사양은 상품군별 키워드로 제한하지 않는다.

    TV, 노트북, 카메라, 이어폰, 생활가전 등 새로운 카테고리가
    추가되어도 additionalProperty / 사양표 / definition list에
    명시된 key-value는 가능한 한 그대로 보존한다.

    메뉴/결제/배송 등 명백한 비사양 항목만 junkSpecKey로 제외한다.
  */

  const junkSpecKey =
    /^(?:log ?in|login|search|site navigation|cart|subscribe|code|app store|google play|shop|menu|account|wishlist|share|facebook|instagram|youtube|tiktok|shipping|delivery|payment|price|sale|discount|off)$/i;

  const add = (
    rawKey: unknown,
    rawValue: unknown,
  ) => {
    const key =
      normalizeSpecKey(rawKey);
    const value =
      normalizeSpecValue(rawValue);

    if (
      !key ||
      !value ||
      key.length > 80 ||
      value.length > 500 ||
      key === value ||
      junkSpecKey.test(key)
    ) {
      return;
    }

    if (!specs.has(key)) {
      specs.set(key, value);
    }
  };

  const additionalProperty =
    product?.additionalProperty;

  const properties =
    Array.isArray(additionalProperty)
      ? additionalProperty
      : additionalProperty
        ? [additionalProperty]
        : [];

  for (const item of properties) {
    if (
      item &&
      typeof item === "object"
    ) {
      add(
        item.name ??
          item.propertyID ??
          item.label,
        item.value ??
          item.valueReference ??
          item.description,
      );
    }
  }

  const tableRowRegex =
    /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  let tableMatch:
    RegExpExecArray | null;

  while (
    specs.size < 40 &&
    (tableMatch =
      tableRowRegex.exec(html)) !== null
  ) {
    const cells =
      [
        ...(tableMatch[1] ?? "").matchAll(
          /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi,
        ),
      ]
        .map((match) =>
          cleanText(match[1] ?? ""),
        )
        .filter(Boolean);

    if (cells.length >= 2) {
      add(
        cells[0],
        cells.slice(1).join(" "),
      );
    }
  }

  const definitionRegex =
    /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;

  let definitionMatch:
    RegExpExecArray | null;

  while (
    specs.size < 40 &&
    (definitionMatch =
      definitionRegex.exec(html)) !== null
  ) {
    add(
      definitionMatch[1],
      definitionMatch[2],
    );
  }

  const bodyText =
    cleanText(
      html
        .replace(
          /<script\b[^>]*>[\s\S]*?<\/script>/gi,
          " ",
        )
        .replace(
          /<style\b[^>]*>[\s\S]*?<\/style>/gi,
          " ",
        ),
    );

  /*
    구조화된 사양표가 없는 페이지를 위한 보조 fallback.

    특정 상품군 기능명이 아니라 여러 제품군에서 공통으로
    발견되는 수치형 사양만 텍스트에서 추가 추출한다.
  */
  const patterns = [
    ["배터리", /(?:배터리(?:\s*용량)?|battery(?:\s+capacity)?)\s*[:：-]?\s*([0-9,.]+\s*(?:mah|wh))/i],
    ["사용시간", /(?:사용|작동|재생|연속\s*사용)\s*시간\s*[:：-]?\s*([0-9,.]+\s*(?:분|시간|min|minutes?|h|hr|hrs|hours?))/i],
    ["사용시간", /(?:runtime|run\s*time|working\s*time|playback\s*time)\s*[:：-]?\s*([0-9,.]+\s*(?:min|minutes?|h|hr|hrs|hours?))/i],
    ["충전시간", /(?:충전\s*시간|charging\s*time)\s*[:：-]?\s*([0-9,.]+\s*(?:분|시간|min|minutes?|h|hr|hrs|hours?))/i],
    ["소비전력", /(?:소비\s*전력|정격\s*전력|rated\s*power|power\s*consumption)\s*[:：-]?\s*([0-9,.]+\s*(?:w|kw))/i],
    ["크기", /(?:제품\s*)?(?:크기|사이즈|규격|dimensions?|product\s*size)\s*[:：-]?\s*([0-9.,x×*\s]+(?:mm|cm|m))/i],
    ["무게", /(?:제품\s*)?(?:무게|중량|weight)\s*[:：-]?\s*([0-9,.]+\s*(?:kg|g))/i],
    ["소음", /(?:소음|noise(?:\s*level)?)\s*[:：-]?\s*([0-9,.]+\s*db)/i],
    ["온도", /(?:온도|temperature)\s*[:：-]?\s*([0-9,.]+\s*°?\s*c)/i],
  ] as const;

  for (
    const [label, pattern] of patterns
  ) {
    const match =
      bodyText.match(pattern);

    if (match?.[1]) {
      add(label, match[1]);
    }
  }

  return Object.fromEntries(
    specs.entries(),
  );
}


function extractEvaluationEvidence(
  html: string,
) {
  const text =
    cleanText(
      html
        .replace(
          /<script\b[^>]*>[\s\S]*?<\/script>/gi,
          " ",
        )
        .replace(
          /<style\b[^>]*>[\s\S]*?<\/style>/gi,
          " ",
        )
        .replace(
          /<!--[\s\S]*?-->/g,
          " ",
        ),
    );

  const junkPattern =
    /(?:shipping to|로그인|회원가입|장바구니|주문조회|배송비|결제|개인정보|이용약관|사업자정보|고객센터|반품|교환|쿠폰|적립금|무이자|상품문의|world shipping|privacy policy|refund policy|terms of service|app store|google play|copyright|all rights reserved)/i;

  /*
    특정 상품군의 평가축을 코드에 고정하지 않는다.

    제조사 페이지의 의미 있는 설명문을 일반 evidence로 보존하고,
    어떤 내용이 실제 구매기준이 되는지는 이후
    generate-category-criteria 단계에서 제품군별로 판단한다.
  */
  const rawSegments =
    text
      .split(
        /(?<=[.!?。])\s+|\s{2,}|(?:\s*[|•·]\s*)/,
      )
      .map((value) =>
        value
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(
        (value) =>
          value.length >= 18 &&
          value.length <= 420 &&
          !junkPattern.test(value),
      );

  const generalProductEvidence:
    string[] = [];

  for (const segment of rawSegments) {
    if (
      generalProductEvidence.includes(
        segment,
      )
    ) {
      continue;
    }

    generalProductEvidence.push(
      segment,
    );

    if (
      generalProductEvidence.length >=
      30
    ) {
      break;
    }
  }

  return {
    general_product_evidence:
      generalProductEvidence,
  };
}

export function parseManufacturerProductHtml(
  html: string,
  canonicalUrl: string,
): ManufacturerRawProduct {
  const product =
    findProductJsonLd(
      html,
    );

  const title =
    cleanText(
      product?.name ??
      extractFallbackTitle(
        html,
      ),
    );

  const brandValue =
    product?.brand;

  const brand =
    cleanText(
      typeof brandValue ===
        "string"
        ? brandValue
        : brandValue?.name ??
          "",
    );

  const manufacturerValue =
    product?.manufacturer;

  const manufacturer =
    cleanText(
      typeof manufacturerValue ===
        "string"
        ? manufacturerValue
        : manufacturerValue
            ?.name ??
          "",
    );

  const modelName =
    cleanText(
      product?.model ??
      product?.mpn ??
      product?.sku ??
      (
        extractFallbackModelName(
          html,
        ) ||
        extractFallbackBodyModelName(
          html,
        )
      ),
    );

  const finalPrice =
    extractPrice(
      product,
      html,
    );

  const originalPrice =
    getMetaContent(
      html,
      "product:original_price:amount",
    ) ||
    finalPrice;

  const imageUrl =
    extractImage(
      product,
      html,
    );

  const keySpecs =
    extractKeySpecs(
      product,
      html,
    );

  const evaluationEvidence =
    extractEvaluationEvidence(
      html,
    );

  return {
    url:
      canonicalUrl,

    title,

    brand,

    manufacturer,

    modelName,

    originalPrice,

    finalPrice,

    imageUrl,

    keySpecs,

    evaluationEvidence,
  };
}
