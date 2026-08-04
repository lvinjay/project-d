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
import { getMarketCandidates } from "../../lib/marketRanking";
import type {
  MarketCandidate,
  Product,
} from "../../lib/types";

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(
    searchParams.get("q") ?? "캠핑용 에어컨",
  );

  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("q") ?? "캠핑용 에어컨",
  );

  const [sort, setSort] = useState("market");
  const [selected, setSelected] = useState<number[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setIsLoading(true);
      setErrorMessage("");
      setSelected([]);

      try {
        const response = await fetch(
          `/api/search-products?q=${encodeURIComponent(
            searchQuery.trim(),
          )}`,
          {
            method: "GET",
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.message ??
              "제품 정보를 불러오지 못했습니다.",
          );
        }

        if (!Array.isArray(data)) {
          throw new Error(
            "제품 데이터 형식이 올바르지 않습니다.",
          );
        }

        setProducts(data as Product[]);
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

    loadProducts();

    return () => {
      controller.abort();
    };
  }, [searchQuery]);

  const marketProducts = useMemo<MarketCandidate[]>(() => {
    if (products.length === 0) {
      return [];
    }

    const category =
      products[0]?.category ?? searchQuery.trim();

    const candidates = getMarketCandidates(
      products,
      category,
      5,
    );

    return [...candidates].sort((a, b) => {
      if (sort === "price") {
        return a.price - b.price;
      }

      if (sort === "review") {
        return b.reviewScore - a.reviewScore;
      }

      if (sort === "cooling") {
        return b.cooling - a.cooling;
      }

      if (sort === "portability") {
        return b.portability - a.portability;
      }

      return b.marketScore - a.marketScore;
    });
  }, [products, searchQuery, sort]);

  function submitSearch() {
    const normalized = query.trim();

    if (!normalized) {
      alert("검색할 제품군이나 제품명을 입력하세요.");
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

  function toggle(id: number) {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.filter(
          (value) => value !== id,
        );
      }

      if (current.length >= 5) {
        alert("최대 5개까지 선택할 수 있습니다.");
        return current;
      }

      return [...current, id];
    });
  }

  function selectAllCandidates() {
    setSelected(
      marketProducts.map((product) => product.id),
    );
  }

  function next() {
    if (selected.length < 2) {
      alert("비교할 제품을 2개 이상 선택하세요.");
      return;
    }

    router.push(
      `/question?ids=${selected.join(",")}`,
    );
  }

  return (
    <main>
      <Header />

      <section className="container">
        <span className="heroBadge">
          1단계 · 시장 대표 후보
        </span>

        <h1
          className="sectionTitle"
          style={{
            marginTop: 18,
          }}
        >
          시장에서 검증된 대표 제품을 확인하세요
        </h1>

        <p className="sectionLead">
          시장 인기도, 리뷰 규모, 사용자 만족도,
          브랜드 신뢰도, 구매 가능성과 제품 최신성을
          종합해 대표 후보를 선정합니다.
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
              onKeyDown={handleSearchKeyDown}
              placeholder="제품군, 제품명 또는 브랜드 검색"
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
              {isLoading ? "검색 중..." : "제품 찾기"}
            </button>
          </div>

          <select
            className="selectInput"
            value={sort}
            onChange={(event) =>
              setSort(event.target.value)
            }
          >
            <option value="market">
              시장 대표 순위
            </option>

            <option value="review">
              리뷰 만족도순
            </option>

            <option value="price">
              가격 낮은순
            </option>

            <option value="cooling">
              냉방 성능순
            </option>

            <option value="portability">
              휴대성순
            </option>
          </select>
        </div>

        <div
          className="card"
          style={{
            marginTop: 20,
            padding: 18,
            background: "#fff8e8",
            border: "1px solid #f4d58d",
          }}
        >
          <strong>현재 개발 단계 안내</strong>

          <p
            style={{
              margin: "8px 0 0",
              lineHeight: 1.7,
              color: "#7a5b15",
            }}
          >
            현재 API는 프로젝트에 저장된 테스트 제품
            데이터를 반환합니다. 실제 판매량과 외부 리뷰
            수집 기능은 다음 단계에서 이 API 내부에
            연결합니다.
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
            <h2>대표 제품을 찾고 있습니다.</h2>

            <p className="sectionLead">
              제품 데이터와 시장 지표를 불러오는
              중입니다.
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
            }}
          >
            <h2>제품을 불러오지 못했습니다.</h2>

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
        ) : marketProducts.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 36,
              textAlign: "center",
              marginTop: 24,
            }}
          >
            <h2>아직 등록된 제품이 없습니다.</h2>

            <p className="sectionLead">
              현재는 캠핑용 에어컨 제품군만 체험할
              수 있습니다.
            </p>

            <button
              type="button"
              className="secondaryButton"
              onClick={() => {
                setQuery("캠핑용 에어컨");
                setSearchQuery("캠핑용 에어컨");
                setSort("market");
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
                justifyContent: "space-between",
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
                  {searchQuery} 시장 대표 후보
                </strong>

                <p
                  style={{
                    margin: "8px 0 0",
                    color: "#667085",
                  }}
                >
                  총 {marketProducts.length}개 제품이
                  선정되었습니다. 시장 대표 순위와 개인
                  맞춤 추천 순위는 다를 수 있습니다.
                </p>
              </div>

              <button
                type="button"
                className="secondaryButton"
                onClick={selectAllCandidates}
              >
                대표 후보 전체 선택
              </button>
            </div>

            <div className="productGrid">
              {marketProducts.map(
                (product, index) => {
                  const isSelected =
                    selected.includes(product.id);

                  return (
                    <article
                      key={product.id}
                      className={`card productCard ${
                        isSelected ? "selected" : ""
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
                        aria-label={`${product.name} 선택`}
                      />

                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 14,
                        }}
                      >
                        <span className="pill">
                          시장 대표 {index + 1}위
                        </span>

                        <strong
                          style={{
                            color: "#2563eb",
                            fontSize: 18,
                          }}
                        >
                          {product.marketScore}점
                        </strong>
                      </div>

                      <span className="pill">
                        {product.category}
                      </span>

                      <h2>{product.name}</h2>

                      <p>
                        {product.brand} ·{" "}
                        {product.price.toLocaleString()}
                        원
                      </p>

                      <div className="productMeta">
                        <span className="pill">
                          {product.weightKg}kg
                        </span>

                        <span className="pill">
                          리뷰{" "}
                          {product.reviewCount.toLocaleString()}
                          건
                        </span>

                        <span className="pill">
                          만족도 {product.reviewScore}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: 20,
                          padding: 18,
                          borderRadius: 14,
                          background: "#f5f7fb",
                        }}
                      >
                        <strong>
                          대표 후보 선정 이유
                        </strong>

                        <ul
                          style={{
                            marginBottom: 0,
                            paddingLeft: 20,
                            lineHeight: 1.7,
                          }}
                        >
                          {product.marketReasons
                            .slice(0, 3)
                            .map((reason) => (
                              <li key={reason}>
                                {reason}
                              </li>
                            ))}
                        </ul>
                      </div>

                      <div
                        style={{
                          marginTop: 18,
                        }}
                      >
                        <strong>주요 특징</strong>

                        <p
                          style={{
                            marginBottom: 0,
                            lineHeight: 1.7,
                          }}
                        >
                          {product.pros
                            .slice(0, 2)
                            .join(" · ")}
                        </p>
                      </div>

                      <p
                        style={{
                          marginTop: 18,
                          marginBottom: 0,
                          fontSize: 13,
                          color: "#98a2b3",
                        }}
                      >
                        데이터 확인일:{" "}
                        {product.dataCheckedAt}
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
              대표 후보 중 최소 2개, 최대 5개
            </span>
          </div>

          <button
            type="button"
            className="primaryButton"
            onClick={next}
            disabled={isLoading}
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
          시장 대표 제품을 불러오는 중입니다.
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
    <Suspense fallback={<SearchLoading />}>
      <SearchContent />
    </Suspense>
  );
}