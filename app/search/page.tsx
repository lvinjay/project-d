"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "../../components/Header";
import { products } from "../../lib/products";

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [sort, setSort] = useState("review");
  const [selected, setSelected] = useState<number[]>([]);

  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const filtered = products.filter((product) =>
      `${product.name} ${product.brand}`
        .toLowerCase()
        .includes(normalized),
    );

    return [...filtered].sort((a, b) => {
      if (sort === "price") {
        return a.price - b.price;
      }

      if (sort === "cooling") {
        return b.cooling - a.cooling;
      }

      if (sort === "portability") {
        return b.portability - a.portability;
      }

      return b.reviewScore - a.reviewScore;
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
        <span className="heroBadge">1단계 · 후보 선택</span>

        <h1
          className="sectionTitle"
          style={{
            marginTop: 18,
          }}
        >
          비교할 제품을 선택하세요
        </h1>

        <p className="sectionLead">
          현재 고민 중인 제품 2~5개를 선택하면 선택한 제품끼리만
          분석합니다.
        </p>

        <div className="toolbar">
          <input
            className="textInput"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제품명 또는 브랜드 검색"
          />

          <select
            className="selectInput"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="review">리뷰 만족도순</option>
            <option value="price">가격 낮은순</option>
            <option value="cooling">냉방 성능순</option>
            <option value="portability">휴대성순</option>
          </select>
        </div>

        <div className="productGrid">
          {visibleProducts.map((product) => {
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

                <span className="pill">{product.category}</span>

                <h2>{product.name}</h2>

                <p>
                  {product.brand} · {product.price.toLocaleString()}원
                </p>

                <div className="productMeta">
                  <span className="pill">{product.weightKg}kg</span>

                  <span className="pill">
                    리뷰 {product.reviewCount.toLocaleString()}건
                  </span>

                  <span className="pill">
                    만족도 {product.reviewScore}
                  </span>
                </div>

                <p>{product.pros.slice(0, 2).join(" · ")}</p>
              </article>
            );
          })}
        </div>

        <div className="stickyAction">
          <div>
            <strong>{selected.length}개 선택</strong>
            <br />

            <span
              style={{
                color: "#667085",
              }}
            >
              최소 2개, 최대 5개
            </span>
          </div>

          <button
            type="button"
            className="primaryButton"
            onClick={next}
          >
            선택한 제품 AI 비교
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
        <h1>제품 목록을 불러오는 중입니다.</h1>

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