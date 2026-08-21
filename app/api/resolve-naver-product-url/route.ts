import {
  NextResponse,
} from "next/server";

import {
  resolveNaverBrandProductUrl,
} from "../../../lib/resolveNaverBrandProductUrl";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: Request,
) {
  try {
    const {
      searchParams,
    } =
      new URL(
        request.url,
      );

    const url =
      (
        searchParams.get(
          "url",
        ) ?? ""
      ).trim();

    const name =
      (
        searchParams.get(
          "name",
        ) ?? ""
      ).trim();

    if (
      !url ||
      !name
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "url과 name이 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    const resolved =
      await resolveNaverBrandProductUrl(
        url,
        name,
      );

    return NextResponse.json({
      success:
        resolved.success,
      resolved,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "URL 해결 실패",
      },
      {
        status: 500,
      },
    );
  }
}
