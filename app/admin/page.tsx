"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import Header from "../../components/Header";
import BookmarkletCopyButton from "../../components/BookmarkletCopyButton";
import ProductEditPanel, {
  type EditableProduct,
} from "../../components/ProductEditPanel";
import { supabase } from "../../lib/supabase";

type RegisteredProduct = EditableProduct;

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

const PRODUCT_SELECT_FIELDS =
  "id, category, product_name, source_url, checkout_merchant_no, origin_product_no, review_analysis, created_at, updated_at";

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

  const [deletingId, setDeletingId] =
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

  const isWorking =
    isSaving || isExtracting;

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