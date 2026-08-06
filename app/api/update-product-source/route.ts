import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateProductSourceRequest = {
  productId?: unknown;
  sourceUrl?: unknown;
  checkoutMerchantNo?: unknown;
  originProductNo?: unknown;
};

type ProductRow = {
  id: string;
  category: string;
  product_name: string;
  source_url: string;
  checkout_merchant_no: number | null;
  origin_product_no: number | null;
  review_analysis: unknown | null;
  created_at: string;
  updated_at: string;
};

const PRODUCT_SELECT_FIELDS =
  "id, category, product_name, source_url, checkout_merchant_no, origin_product_no, review_analysis, created_at, updated_at";

function normalizeText(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function normalizePositiveInteger(
  value: unknown,
  fieldName: string,
) {
  const numberValue = Number(value);

  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue <= 0
  ) {
    throw new Error(
      `${fieldName}가 올바르지 않습니다.`,
    );
  }

  return numberValue;
}

function normalizeProductUrl(value: string) {
  const url = new URL(value);

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw new Error(
      "상품 URL은 http 또는 https 주소여야 합니다.",
    );
  }

  const supportedHosts = [
    "brand.naver.com",
    "smartstore.naver.com",
  ];

  if (!supportedHosts.includes(url.hostname)) {
    throw new Error(
      "네이버 브랜드스토어 또는 스마트스토어 상품 URL만 지원합니다.",
    );
  }

  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as UpdateProductSourceRequest;

    const productId = normalizeText(
      body.productId,
    );

    const sourceUrlText = normalizeText(
      body.sourceUrl,
    );

    if (!productId) {
      return NextResponse.json(
        {
          success: false,
          message: "제품 ID가 필요합니다.",
        },
        { status: 400 },
      );
    }

    if (!sourceUrlText) {
      return NextResponse.json(
        {
          success: false,
          message: "상품 URL이 필요합니다.",
        },
        { status: 400 },
      );
    }

    const sourceUrl =
      normalizeProductUrl(sourceUrlText);

    const checkoutMerchantNo =
      normalizePositiveInteger(
        body.checkoutMerchantNo,
        "네이버 판매자 번호",
      );

    const originProductNo =
      normalizePositiveInteger(
        body.originProductNo,
        "네이버 원상품 번호",
      );

    const {
      data: currentProduct,
      error: currentProductError,
    } = await supabase
      .from("products")
      .select(PRODUCT_SELECT_FIELDS)
      .eq("id", productId)
      .maybeSingle();

    if (currentProductError) {
      throw currentProductError;
    }

    if (!currentProduct) {
      return NextResponse.json(
        {
          success: false,
          message:
            "업데이트할 제품을 찾지 못했습니다.",
        },
        { status: 404 },
      );
    }

    const {
      data: duplicateProducts,
      error: duplicateError,
    } = await supabase
      .from("products")
      .select("id, product_name")
      .eq(
        "origin_product_no",
        originProductNo,
      )
      .neq("id", productId)
      .limit(1);

    if (duplicateError) {
      throw duplicateError;
    }

    if (
      Array.isArray(duplicateProducts) &&
      duplicateProducts.length > 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "동일한 네이버 원상품 번호를 사용하는 다른 제품이 이미 등록되어 있습니다.",
          duplicateProduct:
            duplicateProducts[0],
        },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("products")
      .update({
        source_url: sourceUrl,
        checkout_merchant_no:
          checkoutMerchantNo,
        origin_product_no:
          originProductNo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .select(PRODUCT_SELECT_FIELDS)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message:
        "네이버 리뷰 수집 정보를 제품에 저장했습니다.",
      product: data as ProductRow,
    });
  } catch (error) {
    console.error(
      "Update product source API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "네이버 리뷰 수집 정보를 저장하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}