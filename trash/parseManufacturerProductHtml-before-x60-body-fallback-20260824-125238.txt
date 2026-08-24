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
      extractFallbackModelName(
        html,
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
  };
}
