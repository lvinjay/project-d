"use client";

import { useState } from "react";

type BookmarkletResponse = {
  success: boolean;
  bookmarkletName?: string;
  bookmarklet?: string;
  message?: string;
};

type BookmarkletCopyButtonProps = {
  productId: string;
  productName: string;
  disabled?: boolean;
};

export default function BookmarkletCopyButton({
  productId,
  productName,
  disabled = false,
}: BookmarkletCopyButtonProps) {
  const [isLoading, setIsLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [isSuccess, setIsSuccess] =
    useState(false);

  async function copyBookmarklet() {
    setIsLoading(true);
    setMessage("");
    setIsSuccess(false);

    try {
      const response = await fetch(
        `/api/review-bookmarklet?productId=${encodeURIComponent(
          productId,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as BookmarkletResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.bookmarklet
      ) {
        throw new Error(
          result.message ??
            "북마크 코드를 만들지 못했습니다.",
        );
      }

      if (!navigator.clipboard?.writeText) {
        throw new Error(
          "이 브라우저에서는 클립보드 복사를 지원하지 않습니다.",
        );
      }

      await navigator.clipboard.writeText(
        result.bookmarklet,
      );

      setIsSuccess(true);
      setMessage(
        `"${result.bookmarkletName ?? productName}" 북마크 코드를 복사했습니다.`,
      );
    } catch (error) {
      console.error(
        "북마크 코드 복사 실패:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "북마크 코드를 복사하지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="secondaryButton"
        onClick={copyBookmarklet}
        disabled={disabled || isLoading}
      >
        {isLoading
          ? "북마크 코드 생성 중..."
          : "북마크 코드 복사"}
      </button>

      {message ? (
        <p
          style={{
            margin: "8px 0 0",
            maxWidth: 280,
            fontSize: 13,
            lineHeight: 1.5,
            color: isSuccess
              ? "#067647"
              : "#b42318",
          }}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}