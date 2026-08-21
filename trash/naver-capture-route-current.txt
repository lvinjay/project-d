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
};

declare global {
  var projectDNaverCaptures:
    Map<string, CaptureData>
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
      capture.products,
  });
}
