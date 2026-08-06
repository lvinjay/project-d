import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegisterProductRequest = {
  category?: unknown;
  productName?: unknown;
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
      "현재는 네이버 브랜드스토어와 스마트스토어 상품만 지원합니다.",
    );
  }

  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
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

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as RegisterProductRequest;

    const productName = normalizeText(
      body.productName,
    );

    const sourceUrlText = normalizeText(
      body.sourceUrl,
    );

    const category =
      normalizeText(body.category) ||
      "카테고리 미지정";

    if (!productName) {
      return NextResponse.json(
        {
          success: false,
          message:
            "자동 추출한 제품명이 비어 있습니다.",
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

    /*
     * URL이 달라도 같은 네이버 원상품 번호면
     * 동일한 제품으로 판단한다.
     */
    const {
      data: existingProducts,
      error: existingError,
    } = await supabase
      .from("products")
      .select(PRODUCT_SELECT_FIELDS)
      .or(
        `origin_product_no.eq.${originProductNo},source_url.eq.${sourceUrl}`,
      )
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    const existingProduct =
      Array.isArray(existingProducts)
        ? (existingProducts[0] as
            | ProductRow
            | undefined)
        : undefined;

    if (existingProduct) {
      const { data, error } = await supabase
        .from("products")
        .update({
          category,
          product_name: productName,
          source_url: sourceUrl,
          checkout_merchant_no:
            checkoutMerchantNo,
          origin_product_no:
            originProductNo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingProduct.id)
        .select(PRODUCT_SELECT_FIELDS)
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        created: false,
        message:
          "이미 등록된 제품을 최신 정보로 갱신했습니다.",
        product: data as ProductRow,
      });
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        category,
        product_name: productName,
        source_url: sourceUrl,
        checkout_merchant_no:
          checkoutMerchantNo,
        origin_product_no:
          originProductNo,
      })
      .select(PRODUCT_SELECT_FIELDS)
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error(
          "동일한 상품이 이미 등록되어 있습니다.",
        );
      }

      throw error;
    }

    return NextResponse.json({
      success: true,
      created: true,
      message:
        "새 제품을 Project D에 자동 등록했습니다.",
      product: data as ProductRow,
    });
  } catch (error) {
    console.error(
      "Auto register product API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "제품 자동 등록 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}