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
  dryRun?: boolean;
  pipelineVersion?: string;
  inputFingerprint?: string;
  estimatedOpenAiCalls?: number;
  paidApiCalls?: number;
  dbWrites?: number;
  productId?: string;
  productName?: string;
  paidResponseAudit?: unknown;
};

type DetailAnalysisPlan = {
  productId: string;
  snapshot: unknown;
  inputFingerprint: string;
  estimatedOpenAiCalls: number;
  productName: string;
};

async function readAnalysisResponse(
  response: Response,
) {
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

  return (
    await response.json()
  ) as AnalysisResponse;
}

export default function DetailCaptureReceiver() {
  const [status, setStatus] =
    useState(
      "상품 상세정보 전달 데이터를 확인하고 있습니다.",
    );

  const [isSuccess, setIsSuccess] =
    useState(false);

  const [isError, setIsError] =
    useState(false);

  const [
    isRunningPaidAnalysis,
    setIsRunningPaidAnalysis,
  ] = useState(false);

  const [
    pendingPlan,
    setPendingPlan,
  ] = useState<
    DetailAnalysisPlan | null
  >(null);

  const processedRef =
    useRef(false);

  useEffect(() => {
    if (processedRef.current) {
      return;
    }

    processedRef.current = true;

    async function prepareCapture() {
      try {
        const productId =
          new URLSearchParams(
            window.location.search,
          ).get(
            "productId",
          )?.trim() ?? "";

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

        let payload:
          TransferPayload;

        try {
          payload =
            JSON.parse(
              window.name,
            ) as TransferPayload;
        } catch {
          throw new Error(
            "전달된 상세정보 형식을 읽지 못했습니다.",
          );
        } finally {
          /*
            remount/reload가 유료 분석을 다시 시작할 수 없도록
            브라우저 handoff는 한 번 읽은 즉시 제거한다.
          */
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
          payload.productId !==
            productId
        ) {
          throw new Error(
            "전달된 상품과 현재 분석할 상품이 다릅니다.",
          );
        }

        if (
          !payload.snapshot ||
          typeof payload.snapshot !==
            "object"
        ) {
          throw new Error(
            "수집된 상품 상세정보가 비어 있습니다.",
          );
        }

        setStatus(
          "브라우저 상세정보를 확인했습니다. 유료 호출 없이 AI 분석 비용을 사전검증하는 중입니다.",
        );

        const response =
          await fetch(
            "/api/analyze-product-detail",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  productId,
                  browserSnapshot:
                    payload.snapshot,
                  dryRun: true,
                }),
            },
          );

        const result =
          await readAnalysisResponse(
            response,
          );

        const estimated =
          Number(
            result
              .estimatedOpenAiCalls,
          );

        if (
          !response.ok ||
          !result.success ||
          result.dryRun !== true ||
          result.paidApiCalls !== 0 ||
          !result.inputFingerprint ||
          !Number.isSafeInteger(
            estimated,
          ) ||
          estimated < 1 ||
          estimated > 3
        ) {
          throw new Error(
            result.message ??
              "상세정보 AI 분석 무료 사전검증에 실패했습니다.",
          );
        }

        setPendingPlan({
          productId,
          snapshot:
            payload.snapshot,
          inputFingerprint:
            result.inputFingerprint,
          estimatedOpenAiCalls:
            estimated,
          productName:
            result.productName ??
            "",
        });

        setStatus(
          `무료 사전검증 완료 · ${result.productName ?? "이 제품"} 상세정보 AI 분석은 최대 ${estimated}회의 OpenAI 호출이 필요할 수 있습니다. 아래 버튼을 눌러야만 유료 분석이 시작됩니다.`,
        );
      } catch (error) {
        console.error(
          "상세정보 무료 사전검증 실패:",
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

    void prepareCapture();
  }, []);

  async function runPaidAnalysis() {
    if (
      !pendingPlan ||
      isRunningPaidAnalysis
    ) {
      return;
    }

    const plan =
      pendingPlan;

    /*
      버튼을 누른 뒤에는 같은 계획을 다시 노출하지 않는다.
      요청이 서버에 도달했을 수 있으므로 실패해도 자동 재시도하지 않는다.
    */
    setPendingPlan(
      null,
    );

    setIsRunningPaidAnalysis(
      true,
    );

    setIsError(false);

    setStatus(
      `승인한 상세정보 AI 분석을 실행하는 중입니다. 최대 ${plan.estimatedOpenAiCalls}회이며 자동 재시도하지 않습니다.`,
    );

    try {
      const response =
        await fetch(
          "/api/analyze-product-detail",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                productId:
                  plan.productId,
                browserSnapshot:
                  plan.snapshot,
                inputFingerprint:
                  plan.inputFingerprint,
              }),
          },
        );

      const result =
        await readAnalysisResponse(
          response,
        );

      if (
        !response.ok ||
        !result.success
      ) {
        if (
          Number(
            result.paidApiCalls ??
            0,
          ) > 0
        ) {
          window.sessionStorage.setItem(
            "projectDProductDetailLastFailedPaidResponse",
            JSON.stringify({
              savedAt:
                new Date().toISOString(),
              inputFingerprint:
                plan.inputFingerprint,
              result,
            }),
          );
        }

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
        "상세정보 승인 실행 실패:",
        error,
      );

      setIsError(true);

      setStatus(
        error instanceof Error
          ? `${error.message} 유료 요청이 시작됐을 수 있으므로 자동 재시도하지 않습니다.`
          : "상세정보 분석 중 오류가 발생했습니다. 유료 요청이 시작됐을 수 있으므로 자동 재시도하지 않습니다.",
      );
    } finally {
      setIsRunningPaidAnalysis(
        false,
      );
    }
  }

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

        {pendingPlan ? (
          <button
            type="button"
            onClick={
              runPaidAnalysis
            }
            disabled={
              isRunningPaidAnalysis
            }
            style={{
              marginTop: 20,
              padding:
                "12px 18px",
              border: 0,
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            상세정보 AI 분석 시작
          </button>
        ) : null}

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
