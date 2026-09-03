import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type CapturedProduct = {
  name: string;
  text: string;
  seller: string;
  url: string;
  imageUrl: string;
  price: number;
  reviewCount: number;
  rating: number;
};

type CapturedReview = {
  rating: number;
  date: string;
  text: string;
  helpfulCount: number;
};

type BrowserReviewCapture = {
  browserReviews: CapturedReview[];
  browserReviewSourceUrl: string;
  browserReviewTotalCount: number;
  browserSpecs: Record<string, string>;
  browserCatalogTitle: string;
};

type CaptureData = {
  category: string;
  minBudget: number;
  maxBudget: number;
  products: CapturedProduct[];
  createdAt: number;
};

type IncomingProduct = {
  name?: unknown;
  text?: unknown;
  seller?: unknown;
  url?: unknown;
  imageUrl?: unknown;
  price?: unknown;
  reviewCount?: unknown;
  rating?: unknown;
  browserReviews?: unknown;
  browserReviewSourceUrl?: unknown;
  browserReviewTotalCount?: unknown;
  browserSpecs?: unknown;
  browserCatalogTitle?: unknown;
};

declare global {
  var projectDNaverCaptures:
    Map<string, CaptureData>
    | undefined;

  var projectDNaverBrowserReviewCaptures:
    Map<string, BrowserReviewCapture[]>
    | undefined;
}

function getStore() {
  if (
    !globalThis.projectDNaverCaptures
  ) {
    globalThis.projectDNaverCaptures =
      new Map();
  }

  return globalThis
    .projectDNaverCaptures;
}

function getBrowserReviewStore() {
  if (
    !globalThis
      .projectDNaverBrowserReviewCaptures
  ) {
    globalThis
      .projectDNaverBrowserReviewCaptures =
      new Map();
  }

  return globalThis
    .projectDNaverBrowserReviewCaptures;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":
      "*",
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type",
  };
}

function text(
  value: unknown,
) {
  return String(
    value ?? "",
  )
    .replace(/\s+/g, " ")
    .trim();
}

function number(
  value: unknown,
) {
  const result =
    Number(value ?? 0);

  return Number.isFinite(
    result,
  )
    ? result
    : 0;
}

function reviewList(
  value: unknown,
): CapturedReview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const reviews:
    CapturedReview[] = [];

  const seen =
    new Set<string>();

  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const raw =
      item as Record<
        string,
        unknown
      >;

    const reviewText =
      text(
        raw.text ??
        raw.reviewContent,
      );

    if (!reviewText) {
      continue;
    }

    const rating =
      number(
        raw.rating ??
        raw.score ??
        raw.reviewScore,
      );

    const date =
      text(
        raw.date ??
        raw.createDate ??
        raw.reviewDate,
      );

    const helpfulCount =
      number(
        raw.helpfulCount,
      );

    const key =
      `${rating}|${date}|${reviewText.slice(
        0,
        1000,
      )}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    reviews.push({
      rating,
      date,
      text: reviewText,
      helpfulCount,
    });

    if (reviews.length >= 20) {
      break;
    }
  }

  return reviews;
}

function specMap(
  value: unknown,
): Record<string, string> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  const result:
    Record<string, string> = {};

  for (
    const [rawKey, rawValue]
    of Object.entries(
      value as Record<string, unknown>,
    )
  ) {
    const key = text(rawKey);
    const specValue = text(rawValue);

    if (!key || !specValue) {
      continue;
    }

    result[key] = specValue;
  }

  return result;
}

export async function OPTIONS() {
  return new Response(
    null,
    {
      status: 204,
      headers:
        corsHeaders(),
    },
  );
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json();

    const incoming =
      Array.isArray(
        body.products,
      )
        ? body.products
        : [];

    const products:
      CapturedProduct[] =
      incoming
        .slice(0, 100)
        .map(
          (
            raw:
              IncomingProduct,
          ) => ({
            name:
              text(
                raw.name,
              ),

            text:
              text(
                raw.text,
              ),

            seller:
              text(
                raw.seller,
              ),

            url:
              text(
                raw.url,
              ),

            imageUrl:
              text(
                raw.imageUrl,
              ),

            price:
              number(
                raw.price,
              ),

            reviewCount:
              number(
                raw.reviewCount,
              ),

            rating:
              number(
                raw.rating,
              ),
          }),
        )
        .filter(
          (
            product:
              CapturedProduct,
          ) =>
            Boolean(
              product.name,
            ) &&
            Boolean(
              product.url,
            ) &&
            product.price >
              0,
        );

    if (
      products.length ===
      0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "수집 상품이 없습니다.",
        },
        {
          status: 400,
          headers:
            corsHeaders(),
        },
      );
    }

    const browserReviewEntries:
      BrowserReviewCapture[] =
      products.map(
        (product) => {
          const source =
            incoming.find(
              (
                item:
                  IncomingProduct,
              ) =>
                text(item.name) ===
                  product.name &&
                text(item.url) ===
                  product.url,
            );

          return {
            browserReviews:
              reviewList(
                source
                  ?.browserReviews,
              ),

            browserReviewSourceUrl:
              text(
                source
                  ?.browserReviewSourceUrl,
              ),

            browserReviewTotalCount:
              number(
                source
                  ?.browserReviewTotalCount,
              ),

            browserSpecs:
              specMap(
                source?.browserSpecs,
              ),

            browserCatalogTitle:
              text(
                source?.browserCatalogTitle,
              ),
          };
        },
      );

    const id =
      crypto.randomUUID();

    getStore().set(
      id,
      {
        category:
          text(
            body.category,
          ),

        minBudget:
          number(
            body.minBudget,
          ),

        maxBudget:
          number(
            body.maxBudget,
          ),

        products,

        createdAt:
          Date.now(),
      },
    );

    getBrowserReviewStore().set(
      id,
      browserReviewEntries,
    );

    return NextResponse.json(
      {
        success: true,
        id,
        count:
          products.length,
      },
      {
        headers:
          corsHeaders(),
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "후보 저장 실패",
      },
      {
        status: 500,
        headers:
          corsHeaders(),
      },
    );
  }
}

export async function GET(
  request: Request,
) {
  const url =
    new URL(
      request.url,
    );

  const id =
    url.searchParams.get(
      "id",
    );

  if (!id) {
    return NextResponse.json(
      {
        success: false,
        message:
          "수집 ID가 없습니다.",
      },
      {
        status: 400,
      },
    );
  }

  const capture =
    getStore().get(id);

  if (!capture) {
    return NextResponse.json(
      {
        success: false,
        message:
          "수집 데이터를 찾을 수 없습니다.",
      },
      {
        status: 404,
      },
    );
  }

  const browserReviewEntries =
    getBrowserReviewStore()
      .get(id) ??
    [];

  return NextResponse.json({
    success: true,

    category:
      capture.category,

    minBudget:
      capture.minBudget,

    maxBudget:
      capture.maxBudget,

    count:
      capture.products.length,

    products:
      capture.products.map(
        (product, index) => ({
          ...product,

          browserReviews:
            browserReviewEntries[
              index
            ]?.browserReviews ??
            [],

          browserReviewSourceUrl:
            browserReviewEntries[
              index
            ]?.browserReviewSourceUrl ??
            "",

          browserReviewTotalCount:
            browserReviewEntries[
              index
            ]?.browserReviewTotalCount ??
            0,

          browserSpecs:
            browserReviewEntries[
              index
            ]?.browserSpecs ??
            {},

          browserCatalogTitle:
            browserReviewEntries[
              index
            ]?.browserCatalogTitle ??
            "",
        }),
      ),
  });
}
