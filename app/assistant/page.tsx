"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import Header from "../../components/Header";

type ReviewPoint = {
  topic: string;
  summary: string;
  evidenceCount: number;
};

type ReviewAnalysis = {
  productName: string;
  reviewCount: number;
  summary: string;
  positivePoints: ReviewPoint[];
  negativePoints: ReviewPoint[];
  cautions: string[];
  bestFor: string[];
  notFor: string[];
  confidenceScore: number;
};

type CatalogProduct = {
  id: string;
  category: string;
  product_name: string;
  source_url: string;
  review_analysis: ReviewAnalysis | null;
  created_at: string;
  updated_at: string;
};

type CatalogResponse = {
  success: boolean;
  count: number;
  products: CatalogProduct[];
  message?: string;
};

function AssistantContent() {
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(
    searchParams.get("q") ?? "",
  );

  const [products, setProducts] = useState<
    CatalogProduct[]
  >([]);

  const [selectedProductId, setSelectedProductId] =
    useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          "/api/catalog-products?analyzedOnly=true",
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const result =
          (await response.json()) as CatalogResponse;

        if (!response.ok || !result.success) {
          throw new Error(
            result.message ??
              "분석된 제품을 불러오지 못했습니다.",
          );
        }

        const nextProducts = Array.isArray(
          result.products,
        )
          ? result.products
          : [];

        setProducts(nextProducts);

        if (
          nextProducts.length > 0 &&
          !selectedProductId
        ) {
          setSelectedProductId(nextProducts[0].id);
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Assistant 제품 불러오기 실패:",
          error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "제품을 불러오는 중 오류가 발생했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      controller.abort();
    };
  }, [selectedProductId]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .toLowerCase();

    if (!normalizedQuery) {
      return products;
    }

    return products.filter((product) => {
      return (
        product.product_name
          .toLowerCase()
          .includes(normalizedQuery) ||
        product.category
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [products, query]);

  const selectedProduct = useMemo(() => {
    return (
      filteredProducts.find(
        (product) =>
          product.id === selectedProductId,
      ) ??
      filteredProducts[0] ??
      null
    );
  }, [filteredProducts, selectedProductId]);

  const analysis =
    selectedProduct?.review_analysis ?? null;

  return (
    <main>
      <Header />

      <section className="container">
        <span className="heroBadge">
          Project D Assistant
        </span>

        <h1
          className="sectionTitle"
          style={{ marginTop: 18 }}
        >
          실제 리뷰 분석 결과
        </h1>

        <p className="sectionLead">
          네이버 실제 리뷰를 AI가 분석해 저장한
          결과를 제품별로 확인할 수 있습니다.
        </p>

        <div
          className="card"
          style={{
            marginTop: 28,
            padding: 24,
          }}
        >
          <label
            htmlFor="assistantSearch"
            style={{
              display: "block",
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            제품 검색
          </label>

          <input
            id="assistantSearch"
            className="textInput"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="제품명 또는 카테고리를 입력하세요."
          />
        </div>

        {isLoading ? (
          <div
            className="card"
            style={{
              marginTop: 24,
              padding: 40,
              textAlign: "center",
            }}
          >
            분석된 제품을 불러오는 중입니다.
          </div>
        ) : errorMessage ? (
          <div
            className="card"
            style={{
              marginTop: 24,
              padding: 24,
              background: "#fff4f4",
              border: "1px solid #f2b8b5",
            }}
          >
            <strong>오류가 발생했습니다.</strong>

            <p
              style={{
                margin: "8px 0 0",
                color: "#b42318",
              }}
            >
              {errorMessage}
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div
            className="card"
            style={{
              marginTop: 24,
              padding: 40,
              textAlign: "center",
            }}
          >
            <h2>분석된 제품이 없습니다.</h2>

            <p className="sectionLead">
              관리자 페이지에서 제품 리뷰 분석을
              먼저 완료해 주세요.
            </p>
          </div>
        ) : (
          <>
            <div
              className="card"
              style={{
                marginTop: 24,
                padding: 24,
              }}
            >
              <label
                htmlFor="productSelect"
                style={{
                  display: "block",
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                분석 결과를 볼 제품
              </label>

              <select
                id="productSelect"
                className="selectInput"
                value={
                  selectedProduct?.id ?? ""
                }
                onChange={(event) =>
                  setSelectedProductId(
                    event.target.value,
                  )
                }
                style={{ width: "100%" }}
              >
                {filteredProducts.map(
                  (product) => (
                    <option
                      key={product.id}
                      value={product.id}
                    >
                      {product.product_name}
                    </option>
                  ),
                )}
              </select>
            </div>

            {selectedProduct && analysis ? (
              <div
                style={{
                  display: "grid",
                  gap: 20,
                  marginTop: 24,
                }}
              >
                <section
                  className="card"
                  style={{ padding: 28 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="pill">
                      {selectedProduct.category}
                    </span>

                    <strong
                      style={{
                        color: "#2563eb",
                        fontSize: 20,
                      }}
                    >
                      신뢰도{" "}
                      {analysis.confidenceScore}점
                    </strong>
                  </div>

                  <h2
                    style={{
                      margin: "18px 0 10px",
                    }}
                  >
                    {selectedProduct.product_name}
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      lineHeight: 1.8,
                    }}
                  >
                    {analysis.summary}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      marginTop: 18,
                    }}
                  >
                    <span className="pill">
                      리뷰 {analysis.reviewCount}개
                      분석
                    </span>

                    <a
                      href={
                        selectedProduct.source_url
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="secondaryButton"
                      style={{
                        display: "inline-block",
                        textDecoration: "none",
                      }}
                    >
                      상품 페이지 보기
                    </a>
                  </div>
                </section>

                <section
                  className="card"
                  style={{ padding: 28 }}
                >
                  <h2>주요 장점</h2>

                  {analysis.positivePoints
                    .length === 0 ? (
                    <p className="sectionLead">
                      반복적으로 확인된 장점이
                      없습니다.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gap: 14,
                      }}
                    >
                      {analysis.positivePoints.map(
                        (point, index) => (
                          <article
                            key={`${point.topic}-${index}`}
                            style={{
                              padding: 18,
                              borderRadius: 14,
                              background: "#f6fef9",
                              border:
                                "1px solid #abefc6",
                            }}
                          >
                            <strong>
                              {point.topic}
                            </strong>

                            <p
                              style={{
                                margin: "8px 0 0",
                                lineHeight: 1.7,
                              }}
                            >
                              {point.summary}
                            </p>

                            <small
                              style={{
                                display: "block",
                                marginTop: 8,
                                color: "#667085",
                              }}
                            >
                              관련 리뷰 약{" "}
                              {point.evidenceCount}건
                            </small>
                          </article>
                        ),
                      )}
                    </div>
                  )}
                </section>

                <section
                  className="card"
                  style={{ padding: 28 }}
                >
                  <h2>주요 단점</h2>

                  {analysis.negativePoints
                    .length === 0 ? (
                    <p className="sectionLead">
                      반복적으로 확인된 단점이
                      없습니다.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gap: 14,
                      }}
                    >
                      {analysis.negativePoints.map(
                        (point, index) => (
                          <article
                            key={`${point.topic}-${index}`}
                            style={{
                              padding: 18,
                              borderRadius: 14,
                              background: "#fffaeb",
                              border:
                                "1px solid #fedf89",
                            }}
                          >
                            <strong>
                              {point.topic}
                            </strong>

                            <p
                              style={{
                                margin: "8px 0 0",
                                lineHeight: 1.7,
                              }}
                            >
                              {point.summary}
                            </p>

                            <small
                              style={{
                                display: "block",
                                marginTop: 8,
                                color: "#667085",
                              }}
                            >
                              관련 리뷰 약{" "}
                              {point.evidenceCount}건
                            </small>
                          </article>
                        ),
                      )}
                    </div>
                  )}
                </section>

                <section
                  className="card"
                  style={{ padding: 28 }}
                >
                  <h2>구매 전 확인사항</h2>

                  <ul
                    style={{
                      paddingLeft: 22,
                      lineHeight: 1.9,
                    }}
                  >
                    {analysis.cautions.map(
                      (item, index) => (
                        <li key={index}>
                          {item}
                        </li>
                      ),
                    )}
                  </ul>
                </section>

                <section
                  className="card"
                  style={{ padding: 28 }}
                >
                  <h2>이런 분께 추천</h2>

                  <ul
                    style={{
                      paddingLeft: 22,
                      lineHeight: 1.9,
                    }}
                  >
                    {analysis.bestFor.map(
                      (item, index) => (
                        <li key={index}>
                          {item}
                        </li>
                      ),
                    )}
                  </ul>

                  <h2 style={{ marginTop: 28 }}>
                    이런 분께는 비추천
                  </h2>

                  <ul
                    style={{
                      paddingLeft: 22,
                      lineHeight: 1.9,
                    }}
                  >
                    {analysis.notFor.map(
                      (item, index) => (
                        <li key={index}>
                          {item}
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function AssistantLoading() {
  return (
    <main>
      <Header />

      <section className="container emptyState">
        <h1>분석 결과를 준비하고 있습니다.</h1>

        <p className="sectionLead">
          잠시만 기다려 주세요.
        </p>
      </section>
    </main>
  );
}

export default function AssistantPage() {
  return (
    <Suspense
      fallback={<AssistantLoading />}
    >
      <AssistantContent />
    </Suspense>
  );
}