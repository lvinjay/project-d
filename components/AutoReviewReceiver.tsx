"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

export type ReviewCollectionStats = {
  total: number;
  ranking: number;
  latest: number;
  lowScore: number;
};

type AutoReviewReceiverProps = {
  productId: string;
  disabled?: boolean;
  onReviewsReceived: (
    reviewText: string,
    collectionStats?: ReviewCollectionStats,
  ) => void;
};

type TransferPayload = {
  type?: string;
  productId?: string;
  sourceUrl?: unknown;
  checkoutMerchantNo?: unknown;
  originProductNo?: unknown;
  collectionStats?: unknown;
  reviews?: unknown;
};

type UpdateSourceResponse = {
  success: boolean;
  message?: string;
};

function normalizeReviews(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const reviews = value
    .filter(
      (review): review is string =>
        typeof review === "string",
    )
    .map((review) =>
      review.replace(/\s+/g, " ").trim(),
    )
    .filter((review) => review.length > 0);

  return [...new Set(reviews)].slice(0, 200);
}

function normalizeCollectionStats(
  value: unknown,
  fallbackTotal: number,
): ReviewCollectionStats | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const row = value as Record<string, unknown>;
  const safeCount = (raw: unknown) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0
      ? Math.floor(parsed)
      : 0;
  };

  return {
    total: safeCount(row.total) || fallbackTotal,
    ranking: safeCount(row.ranking),
    latest: safeCount(row.latest),
    lowScore: safeCount(row.lowScore),
  };
}

function normalizePositiveInteger(
  value: unknown,
) {
  const numberValue = Number(value);

  return Number.isSafeInteger(numberValue) &&
    numberValue > 0
    ? numberValue
    : null;
}

export default function AutoReviewReceiver({
  productId,
  disabled = false,
  onReviewsReceived,
}: AutoReviewReceiverProps) {
  const [message, setMessage] =
    useState("");

  const [isSuccess, setIsSuccess] =
    useState(false);

  const hasProcessedRef = useRef(false);

  useEffect(() => {
    if (
      disabled ||
      !productId ||
      hasProcessedRef.current
    ) {
      return;
    }

    const transferredValue = window.name;

    if (!transferredValue) {
      return;
    }

    let payload: TransferPayload;

    try {
      payload = JSON.parse(
        transferredValue,
      ) as TransferPayload;
    } catch (error) {
      console.error(
        "자동 전달 데이터 JSON 읽기 실패:",
        error,
      );

      setIsSuccess(false);
      setMessage(
        "자동 전달 데이터를 읽지 못했습니다.",
      );

      window.name = "";
      return;
    }

    if (
      payload.type !==
      "PROJECT_D_NAVER_REVIEWS"
    ) {
      return;
    }

    hasProcessedRef.current = true;
    window.name = "";

    async function processTransferredData() {
      try {
        if (
          payload.productId &&
          payload.productId !== productId
        ) {
          throw new Error(
            "전달된 리뷰의 제품과 현재 선택한 제품이 다릅니다.",
          );
        }

        const sourceUrl =
          typeof payload.sourceUrl ===
          "string"
            ? payload.sourceUrl.trim()
            : "";

        const checkoutMerchantNo =
          normalizePositiveInteger(
            payload.checkoutMerchantNo,
          );

        const originProductNo =
          normalizePositiveInteger(
            payload.originProductNo,
          );

        if (!sourceUrl) {
          throw new Error(
            "전달된 상품 URL이 없습니다.",
          );
        }

        if (!checkoutMerchantNo) {
          throw new Error(
            "전달된 네이버 판매자 번호가 올바르지 않습니다.",
          );
        }

        if (!originProductNo) {
          throw new Error(
            "전달된 네이버 원상품 번호가 올바르지 않습니다.",
          );
        }

        setMessage(
          "네이버 리뷰 수집 정보를 제품에 저장하는 중입니다.",
        );

        const updateResponse = await fetch(
          "/api/update-product-source",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              productId,
              sourceUrl,
              checkoutMerchantNo,
              originProductNo,
            }),
          },
        );

        const updateResult =
          (await updateResponse.json()) as UpdateSourceResponse;

        if (
          !updateResponse.ok ||
          !updateResult.success
        ) {
          throw new Error(
            updateResult.message ??
              "네이버 리뷰 수집 정보를 저장하지 못했습니다.",
          );
        }

        const reviews = normalizeReviews(
          payload.reviews,
        );

        if (reviews.length === 0) {
          throw new Error(
            "전달된 리뷰 데이터가 비어 있습니다.",
          );
        }

        const collectionStats =
          normalizeCollectionStats(
            payload.collectionStats,
            reviews.length,
          );

        onReviewsReceived(
          reviews.join("\n"),
          collectionStats,
        );

        setIsSuccess(true);
        setMessage(
          collectionStats
            ? `판매자 번호와 원상품 번호를 자동 저장하고, 네이버 리뷰 ${reviews.length}개를 전달받았습니다.`
            : `판매자 번호와 원상품 번호를 자동 저장하고, 네이버 리뷰 ${reviews.length}개를 전달받았습니다.`,
        );
      } catch (error) {
        console.error(
          "자동 상품 정보·리뷰 처리 실패:",
          error,
        );

        setIsSuccess(false);
        setMessage(
          error instanceof Error
            ? error.message
            : "자동 상품 정보와 리뷰를 처리하지 못했습니다.",
        );
      }
    }

    void processTransferredData();
  }, [
    disabled,
    productId,
    onReviewsReceived,
  ]);

  if (!message) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 16,
        borderRadius: 12,
        lineHeight: 1.7,
        background: isSuccess
          ? "#f6fef9"
          : "#fffaeb",
        border: isSuccess
          ? "1px solid #abefc6"
          : "1px solid #fedf89",
        color: isSuccess
          ? "#067647"
          : "#7a5b15",
      }}
    >
      <strong>
        {isSuccess
          ? "상품 정보 및 리뷰 자동 입력 완료"
          : "상품 정보와 리뷰 처리 중"}
      </strong>

      <p style={{ margin: "6px 0 0" }}>
        {message}
      </p>
    </div>
  );
}