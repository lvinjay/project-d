"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import NaverCaptureAutomation from "../../../components/NaverCaptureAutomation";

type CapturedProduct = {
  name: string;
  text: string;
  url: string;
  imageUrl: string;
  price: number;
  reviewCount: number;
  rating: number;
};

type BudgetStatus =
  | "within"
  | "below"
  | "above"
  | "unlimited";

type RankedProduct =
  CapturedProduct & {
    candidateScore: number;
    scoreReasons: string[];
    budgetStatus: BudgetStatus;
    budgetDistance: number;
  };

function formatPrice(
  value: number,
) {
  if (!value) {
    return "-";
  }

  return (
    value.toLocaleString(
      "ko-KR",
    ) + "원"
  );
}

function cleanName(
  value: string,
) {
  return value
    .toLowerCase()

    /*
      프로모션 문구 제거
    */
    .replace(
      /\[[^\]]*\]/g,
      " ",
    )

    .replace(
      /\([^)]*\)/g,
      " ",
    )

    /*
      같은 모델 판별에 불필요한 표현 제거
    */
    .replace(
      /\b(화이트|블랙|실버|그레이|베이지|단품|정품|공식|무료배송|직배수|자동물통형)\b/g,
      " ",
    )

    /*
      판매처마다 붙는 긴 SKU 비슷한 코드 제거.
      실제 S9 MaxV Ultra 같은 모델명은 남는다.
    */
    .replace(
      /\b[a-z0-9+\-_]{9,}\b/g,
      " ",
    )

    .replace(
      /[^a-z0-9가-힣]+/g,
      " ",
    )

    .replace(
      /\s+/g,
      " ",
    )

    .trim();
}

function getNameTokens(
  value: string,
) {
  const ignored =
    new Set([
      "로봇청소기",
      "청소기",
      "로봇",
      "자동",
      "공식",
      "신제품",
      "new",
    ]);

  return new Set(
    cleanName(value)
      .split(" ")
      .filter(
        (token) =>
          token.length >= 2 &&
          !ignored.has(
            token,
          ),
      ),
  );
}

function similarity(
  a: string,
  b: string,
) {
  const aTokens =
    getNameTokens(a);

  const bTokens =
    getNameTokens(b);

  if (
    aTokens.size === 0 ||
    bTokens.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (
    const token of
    aTokens
  ) {
    if (
      bTokens.has(token)
    ) {
      intersection++;
    }
  }

  const smaller =
    Math.min(
      aTokens.size,
      bTokens.size,
    );

  /*
    Jaccard보다
    같은 모델 + 판매문구가 붙은 경우를
    더 잘 잡기 위해 작은 쪽 토큰 대비
    공통 토큰 비율도 사용.
  */
  return smaller > 0
    ? intersection /
        smaller
    : 0;
}

function isLikelyDuplicate(
  a: CapturedProduct,
  b: CapturedProduct,
) {
  const nameSimilarity =
    similarity(
      a.name,
      b.name,
    );

  /*
    판매처별 가격 차이가 있어도
    모델명이 거의 같으면 같은 제품으로 본다.

    기존처럼 가격차 8% 조건을 걸면
    동일 S9가 판매처별 가격 차이 때문에
    중복으로 남을 수 있었다.
  */
  return (
    nameSimilarity >=
    0.78
  );
}

function removeDuplicates(
  products:
    CapturedProduct[],
) {
  const unique:
    CapturedProduct[] = [];

  /*
    동일 제품이면
    리뷰가 많은 판매등록을 대표로 사용.
  */
  const sorted =
    [...products].sort(
      (a, b) =>
        b.reviewCount -
        a.reviewCount,
    );

  for (
    const product of
    sorted
  ) {
    const duplicate =
      unique.some(
        (existing) =>
          isLikelyDuplicate(
            existing,
            product,
          ),
      );

    if (duplicate) {
      continue;
    }

    unique.push(
      product,
    );
  }

  return unique;
}

function getBudgetStatus(
  price: number,
  minBudget: number,
  maxBudget: number,
): {
  status: BudgetStatus;
  distance: number;
} {
  if (
    minBudget <= 0 &&
    maxBudget <= 0
  ) {
    return {
      status:
        "unlimited",
      distance: 0,
    };
  }

  if (
    minBudget > 0 &&
    price < minBudget
  ) {
    return {
      status:
        "below",
      distance:
        minBudget -
        price,
    };
  }

  if (
    maxBudget > 0 &&
    price > maxBudget
  ) {
    return {
      status:
        "above",
      distance:
        price -
        maxBudget,
    };
  }

  return {
    status:
      "within",
    distance: 0,
  };
}

function rankProducts(
  products:
    CapturedProduct[],
  minBudget: number,
  maxBudget: number,
): RankedProduct[] {
  if (
    products.length === 0
  ) {
    return [];
  }

  const maximumReviews =
    Math.max(
      1,
      ...products.map(
        (product) =>
          product.reviewCount,
      ),
    );

  const maximumReviewLog =
    Math.log10(
      maximumReviews + 1,
    );

  return products
    .map(
      (product) => {
        const reviewScore =
          maximumReviewLog >
          0
            ? (
                Math.log10(
                  product.reviewCount +
                    1,
                ) /
                maximumReviewLog
              ) *
              100
            : 0;

        const ratingScore =
          product.rating >
          0
            ? Math.min(
                100,
                (
                  product.rating /
                  5
                ) *
                  100,
              )
            : 0;

        const dataScore =
          [
            Boolean(
              product.name,
            ),

            product.price >
              0,

            Boolean(
              product.imageUrl,
            ),

            Boolean(
              product.url,
            ),

            product.reviewCount >
              0,

            product.rating >
              0,
          ].filter(
            Boolean,
          ).length /
          6 *
          100;

        /*
          가격 자체는 점수에 넣지 않는다.

          싼 제품이라고 무조건 고득점,
          비싼 제품이라고 무조건 고득점이
          되는 것을 막는다.

          가격은 아래 후보 구성 단계에서
          사용자의 예산 조건으로 처리한다.
        */
        const score =
          reviewScore *
            0.55 +
          ratingScore *
            0.3 +
          dataScore *
            0.15;

        const budget =
          getBudgetStatus(
            product.price,
            minBudget,
            maxBudget,
          );

        return {
          ...product,

          candidateScore:
            Math.round(
              score *
                10,
            ) / 10,

          scoreReasons: [
            `리뷰 ${product.reviewCount.toLocaleString(
              "ko-KR",
            )}개`,

            product.rating >
            0
              ? `평점 ${product.rating}`
              : "평점 정보 없음",

            `데이터 충실도 ${Math.round(
              dataScore,
            )}%`,
          ],

          budgetStatus:
            budget.status,

          budgetDistance:
            budget.distance,
        };
      },
    )
    .sort(
      (a, b) =>
        b.candidateScore -
        a.candidateScore,
    );
}

function selectFinalists(
  ranked:
    RankedProduct[],
  minBudget: number,
  maxBudget: number,
) {
  /*
    예산을 입력하지 않은 경우
    기존처럼 상위 15개.
  */
  if (
    minBudget <= 0 &&
    maxBudget <= 0
  ) {
    return ranked.slice(
      0,
      15,
    );
  }

  /*
    1순위:
    예산 범위 안의 제품.
  */
  const withinBudget =
    ranked.filter(
      (product) =>
        product.budgetStatus ===
        "within",
    );

  if (
    withinBudget.length >=
    15
  ) {
    return withinBudget.slice(
      0,
      15,
    );
  }

  /*
    예산 안 제품이 부족하면
    부족한 개수만 예산 경계에서
    가까운 순서로 보충한다.

    같은 거리면 후보점수가 높은 제품 우선.
  */
  const outsideBudget =
    ranked
      .filter(
        (product) =>
          product.budgetStatus !==
          "within",
      )
      .sort(
        (a, b) => {
          if (
            a.budgetDistance !==
            b.budgetDistance
          ) {
            return (
              a.budgetDistance -
              b.budgetDistance
            );
          }

          return (
            b.candidateScore -
            a.candidateScore
          );
        },
      );

  const needed =
    15 -
    withinBudget.length;

  return [
    ...withinBudget,
    ...outsideBudget.slice(
      0,
      needed,
    ),
  ];
}

function budgetLabel(
  product:
    RankedProduct,
) {
  if (
    product.budgetStatus ===
    "within"
  ) {
    return "예산 내";
  }

  if (
    product.budgetStatus ===
    "above"
  ) {
    return `예산 초과 +${formatPrice(
      product.budgetDistance,
    )}`;
  }

  if (
    product.budgetStatus ===
    "below"
  ) {
    return `예산 미달 -${formatPrice(
      product.budgetDistance,
    )}`;
  }

  return "예산 제한 없음";
}

export default function NaverCapturePage() {
  const [
    captureId,
    setCaptureId,
  ] = useState("");

  const [
    products,
    setProducts,
  ] =
    useState<
      CapturedProduct[]
    >([]);

  const [
    category,
    setCategory,
  ] =
    useState("");

  const [
    minBudget,
    setMinBudget,
  ] =
    useState(0);

  const [
    maxBudget,
    setMaxBudget,
  ] =
    useState(0);

  const [
    message,
    setMessage,
  ] =
    useState(
      "수집 데이터를 불러오는 중입니다.",
    );

  useEffect(() => {
    async function load() {
      const params =
        new URLSearchParams(
          window.location
            .search,
        );

      const id =
        params.get("id");

      if (!id) {
        setMessage(
          "네이버쇼핑에서 Project D 후보 수집 북마크를 실행하세요.",
        );

        return;
      }

      setCaptureId(id);

      try {
        const response =
          await fetch(
            `/api/naver-capture?id=${encodeURIComponent(
              id,
            )}`,
            {
              cache:
                "no-store",
            },
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ??
              "수집 데이터를 불러오지 못했습니다.",
          );
        }

        const incoming =
          Array.isArray(
            data.products,
          )
            ? data.products
            : [];

        setCategory(
          data.category ??
            "",
        );

        setMinBudget(
          Number(
            data.minBudget ??
              0,
          ) || 0,
        );

        setMaxBudget(
          Number(
            data.maxBudget ??
              0,
          ) || 0,
        );

        setProducts(
          incoming,
        );

        setMessage(
          `${incoming.length}개 상품을 수집했습니다.`,
        );
      } catch (error) {
        setMessage(
          error instanceof
          Error
            ? error.message
            : "수집 데이터를 불러오지 못했습니다.",
        );
      }
    }

    void load();
  }, []);

  const uniqueProducts =
    useMemo(
      () =>
        removeDuplicates(
          products,
        ),
      [products],
    );

  const rankedProducts =
    useMemo(
      () =>
        rankProducts(
          uniqueProducts,
          minBudget,
          maxBudget,
        ),
      [
        uniqueProducts,
        minBudget,
        maxBudget,
      ],
    );

  const finalists =
    useMemo(
      () =>
        selectFinalists(
          rankedProducts,
          minBudget,
          maxBudget,
        ),
      [
        rankedProducts,
        minBudget,
        maxBudget,
      ],
    );

  const withinBudgetCount =
    rankedProducts.filter(
      (product) =>
        product.budgetStatus ===
        "within",
    ).length;

  const supplementCount =
    finalists.filter(
      (product) =>
        product.budgetStatus !==
          "within" &&
        product.budgetStatus !==
          "unlimited",
    ).length;

  const hasBudget =
    minBudget > 0 ||
    maxBudget > 0;

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding:
          "40px 24px",
      }}
    >
      <div
        style={{
          marginBottom: 32,
        }}
      >
        <div
          style={{
            color:
              "#2563eb",
            fontSize: 13,
            fontWeight:
              800,
            letterSpacing:
              "0.12em",
            marginBottom:
              10,
          }}
        >
          NAVER SHOPPING CAPTURE
        </div>

        <h1
          style={{
            fontSize: 32,
            margin: 0,
          }}
        >
          네이버쇼핑 후보 수집
        </h1>

        <p
          style={{
            color:
              "#64748b",
            lineHeight:
              1.7,
          }}
        >
          {message}
        </p>

        {category ? (
          <div
            style={{
              marginBottom:
                12,
              fontWeight:
                700,
            }}
          >
            제품군:{" "}
            {category}
          </div>
        ) : null}

        {hasBudget ? (
          <div
            style={{
              marginBottom:
                18,
              padding:
                "14px 16px",
              borderRadius:
                12,
              border:
                "1px solid #bfdbfe",
              background:
                "#eff6ff",
              color:
                "#1e40af",
              lineHeight:
                1.7,
            }}
          >
            설정 예산:{" "}
            <strong>
              {minBudget >
              0
                ? formatPrice(
                    minBudget,
                  )
                : "최소 제한 없음"}
              {" ~ "}
              {maxBudget >
              0
                ? formatPrice(
                    maxBudget,
                  )
                : "최대 제한 없음"}
            </strong>
          </div>
        ) : null}

        <div
          style={{
            display:
              "flex",
            gap: 18,
            flexWrap:
              "wrap",
          }}
        >
          <div>
            수집{" "}
            <strong>
              {
                products.length
              }
            </strong>
            개
          </div>

          <div>
            동일제품 제거 후{" "}
            <strong>
              {
                uniqueProducts.length
              }
            </strong>
            개
          </div>

          {hasBudget ? (
            <div>
              예산 내{" "}
              <strong>
                {
                  withinBudgetCount
                }
              </strong>
              개
            </div>
          ) : null}

          <div>
            1차 후보{" "}
            <strong>
              {
                finalists.length
              }
            </strong>
            개
          </div>

          {supplementCount >
          0 ? (
            <div>
              예산 외 보충{" "}
              <strong>
                {
                  supplementCount
                }
              </strong>
              개
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          alignItems:
            "center",
          marginBottom:
            16,
        }}
      >
        <div>
          <div
            style={{
              color:
                "#2563eb",
              fontSize:
                12,
              fontWeight:
                800,
              letterSpacing:
                "0.1em",
              marginBottom:
                8,
            }}
          >
            FIRST SCREENING
          </div>

          <h2
            style={{
              margin: 0,
              fontSize:
                24,
            }}
          >
            자동 선정 후보
          </h2>
        </div>

        <strong>
          {
            finalists.length
          }
          개
        </strong>
      </div>

      {finalists.length ===
      0 ? (
        <div
          style={{
            border:
              "1px solid #e2e8f0",
            borderRadius:
              18,
            padding: 40,
            textAlign:
              "center",
            color:
              "#64748b",
            background:
              "#fff",
          }}
        >
          후보가 없습니다.
        </div>
      ) : (
        <div
          style={{
            display:
              "grid",
            gap: 14,
          }}
        >
          {finalists.map(
            (
              product,
              index,
            ) => (
              <article
                key={
                  product.url +
                  index
                }
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "55px 90px 1fr 170px",
                  gap: 16,
                  alignItems:
                    "center",
                  border:
                    "1px solid #e2e8f0",
                  borderRadius:
                    16,
                  padding: 16,
                  background:
                    "#fff",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius:
                      12,
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    background:
                      "#eff6ff",
                    color:
                      "#2563eb",
                    fontWeight:
                      800,
                    fontSize:
                      18,
                  }}
                >
                  {index + 1}
                </div>

                <div>
                  {product.imageUrl ? (
                    <img
                      src={
                        product.imageUrl
                      }
                      alt=""
                      style={{
                        width:
                          80,
                        height:
                          80,
                        objectFit:
                          "contain",
                        borderRadius:
                          10,
                      }}
                    />
                  ) : null}
                </div>

                <div>
                  <div
                    style={{
                      display:
                        "flex",
                      gap: 8,
                      alignItems:
                        "center",
                      flexWrap:
                        "wrap",
                      marginBottom:
                        8,
                    }}
                  >
                    <div
                      style={{
                        fontWeight:
                          800,
                        fontSize:
                          16,
                      }}
                    >
                      {
                        product.name
                      }
                    </div>

                    {hasBudget ? (
                      <span
                        style={{
                          padding:
                            "4px 8px",
                          borderRadius:
                            999,
                          fontSize:
                            12,
                          fontWeight:
                            800,

                          background:
                            product.budgetStatus ===
                            "within"
                              ? "#ecfdf3"
                              : "#fff7ed",

                          color:
                            product.budgetStatus ===
                            "within"
                              ? "#067647"
                              : "#c2410c",
                        }}
                      >
                        {budgetLabel(
                          product,
                        )}
                      </span>
                    ) : null}
                  </div>

                  <div
                    style={{
                      color:
                        "#64748b",
                      fontSize:
                        14,
                      lineHeight:
                        1.7,
                    }}
                  >
                    {product.scoreReasons.join(
                      " · ",
                    )}
                  </div>

                  <div
                    style={{
                      marginTop:
                        6,
                      color:
                        "#2563eb",
                      fontWeight:
                        700,
                      fontSize:
                        13,
                    }}
                  >
                    1차 점수{" "}
                    {
                      product.candidateScore
                    }
                    점
                  </div>
                </div>

                <div
                  style={{
                    textAlign:
                      "right",
                  }}
                >
                  <div
                    style={{
                      fontWeight:
                        800,
                      fontSize:
                        18,
                      marginBottom:
                        10,
                    }}
                  >
                    {formatPrice(
                      product.price,
                    )}
                  </div>

                  <a
                    href={
                      product.url
                    }
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color:
                        "#2563eb",
                      fontWeight:
                        700,
                    }}
                  >
                    상품 열기
                  </a>
                </div>
              </article>
            ),
          )}
        </div>
      )}

      {captureId &&
      category &&
      finalists.length > 0 ? (
        <NaverCaptureAutomation
          captureId={captureId}
          category={category}
          finalists={finalists}
        />
      ) : null}
    </main>
  );
}

