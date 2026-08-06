"use client";

import { useState } from "react";

type ClipboardReviewLoaderProps = {
  disabled?: boolean;
  onReviewsLoaded: (reviewText: string) => void;
};

function normalizeClipboardReviews(value: string) {
  const reviews = value
    .split(/\r?\n/)
    .map((review) =>
      review.replace(/\s+/g, " ").trim(),
    )
    .filter((review) => review.length > 0);

  return [...new Set(reviews)].slice(0, 100);
}

export default function ClipboardReviewLoader({
  disabled = false,
  onReviewsLoaded,
}: ClipboardReviewLoaderProps) {
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] =
    useState(false);
  const [isReading, setIsReading] =
    useState(false);

  async function loadFromClipboard() {
    setIsReading(true);
    setMessage("");
    setIsSuccess(false);

    try {
      if (!navigator.clipboard?.readText) {
        throw new Error(
          "이 브라우저에서는 클립보드 자동 읽기를 지원하지 않습니다.",
        );
      }

      const clipboardText =
        await navigator.clipboard.readText();

      const reviews =
        normalizeClipboardReviews(clipboardText);

      if (reviews.length === 0) {
        throw new Error(
          "클립보드에서 리뷰를 찾지 못했습니다. 네이버 상품페이지에서 북마크를 먼저 실행해 주세요.",
        );
      }

      onReviewsLoaded(reviews.join("\n"));

      setIsSuccess(true);
      setMessage(
        `클립보드에서 리뷰 ${reviews.length}개를 불러왔습니다.`,
      );
    } catch (error) {
      console.error(
        "클립보드 리뷰 불러오기 실패:",
        error,
      );

      setMessage(
        error instanceof Error
          ? `${error.message} 권한 창이 뜨면 허용을 눌러 주세요.`
          : "클립보드에서 리뷰를 불러오지 못했습니다.",
      );
    } finally {
      setIsReading(false);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <button
        type="button"
        className="secondaryButton"
        onClick={loadFromClipboard}
        disabled={disabled || isReading}
        style={{ width: "100%" }}
      >
        {isReading
          ? "클립보드 확인 중..."
          : "클립보드에서 리뷰 불러오기"}
      </button>

      {message ? (
        <div
          style={{
            marginTop: 12,
            padding: 14,
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
          {message}
        </div>
      ) : null}
    </div>
  );
}