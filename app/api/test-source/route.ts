import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TestSourceRequest = {
  url?: string;
};

function isAllowedNaverShoppingUrl(value: string) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname === "search.shopping.naver.com"
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TestSourceRequest;
    const sourceUrl =
      typeof body.url === "string" ? body.url.trim() : "";

    if (!sourceUrl) {
      return NextResponse.json(
        {
          success: false,
          message: "?뚯뒪?명븷 URL???꾩슂?⑸땲??",
        },
        { status: 400 },
      );
    }

    if (!isAllowedNaverShoppingUrl(sourceUrl)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "?꾩옱 ?뚯뒪?몃뒗 ?ㅼ씠踰??쇳븨 寃??URL留??덉슜?⑸땲??",
        },
        { status: 400 },
      );
    }

    const response = await fetch(sourceUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (compatible; ProjectDSourceTest/1.0)",
      },
    });

    const html = await response.text();

    const result = {
      success: response.ok,
      requestedUrl: sourceUrl,
      finalUrl: response.url,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      htmlLength: html.length,
      containsProductText:
        html.includes("product") ||
        html.includes("?곹뭹") ||
        html.includes("由щ럭"),
      pageTitle:
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ??
        null,
      message: response.ok
        ? "?섏씠吏 ?묐떟??諛쏆븯?듬땲??"
        : "?ㅼ씠踰꾩뿉???뺤긽 ?묐떟??諛쏆? 紐삵뻽?듬땲??",
    };

    return NextResponse.json(result, {
      status: response.ok ? 200 : 502,
    });
  } catch (error) {
    console.error("Source test error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "URL ?묎렐 ?뚯뒪??以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.",
      },
      { status: 500 },
    );
  }
}

