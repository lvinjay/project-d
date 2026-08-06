import axios from "axios";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FetchReviewsRequest = {
  checkoutMerchantNo?: number;
  originProductNo?: number;
  maxReviews?: number;
};

type NaverReview = {
  contentsId?: string;
  reviewContent?: string;
  reviewScore?: number;
  createDate?: string;
  productOptionContent?: string;
  reviewType?: string;
  helpCount?: number;
};

type NaverReviewResponse = {
  contents?: NaverReview[];
  page?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
  last?: boolean;
};

const REVIEW_API_URL =
  "https://brand.naver.com/n/v1/contents/reviews/query-pages";

const PAGE_SIZE = 20;
const MAX_REVIEWS = 100;

function sleep(milliseconds: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds),
  );
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as FetchReviewsRequest;

    const checkoutMerchantNo = Number(
      body.checkoutMerchantNo,
    );

    const originProductNo = Number(
      body.originProductNo,
    );

    const requestedMax = Number(
      body.maxReviews ?? 20,
    );

    const maxReviews = Math.min(
      Math.max(
        Number.isFinite(requestedMax)
          ? Math.floor(requestedMax)
          : 20,
        1,
      ),
      MAX_REVIEWS,
    );

    if (
      !Number.isInteger(checkoutMerchantNo) ||
      checkoutMerchantNo <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "checkoutMerchantNo가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(originProductNo) ||
      originProductNo <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "originProductNo가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const reviewTexts: string[] = [];
    const reviewIds = new Set<string>();

    const maximumPages = Math.ceil(
      maxReviews / PAGE_SIZE,
    );

    let requestedPages = 0;
    let totalElements: number | null = null;

    for (
      let page = 1;
      page <= maximumPages;
      page += 1
    ) {
      const response =
        await axios.post<NaverReviewResponse>(
          REVIEW_API_URL,
          {
            checkoutMerchantNo,
            originProductNo,
            page,
            pageSize: PAGE_SIZE,
            reviewSearchSortType:
              "REVIEW_RANKING",
          },
          {
            timeout: 15000,
            headers: {
              Accept:
                "application/json, text/plain, */*",
              "Accept-Language":
                "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
              "Content-Type":
                "application/json",
              Origin:
                "https://brand.naver.com",
              Referer:
                "https://brand.naver.com/brizl/products/10087709433",
              "User-Agent":
                "Mozilla/5.0",
            },
            validateStatus: () => true,
          },
        );

      requestedPages += 1;

      if (response.status !== 200) {
        console.error(
          "Naver review API status:",
          response.status,
          response.data,
        );

        return NextResponse.json(
          {
            success: false,
            message:
              "네이버 리뷰 API에서 정상 응답을 받지 못했습니다.",
            naverStatus: response.status,
            requestedPages,
            collectedCount:
              reviewTexts.length,
          },
          { status: 502 },
        );
      }

      const reviews = Array.isArray(
        response.data.contents,
      )
        ? response.data.contents
        : [];

      if (
        typeof response.data.totalElements ===
        "number"
      ) {
        totalElements =
          response.data.totalElements;
      }

      if (reviews.length === 0) {
        break;
      }

      for (const review of reviews) {
        const content =
          typeof review.reviewContent ===
          "string"
            ? review.reviewContent
                .replace(/\s+/g, " ")
                .trim()
            : "";

        if (!content) {
          continue;
        }

        const id =
          typeof review.contentsId ===
          "string"
            ? review.contentsId
            : content;

        if (reviewIds.has(id)) {
          continue;
        }

        reviewIds.add(id);
        reviewTexts.push(content);

        if (
          reviewTexts.length >= maxReviews
        ) {
          break;
        }
      }

      if (
        reviewTexts.length >= maxReviews ||
        response.data.last === true ||
        reviews.length < PAGE_SIZE
      ) {
        break;
      }

      await sleep(1000);
    }

    return NextResponse.json({
      success: true,
      source: "naver-brand-store",
      checkoutMerchantNo,
      originProductNo,
      requestedPages,
      totalElements,
      count: reviewTexts.length,
      reviewTexts,
    });
  } catch (error) {
    console.error(
      "Fetch reviews API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message: axios.isAxiosError(error)
          ? error.message
          : error instanceof Error
            ? error.message
            : "리뷰를 불러오는 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}