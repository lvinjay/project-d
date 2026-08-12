"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

type TransferPayload = {
  type?: string;
  productId?: string;
  snapshot?: unknown;
};

type AnalysisResponse = {
  success: boolean;
  message?: string;
};

export default function DetailCaptureReceiver() {
  const [status, setStatus] =
    useState(
      "상품 상세정보 전달 데이터를 확인하고 있습니다.",
    );
  const [isSuccess, setIsSuccess] =
    useState(false);
  const [isError, setIsError] =
    useState(false);

  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) {
      return;
    }

    processedRef.current = true;

    async function processCapture() {
      try {
        const productId =
          new URLSearchParams(
            window.location.search,
          ).get("productId")?.trim() ?? "";

        if (!productId) {
          throw new Error(
            "productId가 없습니다.",
          );
        }

        if (!window.name) {
          throw new Error(
            "상품페이지에서 전달된 상세정보가 없습니다. 관리자에서 상세정보 수집 코드를 복사한 뒤 상품페이지에서 실행해 주세요.",
          );
        }

        let payload: TransferPayload;

        try {
          payload = JSON.parse(
            window.name,
          ) as TransferPayload;
        } catch {
          throw new Error(
            "전달된 상세정보 형식을 읽지 못했습니다.",
          );
        } finally {
          window.name = "";
        }

        if (
          payload.type !==
          "PROJECT_D_PRODUCT_DETAIL"
        ) {
          throw new Error(
            "Project D 상세정보 데이터가 아닙니다.",
          );
        }

        if (
          payload.productId &&
          payload.productId !== productId
        ) {
          throw new Error(
            "전달된 상품과 현재 분석할 상품이 다릅니다.",
          );
        }

        if (
          !payload.snapshot ||
          typeof payload.snapshot !== "object"
        ) {
          throw new Error(
            "수집된 상품 상세정보가 비어 있습니다.",
          );
        }

        setStatus(
          "브라우저에서 수집한 상세정보를 AI가 분석하고 Supabase에 저장하고 있습니다.",
        );

        const response = await fetch(
          "/api/analyze-product-detail",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              productId,
              browserSnapshot:
                payload.snapshot,
            }),
          },
        );

        const contentType =
          response.headers.get(
            "content-type",
          ) ?? "";

        if (
          !contentType.includes(
            "application/json",
          )
        ) {
          const text =
            await response.text();

          throw new Error(
            `분석 API가 JSON이 아닌 응답을 반환했습니다. (${response.status}) ${text.slice(0, 120)}`,
          );
        }

        const result =
          (await response.json()) as AnalysisResponse;

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.message ??
              "상품 상세정보 분석에 실패했습니다.",
          );
        }

        setIsSuccess(true);
        setStatus(
          result.message ??
            "상품 상세정보 분석과 저장을 완료했습니다. 이 창을 닫아도 됩니다.",
        );
      } catch (error) {
        console.error(
          "상세정보 자동 처리 실패:",
          error,
        );

        setIsError(true);
        setStatus(
          error instanceof Error
            ? error.message
            : "상세정보 처리 중 오류가 발생했습니다.",
        );
      }
    }

    void processCapture();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "72px 24px",
        background: "#f8fafc",
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: 32,
          borderRadius: 18,
          background: "#fff",
          border: "1px solid #e4e7ec",
        }}
      >
        <h1
          style={{
            marginTop: 0,
            fontSize: 28,
          }}
        >
          Project D 상품 상세정보 분석
        </h1>

        <p
          style={{
            marginBottom: 0,
            lineHeight: 1.8,
            color: isError
              ? "#b42318"
              : isSuccess
                ? "#067647"
                : "#475467",
          }}
        >
          {status}
        </p>

        {isSuccess ? (
          <p
            style={{
              marginTop: 20,
              fontWeight: 700,
            }}
          >
            완료되었습니다. 관리자 페이지를 새로고침하면
            ‘상세정보 분석 완료’ 표시를 확인할 수 있습니다.
          </p>
        ) : null}
      </div>
    </main>
  );
}
