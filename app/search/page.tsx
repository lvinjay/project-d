"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import { products } from "../../lib/products";
import { getMarketCandidates } from "../../lib/marketRanking";

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(
    searchParams.get("q") ?? "캠핑용 에어컨",
  );

  const [sort, setSort] = useState("market");
  const [selected, setSelected] = useState<number[]>([]);

  const marketProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const matchingProducts = products.filter((product) => {
      if (!normalized) {
        return true;
      }

      const searchableText = [
        product.name,
        product.brand,
        product.category,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalized);
    });

    const category =
      matchingProducts.length > 0
        ? matchingProducts[0].category
        : query.trim();

    const candidates = getMarketCandidates(
      matchingProducts,
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
  }, [query, sort]);

  function toggle(id: number) {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.filter((value) => value !== id);
      }

      if (current.length >= 5) {
        alert("최대 5개까지 선택할 수 있습니다.");
        return current;
      }

      return [...current, id];
    });
  }

  function selectAllCandidates() {
    setSelected(marketProducts.map((product) => product.id));
  }

  function next() {
    if (selected.length < 2) {
      alert("비교할 제품을 2개 이상 선택하세요.");
      return;
    }

    router.push(`/question?ids=${selected.join(",")}`);
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
          시장 인기도, 리뷰 규모, 사용자 만족도, 브랜드 신뢰도,
          구매 가능성과 제품 최신성을 종합해 대표 후보를 선정했습니다.
        </p>

        <div className="toolbar">
          <input
            className="textInput"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected([]);
            }}
            placeholder="제품군, 제품명 또는 브랜드 검색"
          />

          <select
            className="selectInput"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="market">시장 대표 순위</option>
            <option value="review">리뷰 만족도순</option>
            <option value="price">가격 낮은순</option>
            <option value="cooling">냉방 성능순</option>
            <option value="portability">휴대성순</option>
          </select>
        </div>

        {marketProducts.length === 0 ? (
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
              현재는 캠핑용 에어컨 제품군만 체험할 수 있습니다.
            </p>

            <button
              type="button"
              className="secondaryButton"
              onClick={() => {
                setQuery("캠핑용 에어컨");
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
                  {query || "전체 제품"} 시장 대표 후보
                </strong>

                <p
                  style={{
                    margin: "8px 0 0",
                    color: "#667085",
                  }}
                >
                  총 {marketProducts.length}개 제품이 선정되었습니다.
                  시장 순위와 개인 맞춤 추천 순위는 서로 다를 수 있습니다.
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
              {marketProducts.map((product, index) => {
                const isSelected = selected.includes(product.id);

                return (
                  <article
                    key={product.id}
                    className={`card productCard ${
                      isSelected ? "selected" : ""
                    }`}
                    onClick={() => toggle(product.id)}
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
                        justifyContent: "space-between",
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
                      {product.price.toLocaleString()}원
                    </p>

                    <div className="productMeta">
                      <span className="pill">
                        {product.weightKg}kg
                      </span>

                      <span className="pill">
                        리뷰{" "}
                        {product.reviewCount.toLocaleString()}건
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
                      <strong>대표 후보 선정 이유</strong>

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
                            <li key={reason}>{reason}</li>
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
                        {product.pros.slice(0, 2).join(" · ")}
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
                      데이터 확인일: {product.dataCheckedAt}
                    </p>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <div className="stickyAction">
          <div>
            <strong>{selected.length}개 선택</strong>
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
        <h1>시장 대표 제품을 선정하고 있습니다.</h1>

        <p className="sectionLead">
          시장 지표와 리뷰 데이터를 분석하는 중입니다.
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