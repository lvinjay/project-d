import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtractProductRequest = {
  url?: string;
};

const ALLOWED_HOSTS = [
  "brand.naver.com",
  "smartstore.naver.com",
  "shopping.naver.com",
  "search.shopping.naver.com",
  "www.coupang.com",
  "link.coupang.com",
];

function isAllowedProductUrl(value: string) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      ALLOWED_HOSTS.some(
        (host) =>
          url.hostname === host ||
          url.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function extractMetaContent(
  html: string,
  attributeName: "property" | "name",
  attributeValue: string,
) {
  const escapedValue = attributeValue.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  const attributeFirstPattern = new RegExp(
    `<meta[^>]+${attributeName}=["']${escapedValue}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i",
  );

  const contentFirstPattern = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+${attributeName}=["']${escapedValue}["'][^>]*>`,
    "i",
  );

  const match =
    html.match(attributeFirstPattern) ??
    html.match(contentFirstPattern);

  return match?.[1]
    ? decodeHtmlEntities(match[1])
    : null;
}

function extractTitle(html: string) {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  );

  return match?.[1]
    ? decodeHtmlEntities(match[1])
    : null;
}

function cleanProductName(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/\s*[:|\-]\s*네이버.*$/i, "")
    .replace(/\s*[:|\-]\s*쿠팡.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as ExtractProductRequest;

    const sourceUrl =
      typeof body.url === "string"
        ? body.url.trim()
        : "";

    if (!sourceUrl) {
      return NextResponse.json(
        {
          success: false,
          extracted: false,
          message: "상품 URL을 입력하세요.",
        },
        { status: 400 },
      );
    }

    if (!isAllowedProductUrl(sourceUrl)) {
      return NextResponse.json(
        {
          success: false,
          extracted: false,
          message:
            "현재는 네이버 쇼핑·스마트스토어·브랜드스토어·쿠팡 상품 URL만 지원합니다.",
        },
        { status: 400 },
      );
    }

    const response = await fetch(sourceUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "ko-KR,ko;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
      },
    });

    const html = await response.text();

    const blocked =
      response.status === 418 ||
      response.status === 403 ||
      html.includes("비정상적인 접근") ||
      html.includes("접근이 제한") ||
      html.includes("Access Denied");

    if (!response.ok || blocked) {
      return NextResponse.json({
        success: true,
        extracted: false,
        sourceUrl,
        status: response.status,
        message:
          "판매처가 자동 정보 추출을 제한했습니다. 제품명은 직접 입력해 주세요.",
      });
    }

    const ogTitle = extractMetaContent(
      html,
      "property",
      "og:title",
    );

    const twitterTitle = extractMetaContent(
      html,
      "name",
      "twitter:title",
    );

    const pageTitle = extractTitle(html);

    const description =
      extractMetaContent(
        html,
        "property",
        "og:description",
      ) ??
      extractMetaContent(
        html,
        "name",
        "description",
      );

    const imageUrl = extractMetaContent(
      html,
      "property",
      "og:image",
    );

    const productName = cleanProductName(
      ogTitle ?? twitterTitle ?? pageTitle,
    );

    if (!productName) {
      return NextResponse.json({
        success: true,
        extracted: false,
        sourceUrl,
        status: response.status,
        message:
          "페이지는 열렸지만 제품명을 찾지 못했습니다. 제품명은 직접 입력해 주세요.",
      });
    }

    return NextResponse.json({
      success: true,
      extracted: true,
      sourceUrl,
      finalUrl: response.url,
      status: response.status,
      product: {
        productName,
        description,
        imageUrl,
      },
      message: "제품 정보를 추출했습니다.",
    });
  } catch (error) {
    console.error(
      "Product extraction API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        extracted: false,
        message:
          error instanceof Error &&
          error.name === "TimeoutError"
            ? "판매처 응답 시간이 초과되었습니다. 제품명은 직접 입력해 주세요."
            : error instanceof Error
              ? error.message
              : "상품 정보 추출 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}