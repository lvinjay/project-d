"use client";

import {
  useEffect,
  useState,
} from "react";
import Header from "../../components/Header";

type RegisteredProduct = {
  id: string;
  category: string;
  productName: string;
  sourceUrl: string;
  createdAt: string;
};

type ProductDraft = {
  category: string;
  productName: string;
  sourceUrl: string;
};

const STORAGE_KEY =
  "project-d-registered-products";

const initialDraft: ProductDraft = {
  category: "캠핑용 에어컨",
  productName: "",
  sourceUrl: "",
};

function createProductId() {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export default function AdminPage() {
  const [draft, setDraft] =
    useState<ProductDraft>(initialDraft);

  const [registeredProducts, setRegisteredProducts] =
    useState<RegisteredProduct[]>([]);

  const [isLoaded, setIsLoaded] =
    useState(false);

  useEffect(() => {
    try {
      const savedProducts =
        window.localStorage.getItem(STORAGE_KEY);

      if (savedProducts) {
        const parsedProducts =
          JSON.parse(savedProducts);

        if (Array.isArray(parsedProducts)) {
          setRegisteredProducts(
            parsedProducts as RegisteredProduct[],
          );
        }
      }
    } catch (error) {
      console.error(
        "등록 제품 불러오기 실패:",
        error,
      );
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(registeredProducts),
      );
    } catch (error) {
      console.error(
        "등록 제품 저장 실패:",
        error,
      );
    }
  }, [registeredProducts, isLoaded]);

  function updateField(
    field: keyof ProductDraft,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function registerProduct() {
    const category = draft.category.trim();
    const productName =
      draft.productName.trim();
    const sourceUrl = draft.sourceUrl.trim();

    if (!category) {
      alert("카테고리를 입력하세요.");
      return;
    }

    if (!productName) {
      alert("제품명을 입력하세요.");
      return;
    }

    if (!sourceUrl) {
      alert("제품 URL을 입력하세요.");
      return;
    }

    try {
      const parsedUrl = new URL(sourceUrl);

      if (
        parsedUrl.protocol !== "https:" &&
        parsedUrl.protocol !== "http:"
      ) {
        throw new Error(
          "지원하지 않는 URL입니다.",
        );
      }
    } catch {
      alert("올바른 상품 URL을 입력하세요.");
      return;
    }

    const duplicated =
      registeredProducts.some(
        (product) =>
          product.sourceUrl === sourceUrl,
      );

    if (duplicated) {
      alert("이미 등록한 상품 URL입니다.");
      return;
    }

    const newProduct: RegisteredProduct = {
      id: createProductId(),
      category,
      productName,
      sourceUrl,
      createdAt: new Date().toISOString(),
    };

    setRegisteredProducts((current) => [
      ...current,
      newProduct,
    ]);

    setDraft((current) => ({
      ...current,
      productName: "",
      sourceUrl: "",
    }));
  }

  function removeProduct(id: string) {
    const confirmed = window.confirm(
      "이 제품을 삭제할까요?",
    );

    if (!confirmed) {
      return;
    }

    setRegisteredProducts((current) =>
      current.filter(
        (product) => product.id !== id,
      ),
    );
  }

  function clearAllProducts() {
    if (registeredProducts.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      "등록한 제품을 모두 삭제할까요?",
    );

    if (!confirmed) {
      return;
    }

    setRegisteredProducts([]);
  }

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
          카테고리별 주요 제품을 등록한 뒤
          제품 스펙과 리뷰 분석 기능을
          연결합니다.
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
            />
          </div>

          <div className="field">
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
            />
          </div>

          <div className="field">
            <label htmlFor="sourceUrl">
              <span>
                네이버 또는 쿠팡 상품 URL
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
              style={{
                resize: "vertical",
                minHeight: 110,
              }}
            />
          </div>

          <button
            type="button"
            className="primaryButton"
            onClick={registerProduct}
            style={{
              width: "100%",
              marginTop: 12,
            }}
          >
            후보 제품에 추가
          </button>
        </div>

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
              onClick={clearAllProducts}
              disabled={
                registeredProducts.length === 0
              }
            >
              전체 삭제
            </button>
          </div>

          {!isLoaded ? (
            <div
              style={{
                padding: "42px 0 20px",
                textAlign: "center",
                color: "#667085",
              }}
            >
              저장된 제품을 불러오는
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
              아직 등록한 제품이 없습니다.
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
                (product, index) => (
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
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          minWidth: 0,
                        }}
                      >
                        <span className="pill">
                          후보 {index + 1}
                        </span>

                        <h3
                          style={{
                            margin:
                              "12px 0 6px",
                          }}
                        >
                          {product.productName}
                        </h3>

                        <p
                          style={{
                            margin: 0,
                            color: "#667085",
                          }}
                        >
                          {product.category}
                        </p>

                        <a
                          href={product.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "block",
                            marginTop: 12,
                            wordBreak:
                              "break-all",
                          }}
                        >
                          상품 페이지 열기
                        </a>
                      </div>

                      <button
                        type="button"
                        className="secondaryButton"
                        onClick={() =>
                          removeProduct(
                            product.id,
                          )
                        }
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                ),
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
            border: "1px solid #b9d8ff",
          }}
        >
          <strong>저장 방식 안내</strong>

          <p
            style={{
              margin: "8px 0 0",
              lineHeight: 1.7,
              color: "#315b88",
            }}
          >
            현재 제품은 이 브라우저에
            저장됩니다. 새로고침해도
            유지되지만 다른 컴퓨터나
            브라우저와는 공유되지 않습니다.
            이후 실제 데이터베이스로
            교체할 예정입니다.
          </p>
        </div>
      </section>
    </main>
  );
}