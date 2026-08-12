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
const MAX_REVIEWS = 200;

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

    let requestedPages = 0;
    let totalElements: number | null = null;

    const collectionStats = {
      total: 0,
      ranking: 0,
      latest: 0,
      lowScore: 0,
    };

    async function requestReviewPage(
      page: number,
      sortType: string,
    ) {
      const response =
        await axios.post<NaverReviewResponse>(
          REVIEW_API_URL,
          {
            checkoutMerchantNo,
            originProductNo,
            page,
            pageSize: PAGE_SIZE,
            reviewSearchSortType: sortType,
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
                "https://brand.naver.com/",
              "User-Agent":
                "Mozilla/5.0",
            },
            validateStatus: () => true,
          },
        );

      requestedPages += 1;

      if (response.status !== 200) {
        throw new Error(
          `네이버 리뷰 API 요청 실패(${sortType}, ${page}페이지, HTTP ${response.status})`,
        );
      }

      if (
        typeof response.data.totalElements ===
        "number"
      ) {
        totalElements =
          response.data.totalElements;
      }

      return Array.isArray(response.data.contents)
        ? response.data.contents
        : [];
    }

    async function addReviews(
      sortType: string,
      targetCount: number,
      statKey: "ranking" | "latest" | "lowScore",
      maxPages: number,
    ) {
      let added = 0;

      for (
        let page = 1;
        page <= maxPages &&
        added < targetCount &&
        reviewTexts.length < maxReviews;
        page += 1
      ) {
        const reviews = await requestReviewPage(
          page,
          sortType,
        );

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
          added += 1;
          collectionStats[statKey] += 1;

          if (
            added >= targetCount ||
            reviewTexts.length >= maxReviews
          ) {
            break;
          }
        }

        if (
          reviews.length < PAGE_SIZE ||
          reviewTexts.length >= maxReviews
        ) {
          break;
        }

        await sleep(500);
      }
    }

    const rankingTarget = Math.min(
      100,
      maxReviews,
    );
    const latestTarget = Math.min(
      50,
      Math.max(0, maxReviews - rankingTarget),
    );
    const lowScoreTarget = Math.min(
      50,
      Math.max(
        0,
        maxReviews -
          rankingTarget -
          latestTarget,
      ),
    );

    await addReviews(
      "REVIEW_RANKING",
      rankingTarget,
      "ranking",
      8,
    );

    if (latestTarget > 0) {
      await addReviews(
        "REVIEW_CREATE_DATE_DESC",
        latestTarget,
        "latest",
        6,
      );
    }

    if (lowScoreTarget > 0) {
      await addReviews(
        "REVIEW_SCORE_ASC",
        lowScoreTarget,
        "lowScore",
        6,
      );
    }

    // 중복 때문에 200개를 못 채운 경우 추천순/최신순에서 추가 보충
    if (reviewTexts.length < maxReviews) {
      await addReviews(
        "REVIEW_RANKING",
        maxReviews - reviewTexts.length,
        "ranking",
        10,
      );
    }

    if (reviewTexts.length < maxReviews) {
      await addReviews(
        "REVIEW_CREATE_DATE_DESC",
        maxReviews - reviewTexts.length,
        "latest",
        10,
      );
    }

    collectionStats.total =
      reviewTexts.length;

    return NextResponse.json({
      success: true,
      source: "naver-brand-store",
      checkoutMerchantNo,
      originProductNo,
      requestedPages,
      totalElements,
      count: reviewTexts.length,
      reviewTexts,
      collectionStats,
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