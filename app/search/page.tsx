"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
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

type SortOption =
  | "analysis"
  | "confidence"
  | "newest"
  | "name";

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getPositiveSummary(
  analysis: ReviewAnalysis | null,
) {
  if (!analysis) {
    return [];
  }

  return analysis.positivePoints
    .slice(0, 3)
    .map((point) => point.topic);
}

function getNegativeSummary(
  analysis: ReviewAnalysis | null,
) {
  if (!analysis) {
    return [];
  }

  return analysis.negativePoints
    .slice(0, 2)
    .map((point) => point.topic);
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQuery =
    searchParams.get("q") ?? "캠핑용 에어컨";

  const [query, setQuery] =
    useState(initialQuery);

  const [searchQuery, setSearchQuery] =
    useState(initialQuery);

  const [sort, setSort] =
    useState<SortOption>("analysis");

  const [selected, setSelected] =
    useState<string[]>([]);

  const [products, setProducts] =
    useState<CatalogProduct[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setIsLoading(true);
      setErrorMessage("");
      setSelected([]);

      try {
        const response = await fetch(
          `/api/catalog-products?q=${encodeURIComponent(
            searchQuery.trim(),
          )}`,
          {
            method: "GET",
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const data =
          (await response.json()) as CatalogResponse;

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ??
              "제품 정보를 불러오지 못했습니다.",
          );
        }

        if (!Array.isArray(data.products)) {
          throw new Error(
            "제품 데이터 형식이 올바르지 않습니다.",
          );
        }

        setProducts(data.products);
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        setProducts([]);

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "제품 검색 중 오류가 발생했습니다.",
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
  }, [searchQuery]);

  const sortedProducts =
    useMemo<CatalogProduct[]>(() => {
      const copiedProducts = [...products];

      copiedProducts.sort((a, b) => {
        if (sort === "confidence") {
          const aScore =
            a.review_analysis?.confidenceScore ??
            -1;

          const bScore =
            b.review_analysis?.confidenceScore ??
            -1;

          return bScore - aScore;
        }

        if (sort === "newest") {
          return (
            new Date(b.updated_at).getTime() -
            new Date(a.updated_at).getTime()
          );
        }

        if (sort === "name") {
          return a.product_name.localeCompare(
            b.product_name,
            "ko",
          );
        }

        const aAnalyzed = a.review_analysis
          ? 1
          : 0;

        const bAnalyzed = b.review_analysis
          ? 1
          : 0;

        if (bAnalyzed !== aAnalyzed) {
          return bAnalyzed - aAnalyzed;
        }

        const aScore =
          a.review_analysis?.confidenceScore ??
          -1;

        const bScore =
          b.review_analysis?.confidenceScore ??
          -1;

        return bScore - aScore;
      });

      return copiedProducts.slice(0, 10);
    }, [products, sort]);

  const analyzedCount = useMemo(
    () =>
      products.filter(
        (product) =>
          product.review_analysis !== null,
      ).length,
    [products],
  );

  function submitSearch() {
    const normalized = query.trim();

    if (!normalized) {
      alert(
        "검색할 제품군이나 제품명을 입력하세요.",
      );
      return;
    }

    setSearchQuery(normalized);

    const nextParams = new URLSearchParams({
      q: normalized,
    });

    window.history.replaceState(
      null,
      "",
      `/search?${nextParams.toString()}`,
    );
  }

  function handleSearchKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Enter") {
      submitSearch();
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.filter(
          (value) => value !== id,
        );
      }

      if (current.length >= 5) {
        alert(
          "최대 5개까지 선택할 수 있습니다.",
        );

        return current;
      }

      return [...current, id];
    });
  }

  function selectAllCandidates() {
    setSelected(
      sortedProducts
        .slice(0, 5)
        .map((product) => product.id),
    );
  }

  function next() {
    if (selected.length < 2) {
      alert(
        "비교할 제품을 2개 이상 선택하세요. 현재는 등록 제품이 1개라면 추가 제품 등록이 필요합니다.",
      );

      return;
    }

    router.push(
      `/question?ids=${encodeURIComponent(
        selected.join(","),
      )}`,
    );
  }

  return (
    <main>
      <Header />

      <section className="container">
        <span className="heroBadge">
          1단계 · 등록 제품 후보
        </span>

        <h1
          className="sectionTitle"
          style={{ marginTop: 18 }}
        >
          실제 리뷰가 분석된 제품을
          확인하세요
        </h1>

        <p className="sectionLead">
          관리자가 등록한 제품과 Supabase에
          저장된 실제 리뷰 분석 결과를
          불러옵니다.
        </p>

        <div className="toolbar">
          <div
            style={{
              display: "flex",
              flex: 1,
              gap: 10,
            }}
          >
            <input
              className="textInput"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              onKeyDown={
                handleSearchKeyDown
              }
              placeholder="제품군, 제품명 또는 카테고리 검색"
            />

            <button
              type="button"
              className="primaryButton"
              onClick={submitSearch}
              disabled={isLoading}
              style={{
                whiteSpace: "nowrap",
              }}
            >
              {isLoading
                ? "검색 중..."
                : "제품 찾기"}
            </button>
          </div>

          <select
            className="selectInput"
            value={sort}
            onChange={(event) =>
              setSort(
                event.target
                  .value as SortOption,
              )
            }
          >
            <option value="analysis">
              분석 완료 우선
            </option>

            <option value="confidence">
              분석 신뢰도순
            </option>

            <option value="newest">
              최근 업데이트순
            </option>

            <option value="name">
              제품명순
            </option>
          </select>
        </div>

        <div
          className="card"
          style={{
            marginTop: 20,
            padding: 18,
            background: "#eef6ff",
            border:
              "1px solid #b9d8ff",
          }}
        >
          <strong>
            Supabase 제품 데이터
          </strong>

          <p
            style={{
              margin: "8px 0 0",
              lineHeight: 1.7,
              color: "#315b88",
            }}
          >
            검색 결과 {products.length}개 중
            리뷰 분석이 완료된 제품은{" "}
            {analyzedCount}개입니다. 아직
            등록하지 않은 가격·판매량·스펙
            점수는 표시하지 않습니다.
          </p>
        </div>

        {isLoading ? (
          <div
            className="card"
            style={{
              padding: 40,
              textAlign: "center",
              marginTop: 24,
            }}
          >
            <h2>
              제품을 불러오고 있습니다.
            </h2>

            <p className="sectionLead">
              Supabase 제품과 리뷰 분석
              결과를 확인하는 중입니다.
            </p>
          </div>
        ) : errorMessage ? (
          <div
            className="card"
            style={{
              padding: 36,
              textAlign: "center",
              marginTop: 24,
              background: "#fff1f2",
              border:
                "1px solid #f2b8b5",
            }}
          >
            <h2>
              제품을 불러오지
              못했습니다.
            </h2>

            <p className="sectionLead">
              {errorMessage}
            </p>

            <button
              type="button"
              className="secondaryButton"
              onClick={submitSearch}
            >
              다시 시도
            </button>
          </div>
        ) : sortedProducts.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 36,
              textAlign: "center",
              marginTop: 24,
            }}
          >
            <h2>
              검색 조건에 맞는 제품이
              없습니다.
            </h2>

            <p className="sectionLead">
              관리자 페이지에서 제품을
              등록하거나 다른 검색어를
              입력해 주세요.
            </p>

            <button
              type="button"
              className="secondaryButton"
              onClick={() => {
                setQuery(
                  "캠핑용 에어컨",
                );

                setSearchQuery(
                  "캠핑용 에어컨",
                );

                setSort("analysis");
              }}
            >
              캠핑용 에어컨 보기
            </button>
          </div>
        ) : (
          <>
            <div
              className="card"
              style={{
                marginTop: 24,
                marginBottom: 24,
                padding: 24,
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "center",
                gap: 20,
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong
                  style={{
                    fontSize: 18,
                  }}
                >
                  {searchQuery} 제품 후보
                </strong>

                <p
                  style={{
                    margin: "8px 0 0",
                    color: "#667085",
                  }}
                >
                  총{" "}
                  {sortedProducts.length}개
                  제품을 찾았습니다. 현재는
                  관리자 등록 제품을 기준으로
                  표시합니다.
                </p>
              </div>

              <button
                type="button"
                className="secondaryButton"
                onClick={
                  selectAllCandidates
                }
              >
                후보 전체 선택
              </button>
            </div>

            <div className="productGrid">
              {sortedProducts.map(
                (product, index) => {
                  const isSelected =
                    selected.includes(
                      product.id,
                    );

                  const analysis =
                    product.review_analysis;

                  const positiveTopics =
                    getPositiveSummary(
                      analysis,
                    );

                  const negativeTopics =
                    getNegativeSummary(
                      analysis,
                    );

                  return (
                    <article
                      key={product.id}
                      className={`card productCard ${
                        isSelected
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        toggle(product.id)
                      }
                    >
                      <input
                        className="checkbox"
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        aria-label={`${product.product_name} 선택`}
                      />

                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "center",
                          gap: 12,
                          marginBottom: 14,
                        }}
                      >
                        <span className="pill">
                          후보 {index + 1}
                        </span>

                        {analysis ? (
                          <strong
                            style={{
                              color:
                                "#2563eb",
                              fontSize: 18,
                            }}
                          >
                            신뢰도{" "}
                            {
                              analysis.confidenceScore
                            }
                            점
                          </strong>
                        ) : (
                          <span
                            className="pill"
                            style={{
                              background:
                                "#fff8e8",
                            }}
                          >
                            분석 전
                          </span>
                        )}
                      </div>

                      <span className="pill">
                        {product.category}
                      </span>

                      <h2>
                        {
                          product.product_name
                        }
                      </h2>

                      <a
                        href={
                          product.source_url
                        }
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) =>
                          event.stopPropagation()
                        }
                        style={{
                          display:
                            "inline-block",
                          wordBreak:
                            "break-all",
                        }}
                      >
                        상품 페이지 열기
                      </a>

                      <div
                        className="productMeta"
                        style={{
                          marginTop: 16,
                        }}
                      >
                        <span className="pill">
                          {analysis
                            ? `리뷰 ${analysis.reviewCount}개 분석`
                            : "리뷰 분석 전"}
                        </span>

                        <span className="pill">
                          업데이트{" "}
                          {formatDate(
                            product.updated_at,
                          )}
                        </span>
                      </div>

                      {analysis ? (
                        <>
                          <div
                            style={{
                              marginTop: 20,
                              padding: 18,
                              borderRadius: 14,
                              background:
                                "#f5f7fb",
                            }}
                          >
                            <strong>
                              AI 리뷰 요약
                            </strong>

                            <p
                              style={{
                                margin:
                                  "10px 0 0",
                                lineHeight: 1.7,
                              }}
                            >
                              {
                                analysis.summary
                              }
                            </p>
                          </div>

                          <div
                            style={{
                              marginTop: 18,
                            }}
                          >
                            <strong>
                              주요 장점
                            </strong>

                            <p
                              style={{
                                marginBottom: 0,
                                lineHeight: 1.7,
                              }}
                            >
                              {positiveTopics
                                .length > 0
                                ? positiveTopics.join(
                                    " · ",
                                  )
                                : "반복적으로 확인된 장점이 없습니다."}
                            </p>
                          </div>

                          <div
                            style={{
                              marginTop: 18,
                            }}
                          >
                            <strong>
                              주요 주의점
                            </strong>

                            <p
                              style={{
                                marginBottom: 0,
                                lineHeight: 1.7,
                              }}
                            >
                              {negativeTopics
                                .length > 0
                                ? negativeTopics.join(
                                    " · ",
                                  )
                                : analysis
                                      .cautions[0] ??
                                  "별도로 확인된 주의점이 없습니다."}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div
                          style={{
                            marginTop: 20,
                            padding: 18,
                            borderRadius: 14,
                            background:
                              "#fff8e8",
                          }}
                        >
                          <strong>
                            리뷰 분석이 필요합니다.
                          </strong>

                          <p
                            style={{
                              margin:
                                "8px 0 0",
                              lineHeight: 1.7,
                              color:
                                "#7a5b15",
                            }}
                          >
                            관리자 화면에서
                            실제 리뷰를 입력하고
                            AI 분석을 완료해
                            주세요.
                          </p>
                        </div>
                      )}

                      <p
                        style={{
                          marginTop: 18,
                          marginBottom: 0,
                          fontSize: 13,
                          color: "#98a2b3",
                        }}
                      >
                        데이터 등록일:{" "}
                        {formatDate(
                          product.created_at,
                        )}
                      </p>
                    </article>
                  );
                },
              )}
            </div>
          </>
        )}

        <div className="stickyAction">
          <div>
            <strong>
              {selected.length}개 선택
            </strong>

            <br />

            <span
              style={{
                color: "#667085",
              }}
            >
              비교 후보 중 최소 2개, 최대
              5개
            </span>
          </div>

          <button
            type="button"
            className="primaryButton"
            onClick={next}
            disabled={
              isLoading ||
              selected.length < 2
            }
          >
            내 조건으로 최종 추천받기
          </button>
        </div>
      </section>
    </main>
  );
}

function SearchLoading() {
  return (
    <main>
      <Header />

      <section className="container emptyState">
        <h1>
          등록 제품을 불러오는 중입니다.
        </h1>

        <p className="sectionLead">
          잠시만 기다려 주세요.
        </p>
      </section>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={<SearchLoading />}
    >
      <SearchContent />
    </Suspense>
  );
}