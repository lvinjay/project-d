"use client";

import { useState } from "react";

type DetailBookmarkletResponse = {
  success: boolean;
  bookmarkletName?: string;
  bookmarklet?: string;
  message?: string;
};

type Props = {
  productId: string;
  productName: string;
  hasAnalysis?: boolean;
  disabled?: boolean;
};

export default function DetailBookmarkletCopyButton({
  productId,
  productName,
  hasAnalysis = false,
  disabled = false,
}: Props) {
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
        `/api/detail-bookmarklet?productId=${encodeURIComponent(
          productId,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const contentType =
        response.headers.get("content-type") ?? "";

      if (!contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          `상세정보 수집 코드 API가 JSON이 아닌 응답을 반환했습니다. (${response.status}) ${text.slice(0, 100)}`,
        );
      }

      const result =
        (await response.json()) as DetailBookmarkletResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.bookmarklet
      ) {
        throw new Error(
          result.message ??
            "상세정보 수집 코드를 만들지 못했습니다.",
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
        `"${result.bookmarkletName ?? productName}" 상세정보 수집 코드를 복사했습니다.`,
      );
    } catch (error) {
      console.error(
        "상세정보 수집 코드 복사 실패:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "상세정보 수집 코드를 복사하지 못했습니다.",
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
          ? "상세 수집 코드 생성 중..."
          : hasAnalysis
            ? "상세정보 다시 수집"
            : "상세정보 수집 코드 복사"}
      </button>

      {message ? (
        <p
          style={{
            margin: "8px 0 0",
            maxWidth: 300,
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
