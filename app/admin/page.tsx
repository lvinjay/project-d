"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import Header from "../../components/Header";
import MarketCandidateSetup from "../../components/MarketCandidateSetup";
import ProjectDAutomationPanel from "../../components/ProjectDAutomationPanel";
import BookmarkletCopyButton from "../../components/BookmarkletCopyButton";
import DetailBookmarkletCopyButton from "../../components/DetailBookmarkletCopyButton";
import ProductEditPanel, {
  type EditableProduct,
} from "../../components/ProductEditPanel";
import { supabase } from "../../lib/supabase";

type RegisteredProduct = EditableProduct & {
  product_detail_analysis?: Record<string, unknown> | null;
  product_detail_updated_at?: string | null;
  review_raw_data?: {
    reviews?: string[];
    collectionStats?: {
      total: number;
      ranking: number;
      latest: number;
      lowScore: number;
    } | null;
    savedAt?: string;
  } | null;
};

type ProductDraft = {
  category: string;
  productName: string;
  sourceUrl: string;
};

type ExtractProductResponse = {
  success: boolean;
  extracted: boolean;
  message?: string;
  product?: {
    productName?: string | null;
    description?: string | null;
    imageUrl?: string | null;
  };
};

type FetchReviewsResponse = {
  success?: boolean;
  message?: string;
  count?: number;
  reviewTexts?: string[];
  collectionStats?: {
    total: number;
    ranking: number;
    latest: number;
    lowScore: number;
  };
};

type AnalyzeReviewsResponse = {
  success?: boolean;
  message?: string;
  analysis?: Record<string, unknown>;
};

type ProductDetailAnalysisResponse = {
  success: boolean;
  message?: string;
  analysis?: {
    price?: string | null;
    keySpecs?: Array<{ name: string; value: string; evidence?: string }>;
    sellerClaims?: string[];
    differentiators?: string[];
    installationAndUse?: string[];
    warrantyAndService?: string[];
    maintenanceAndConsumables?: string[];
    cautions?: string[];
  };
};

const PRODUCT_SELECT_FIELDS =
  "id, category, product_name, source_url, checkout_merchant_no, origin_product_no, review_analysis, review_raw_data, product_detail_analysis, product_detail_updated_at, created_at, updated_at";

const initialDraft: ProductDraft = {
  category: "캠핑용 에어컨",
  productName: "",
  sourceUrl: "",
};

function hasReviewCollectionInfo(
  product: RegisteredProduct,
) {
  return Boolean(
    product.checkout_merchant_no &&
      product.origin_product_no,
  );
}

export default function AdminPage() {
  const router = useRouter();

  const [draft, setDraft] =
    useState<ProductDraft>(initialDraft);

  const [
    registeredProducts,
    setRegisteredProducts,
  ] = useState<RegisteredProduct[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [isExtracting, setIsExtracting] =
    useState(false);

  const [isGeneratingCriteria, setIsGeneratingCriteria] =
    useState(false);

  const [criteriaMessage, setCriteriaMessage] =
    useState("");

  const [isGeneratingProductScores, setIsGeneratingProductScores] =
    useState(false);

  const [productScoresMessage, setProductScoresMessage] =
    useState("");

  const [isBulkReanalyzingReviews, setIsBulkReanalyzingReviews] =
    useState(false);

  const [bulkReviewMessage, setBulkReviewMessage] =
    useState("");

  const [deletingId, setDeletingId] =
    useState("");

  const [analyzingDetailId, setAnalyzingDetailId] =
    useState("");

  const [editingId, setEditingId] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [extractMessage, setExtractMessage] =
    useState("");

  const [
    extractSucceeded,
    setExtractSucceeded,
  ] = useState(false);

  const loadProducts = useCallback(
    async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const { data, error } = await supabase
          .from("products")
          .select(PRODUCT_SELECT_FIELDS)
          .order("created_at", {
            ascending: false,
          });

        if (error) {
          throw error;
        }

        setRegisteredProducts(
          (data ?? []) as RegisteredProduct[],
        );
      } catch (error) {
        console.error(
          "제품 목록 불러오기 실패:",
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "제품 목록을 불러오지 못했습니다.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  function updateField(
    field: keyof ProductDraft,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));

    if (field === "sourceUrl") {
      setExtractMessage("");
      setExtractSucceeded(false);
    }
  }



  function isValidProductUrl(value: string) {
    try {
      const parsedUrl = new URL(value);

      return (
        parsedUrl.protocol === "https:" ||
        parsedUrl.protocol === "http:"
      );
    } catch {
      return false;
    }
  }

  async function extractProductInfo() {
    const sourceUrl = draft.sourceUrl.trim();

    if (!sourceUrl) {
      alert("먼저 상품 URL을 입력하세요.");
      return;
    }

    if (!isValidProductUrl(sourceUrl)) {
      alert("올바른 상품 URL을 입력하세요.");
      return;
    }

    setIsExtracting(true);
    setExtractMessage("");
    setExtractSucceeded(false);
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/extract-product",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            url: sourceUrl,
          }),
        },
      );

      const result =
        (await response.json()) as ExtractProductResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ??
            "상품 정보 추출에 실패했습니다.",
        );
      }

      const extractedName =
        result.product?.productName?.trim() ??
        "";

      if (
        result.extracted &&
        extractedName
      ) {
        setDraft((current) => ({
          ...current,
          productName: extractedName,
        }));

        setExtractSucceeded(true);

        setExtractMessage(
          "제품명을 자동으로 불러왔습니다. 정확한 제품명인지 확인한 뒤 등록하세요.",
        );

        return;
      }

      setExtractSucceeded(false);

      setExtractMessage(
        result.message ??
          "제품명을 자동으로 불러오지 못했습니다. 제품명을 직접 입력해 주세요.",
      );
    } catch (error) {
      console.error(
        "상품 정보 추출 실패:",
        error,
      );

      setExtractSucceeded(false);

      setExtractMessage(
        error instanceof Error
          ? error.message
          : "제품명을 자동으로 불러오지 못했습니다. 직접 입력해 주세요.",
      );
    } finally {
      setIsExtracting(false);
    }
  }

  async function analyzeProductDetail(
    product: RegisteredProduct,
  ) {
    setAnalyzingDetailId(product.id);
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/analyze-product-detail",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId: product.id,
          }),
        },
      );

      const contentType =
        response.headers.get("content-type") ?? "";

      if (!contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          `상세정보 분석 API가 JSON이 아닌 응답을 반환했습니다. (${response.status}) ${text.slice(0, 120)}`,
        );
      }

      const result =
        (await response.json()) as ProductDetailAnalysisResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ??
            "제품 상세정보 분석에 실패했습니다.",
        );
      }

      alert(
        result.message ??
          "제품 상세정보 AI 분석을 완료했습니다.",
      );

      await loadProducts();
    } catch (error) {
      console.error(
        "제품 상세정보 분석 실패:",
        error,
      );

      alert(
        error instanceof Error
          ? error.message
          : "제품 상세정보 분석에 실패했습니다.",
      );
    } finally {
      setAnalyzingDetailId("");
    }
  }

  async function registerProduct() {
    const category = draft.category.trim();

    const productName =
      draft.productName.trim();

    const sourceUrl =
      draft.sourceUrl.trim();

    if (!category) {
      alert("카테고리를 입력하세요.");
      return;
    }

    if (!productName) {
      alert(
        "제품명을 입력하거나 URL에서 제품명을 불러오세요.",
      );
      return;
    }

    if (!sourceUrl) {
      alert("제품 URL을 입력하세요.");
      return;
    }

    if (!isValidProductUrl(sourceUrl)) {
      alert("올바른 상품 URL을 입력하세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("products")
        .insert({
          category,
          product_name: productName,
          source_url: sourceUrl,
          checkout_merchant_no: null,
          origin_product_no: null,
        })
        .select(PRODUCT_SELECT_FIELDS)
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error(
            "이미 등록된 상품 URL입니다.",
          );
        }

        throw error;
      }

      setRegisteredProducts(
        (current) => [
          data as RegisteredProduct,
          ...current,
        ],
      );

      setDraft((current) => ({
        ...current,
        productName: "",
        sourceUrl: "",
      }));

      setExtractMessage("");
      setExtractSucceeded(false);
    } catch (error) {
      console.error(
        "제품 등록 실패:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "제품 등록에 실패했습니다.";

      setErrorMessage(message);
      alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function removeProduct(
    product: RegisteredProduct,
  ) {
    const confirmed = window.confirm(
      `"${product.product_name}" 제품을 삭제할까요?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(product.id);
    setErrorMessage("");

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", product.id);

      if (error) {
        throw error;
      }

      setRegisteredProducts((current) =>
        current.filter(
          (item) => item.id !== product.id,
        ),
      );

      if (editingId === product.id) {
        setEditingId("");
      }
    } catch (error) {
      console.error(
        "제품 삭제 실패:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "제품 삭제에 실패했습니다.";

      setErrorMessage(message);
      alert(message);
    } finally {
      setDeletingId("");
    }
  }

  function handleProductSaved(
    savedProduct: RegisteredProduct,
  ) {
    setRegisteredProducts((current) =>
      current.map((product) =>
        product.id === savedProduct.id
          ? savedProduct
          : product,
      ),
    );

    setEditingId("");
    setErrorMessage("");
  }

  function toggleProductEdit(
    productId: string,
  ) {
    setEditingId((current) =>
      current === productId
        ? ""
        : productId,
    );
  }

  function openReviewAnalysis(
    product: RegisteredProduct,
  ) {
    router.push(
      `/admin/review?id=${encodeURIComponent(
        product.id,
      )}`,
    );
  }

  async function bulkReanalyzeReviewEvidence() {
    const category = draft.category.trim();

    if (!category) {
      alert("카테고리를 입력하세요.");
      return;
    }

    const categoryProducts = registeredProducts.filter(
      (product) => product.category === category,
    );

    const targets = categoryProducts.filter(
      (product) =>
        Array.isArray(product.review_raw_data?.reviews) &&
        (product.review_raw_data?.reviews?.length ?? 0) > 0,
    );

    if (targets.length === 0) {
      alert(
        `"${category}" 카테고리에 재분석용 리뷰 원문이 저장된 제품이 없습니다.`,
      );
      return;
    }

    if (targets.length !== categoryProducts.length) {
      const missingNames = categoryProducts
        .filter(
          (product) =>
            !Array.isArray(product.review_raw_data?.reviews) ||
            (product.review_raw_data?.reviews?.length ?? 0) === 0,
        )
        .map((product) => product.product_name)
        .join(", ");

      alert(
        `리뷰 원문이 없는 제품이 있어 일괄 재분석을 중단합니다.\n\n${missingNames}\n\n해당 제품의 리뷰를 먼저 한 번 수집해 저장해 주세요.`,
      );
      return;
    }

    setIsBulkReanalyzingReviews(true);
    setBulkReviewMessage("");
    setErrorMessage("");

    let completed = 0;

    try {
      for (const product of targets) {
        const reviews =
          product.review_raw_data?.reviews ?? [];
        const savedCollectionStats =
          product.review_raw_data?.collectionStats ?? null;

        setBulkReviewMessage(
          `${targets.length}개 중 ${completed + 1}번째: ${product.product_name} · DB 저장 리뷰 ${reviews.length}개 AI 재분석 중...`,
        );

        const analyzeResponse = await fetch(
          "/api/analyze-reviews",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              productName: product.product_name,
              category: product.category,
              reviews,
              collectionStats: savedCollectionStats,
            }),
          },
        );

        const analyzeResult =
          (await analyzeResponse.json()) as AnalyzeReviewsResponse;

        if (
          !analyzeResponse.ok ||
          !analyzeResult.success ||
          !analyzeResult.analysis
        ) {
          throw new Error(
            `${product.product_name}: ${
              analyzeResult.message ??
              "저장된 리뷰 원문의 AI 재분석에 실패했습니다."
            }`,
          );
        }

        const { error: updateError } =
          await supabase
            .from("products")
            .update({
              review_analysis:
                analyzeResult.analysis,
              updated_at:
                new Date().toISOString(),
            })
            .eq("id", product.id);

        if (updateError) {
          throw updateError;
        }

        completed += 1;
      }

      setBulkReviewMessage(
        `${completed}개 제품의 저장 리뷰 재분석 완료. 제품별 점수를 새 근거로 다시 계산하는 중...`,
      );

      const scoreResponse = await fetch(
        "/api/generate-product-scores",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ category }),
        },
      );

      const scoreResult =
        (await scoreResponse.json()) as {
          success?: boolean;
          message?: string;
        };

      if (!scoreResponse.ok || !scoreResult.success) {
        throw new Error(
          scoreResult.message ??
            "리뷰 재분석은 완료됐지만 제품별 점수 재생성에 실패했습니다.",
        );
      }

      setBulkReviewMessage(
        `${completed}개 제품 완료 · DB에 저장된 리뷰 원문으로 재분석 · 제품별 점수까지 갱신했습니다. 네이버 리뷰 재수집은 하지 않았습니다.`,
      );

      await loadProducts();
    } catch (error) {
      console.error(
        "리뷰 근거 일괄 재분석 실패:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "리뷰 근거 일괄 재분석에 실패했습니다.";

      setErrorMessage(message);
      alert(message);
    } finally {
      setIsBulkReanalyzingReviews(false);
    }
  }

  async function generateCategoryCriteria() {
    const category = draft.category.trim();

    if (!category) {
      alert("카테고리를 입력하세요.");
      return;
    }

    const categoryProducts = registeredProducts.filter(
      (product) => product.category === category,
    );

    if (categoryProducts.length < 3) {
      alert(
        `"${category}" 카테고리 제품을 최소 3개 등록한 뒤 실행하세요.`,
      );
      return;
    }

    const analyzedCount = categoryProducts.filter(
      (product) => product.review_analysis,
    ).length;

    if (analyzedCount < 3) {
      alert(
        `"${category}" 카테고리에서 리뷰 분석 완료 제품이 최소 3개 필요합니다.`,
      );
      return;
    }

    setIsGeneratingCriteria(true);
    setCriteriaMessage("");
    setErrorMessage("");

    try {
      const response = await fetch(
        "/api/generate-category-criteria",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ category }),
        },
      );

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        criteria?: Array<{ label?: string }>;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ??
            "구매기준 자동 생성에 실패했습니다.",
        );
      }

      const labels = Array.isArray(result.criteria)
        ? result.criteria
            .map((criterion) => criterion.label?.trim())
            .filter(Boolean)
            .join(" · ")
        : "";

      setCriteriaMessage(
        labels
          ? `자동 생성 완료: ${labels}`
          : result.message ?? "구매기준 자동 생성이 완료되었습니다.",
      );
    } catch (error) {
      console.error("구매기준 자동 생성 실패:", error);

      const message =
        error instanceof Error
          ? error.message
          : "구매기준 자동 생성에 실패했습니다.";

      setErrorMessage(message);
      alert(message);
    } finally {
      setIsGeneratingCriteria(false);
    }
  }

  async function generateProductScores() {
    const category = draft.category.trim();

    if (!category) {
      alert("카테고리를 입력하세요.");
      return;
    }

    const categoryProducts = registeredProducts.filter(
      (product) => product.category === category,
    );

    if (categoryProducts.length < 2) {
      alert(`"${category}" 카테고리 제품을 최소 2개 등록한 뒤 실행하세요.`);
      return;
    }

    setIsGeneratingProductScores(true);
    setProductScoresMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/generate-product-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          `제품별 점수 생성 API가 JSON이 아닌 응답을 반환했습니다. (${response.status}) ${text.slice(0, 120)}`,
        );
      }

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        updatedCount?: number;
        productCount?: number;
        cacheHit?: boolean;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "제품별 점수 자동 생성에 실패했습니다.");
      }

      const count = result.updatedCount ?? result.productCount;

      setProductScoresMessage(
        result.cacheHit
          ? result.message ??
              "변경된 데이터가 없어 기존 제품별 점수를 그대로 사용했습니다."
          : result.message ??
              (typeof count === "number"
                ? `제품 ${count}개의 비교 점수를 새 기준으로 생성했습니다.`
                : "제품별 비교 점수 생성이 완료되었습니다."),
      );
    } catch (error) {
      console.error("제품별 점수 자동 생성 실패:", error);
      const message =
        error instanceof Error ? error.message : "제품별 점수 자동 생성에 실패했습니다.";
      setErrorMessage(message);
      alert(message);
    } finally {
      setIsGeneratingProductScores(false);
    }
  }

  const isWorking =
    isSaving ||
    isExtracting ||
    isGeneratingCriteria ||
    isGeneratingProductScores ||
    isBulkReanalyzingReviews;

  return (
    <main>
      <Header />

      <section className="container">
        <span className="heroBadge">
          Project D 관리자
        </span>

        <h1
          className="sectionTitle"
          style={{ marginTop: 18 }}
        >
          분석할 제품을 등록하세요
        </h1>

        <p className="sectionLead">
          상품 URL과 짧은 제품명만 등록하면 됩니다. 네이버 리뷰 수집 번호는 북마크 실행 시 자동으로 확인하고 저장합니다.
        </p>

        <MarketCandidateSetup />

        <ProjectDAutomationPanel />

        <div
          className="card"
          style={{
            marginTop: 28,
            padding: 28,
          }}
        >
          <div className="field">
            <label htmlFor="category">
              <span>카테고리</span>
            </label>

            <input
              id="category"
              className="textInput"
              value={draft.category}
              onChange={(event) =>
                updateField(
                  "category",
                  event.target.value,
                )
              }
              placeholder="예: 캠핑용 에어컨"
              disabled={isWorking}
            />
          </div>

          <div className="field">
            <label htmlFor="sourceUrl">
              <span>
                네이버 상품 URL
              </span>
            </label>

            <textarea
              id="sourceUrl"
              className="textInput"
              value={draft.sourceUrl}
              onChange={(event) =>
                updateField(
                  "sourceUrl",
                  event.target.value,
                )
              }
              placeholder="https://brand.naver.com/..."
              rows={4}
              disabled={isWorking}
              style={{
                resize: "vertical",
                minHeight: 110,
              }}
            />
          </div>

          <button
            type="button"
            className="secondaryButton"
            onClick={extractProductInfo}
            disabled={
              isWorking ||
              !draft.sourceUrl.trim()
            }
            style={{
              width: "100%",
              marginTop: 4,
            }}
          >
            {isExtracting
              ? "URL에서 제품 정보를 확인하는 중..."
              : "URL에서 제품명 불러오기"}
          </button>

          {extractMessage ? (
            <div
              style={{
                marginTop: 14,
                padding: 16,
                borderRadius: 12,
                border: extractSucceeded
                  ? "1px solid #abefc6"
                  : "1px solid #fedf89",
                background: extractSucceeded
                  ? "#f6fef9"
                  : "#fffaeb",
                color: extractSucceeded
                  ? "#067647"
                  : "#7a5b15",
                lineHeight: 1.7,
              }}
            >
              <strong>
                {extractSucceeded
                  ? "자동 추출 성공"
                  : "자동 추출 안내"}
              </strong>

              <p
                style={{
                  margin: "6px 0 0",
                }}
              >
                {extractMessage}
              </p>
            </div>
          ) : null}

          <div
            className="field"
            style={{ marginTop: 20 }}
          >
            <label htmlFor="productName">
              <span>제품명</span>
            </label>

            <input
              id="productName"
              className="textInput"
              value={draft.productName}
              onChange={(event) =>
                updateField(
                  "productName",
                  event.target.value,
                )
              }
              placeholder="예: 브리즐 이동식 캠핑 에어컨"
              disabled={isWorking}
            />
          </div>

          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 12,
              background: "#eef6ff",
              border: "1px solid #b9d8ff",
              color: "#315b88",
              lineHeight: 1.7,
            }}
          >
            상품 URL과 짧은 제품명만 등록하세요. 판매자 번호와 원상품 번호는 상품페이지에서 북마크를 실행할 때 자동으로 확인하고 저장합니다.
          </div>

          <button
            type="button"
            className="primaryButton"
            onClick={registerProduct}
            disabled={isWorking}
            style={{
              width: "100%",
              marginTop: 20,
            }}
          >
            {isSaving
              ? "데이터베이스에 저장하는 중..."
              : "제품 등록"}
          </button>
        </div>

        {errorMessage ? (
          <div
            className="card"
            style={{
              marginTop: 20,
              padding: 20,
              background: "#fff4f4",
              border:
                "1px solid #f2b8b5",
            }}
          >
            <strong>
              오류가 발생했습니다.
            </strong>

            <p
              style={{
                margin: "8px 0 0",
                color: "#b42318",
                lineHeight: 1.7,
              }}
            >
              {errorMessage}
            </p>
          </div>
        ) : null}

        <div
          className="card"
          style={{
            marginTop: 24,
            padding: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>
                등록된 제품
              </h2>

              <p
                style={{
                  margin: "8px 0 0",
                  color: "#667085",
                }}
              >
                현재{" "}
                {registeredProducts.length}개
                제품
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="secondaryButton"
                onClick={() =>
                  void generateCategoryCriteria()
                }
                disabled={isLoading || isGeneratingCriteria || isBulkReanalyzingReviews}
              >
                {isGeneratingCriteria
                  ? "AI가 구매기준 분석 중..."
                  : "AI 구매기준 자동 생성"}
              </button>

              <button
                type="button"
                className="secondaryButton"
                onClick={() =>
                  void bulkReanalyzeReviewEvidence()
                }
                disabled={
                  isLoading ||
                  isGeneratingCriteria ||
                  isGeneratingProductScores ||
                  isBulkReanalyzingReviews
                }
              >
                {isBulkReanalyzingReviews
                  ? "리뷰 근거 일괄 재분석 중..."
                  : "리뷰 근거 일괄 재분석"}
              </button>

              <button
                type="button"
                className="secondaryButton"
                onClick={() => void generateProductScores()}
                disabled={
                  isLoading ||
                  isGeneratingCriteria ||
                  isGeneratingProductScores ||
                  isBulkReanalyzingReviews
                }
              >
                {isGeneratingProductScores
                  ? "AI가 제품별 점수 계산 중..."
                  : "AI 제품별 점수 자동 생성"}
              </button>

              <button
                type="button"
                className="secondaryButton"
                onClick={() =>
                  void loadProducts()
                }
                disabled={isLoading}
              >
                {isLoading
                  ? "불러오는 중..."
                  : "목록 새로고침"}
              </button>
            </div>
          </div>

          {bulkReviewMessage ? (
            <div
              style={{
                marginTop: 18,
                padding: 16,
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #d0d5dd",
                color: "#344054",
                lineHeight: 1.7,
              }}
            >
              <strong>리뷰 근거 일괄 재분석</strong>
              <p style={{ margin: "6px 0 0" }}>
                {bulkReviewMessage}
              </p>
            </div>
          ) : null}

          {criteriaMessage ? (
            <div
              style={{
                marginTop: 18,
                padding: 16,
                borderRadius: 12,
                background: "#f0f9ff",
                border: "1px solid #b9e6fe",
                color: "#026aa2",
                lineHeight: 1.7,
              }}
            >
              <strong>AI 구매기준 생성 완료</strong>
              <p style={{ margin: "6px 0 0" }}>
                {criteriaMessage}
              </p>
              <p style={{ margin: "6px 0 0", color: "#475467" }}>
                신버전 Advisor를 새로고침하면 새 기준을 확인할 수 있습니다.
              </p>
            </div>
          ) : null}

          {productScoresMessage ? (
            <div
              style={{
                marginTop: 18,
                padding: 16,
                borderRadius: 12,
                background: "#f6fef9",
                border: "1px solid #abefc6",
                color: "#067647",
                lineHeight: 1.7,
              }}
            >
              <strong>AI 제품별 점수 생성 완료</strong>
              <p style={{ margin: "6px 0 0" }}>{productScoresMessage}</p>
              <p style={{ margin: "6px 0 0", color: "#475467" }}>
                데이터가 변경된 경우에만 AI가 전체 제품을 다시 평가합니다.
              </p>
            </div>
          ) : null}

          {isLoading ? (
            <div
              style={{
                padding: "42px 0 20px",
                textAlign: "center",
                color: "#667085",
              }}
            >
              Supabase에서 제품을 불러오는
              중입니다.
            </div>
          ) : registeredProducts.length ===
            0 ? (
            <div
              style={{
                padding: "42px 0 20px",
                textAlign: "center",
                color: "#667085",
              }}
            >
              아직 등록된 제품이 없습니다.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 14,
                marginTop: 24,
              }}
            >
              {registeredProducts.map(
                (product, index) => {
                  const collectionReady =
                    hasReviewCollectionInfo(
                      product,
                    );

                  const isEditing =
                    editingId === product.id;

                  return (
                    <article
                      key={product.id}
                      style={{
                        padding: 20,
                        border:
                          "1px solid #e4e7ec",
                        borderRadius: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "flex-start",
                          gap: 18,
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span className="pill">
                              후보 {index + 1}
                            </span>

                            {product.review_analysis ? (
                              <span className="pill">
                                리뷰 분석 완료
                              </span>
                            ) : null}

                            {product.product_detail_analysis ? (
                              <span className="pill">
                                상세정보 분석 완료
                              </span>
                            ) : null}
                          </div>

                          <h3
                            style={{
                              margin:
                                "12px 0 6px",
                            }}
                          >
                            {
                              product.product_name
                            }
                          </h3>

                          <p
                            style={{
                              margin: 0,
                              color: "#667085",
                            }}
                          >
                            {product.category}
                          </p>

                          {collectionReady ? (
                            <p
                              style={{
                                margin:
                                  "10px 0 0",
                                color: "#067647",
                                fontWeight: 700,
                              }}
                            >
                              리뷰 수집 정보 등록
                              완료
                            </p>
                          ) : (
                            <p
                              style={{
                                margin:
                                  "10px 0 0",
                                color: "#b42318",
                                fontWeight: 700,
                              }}
                            >
                              리뷰 수집 번호
                              미등록
                            </p>
                          )}

                          {collectionReady ? (
                            <p
                              style={{
                                margin:
                                  "8px 0 0",
                                color: "#667085",
                                fontSize: 13,
                                lineHeight: 1.6,
                              }}
                            >
                              판매자 번호:{" "}
                              {
                                product.checkout_merchant_no
                              }
                              <br />
                              원상품 번호:{" "}
                              {
                                product.origin_product_no
                              }
                            </p>
                          ) : null}

                          <a
                            href={
                              product.source_url
                            }
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display:
                                "inline-block",
                              marginTop: 12,
                              wordBreak:
                                "break-all",
                            }}
                          >
                            상품 페이지 열기
                          </a>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            alignItems:
                              "flex-start",
                          }}
                        >
                          <DetailBookmarkletCopyButton
                            productId={product.id}
                            productName={product.product_name}
                            hasAnalysis={Boolean(
                              product.product_detail_analysis,
                            )}
                            disabled={deletingId === product.id}
                          />

                          <button
                            type="button"
                            className="primaryButton"
                            onClick={() =>
                              openReviewAnalysis(
                                product,
                              )
                            }
                            disabled={
                              deletingId ===
                              product.id
                            }
                          >
                            리뷰 분석
                          </button>

                          <BookmarkletCopyButton
                            productId={product.id}
                            productName={product.product_name}
                            disabled={deletingId === product.id}
                          />

                          <button
                            type="button"
                            className="secondaryButton"
                            onClick={() =>
                              toggleProductEdit(
                                product.id,
                              )
                            }
                            disabled={
                              deletingId ===
                              product.id
                            }
                          >
                            {isEditing
                              ? "수정 닫기"
                              : "제품 수정"}
                          </button>

                          <button
                            type="button"
                            className="secondaryButton"
                            onClick={() =>
                              void removeProduct(
                                product,
                              )
                            }
                            disabled={
                              deletingId ===
                              product.id
                            }
                          >
                            {deletingId ===
                            product.id
                              ? "삭제 중..."
                              : "삭제"}
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <ProductEditPanel
                          product={product}
                          onSaved={
                            handleProductSaved
                          }
                          onCancel={() =>
                            setEditingId("")
                          }
                        />
                      ) : null}
                    </article>
                  );
                },
              )}
            </div>
          )}
        </div>

        <div
          className="card"
          style={{
            marginTop: 24,
            padding: 20,
            background: "#eef6ff",
            border:
              "1px solid #b9d8ff",
          }}
        >
          <strong>
            제품 등록 및 리뷰 자동 분석
          </strong>

          <p
            style={{
              margin: "8px 0 0",
              lineHeight: 1.7,
              color: "#315b88",
            }}
          >
            제품 정보를 잘못 입력한 경우
            삭제하지 않고 제품 수정 버튼에서
            바로 고칠 수 있습니다. 판매자
            번호나 원상품 번호를 수정한 뒤에는
            해당 제품의 북마크 코드를 다시
            복사해 기존 북마크 URL을
            교체해야 합니다.
          </p>
        </div>
      </section>
    </main>
  );
}

