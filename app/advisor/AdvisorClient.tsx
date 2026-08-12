"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import Header from "../../components/Header";

type Criterion = {
  key: string;
  label: string;
  shortDescription: string;
  helpTitle: string;
  helpText: string;
  sourceType: string;
  defaultWeight: number;
};

type UseCase = {
  key: string;
  label: string;
  description: string;
};

type CategoryProfile = {
  id: string;
  category: string;
  title: string;
  introduction: string;
  criteria: Criterion[];
  use_cases: UseCase[];
  candidate_limit: number;
};

type ProfileResponse = {
  success: boolean;
  profile?: CategoryProfile;
  message?: string;
};

type CatalogProduct = {
  id: string;
  category: string;
  productName: string;
  sourceUrl: string;
  price: string;
  representativeImageUrl: string;
  analyzed: boolean;
};

type CatalogResponse = {
  success: boolean;
  count?: number;
  products?: CatalogProduct[];
  message?: string;
};

function clampWeight(value: number) {
  return Math.max(
    0,
    Math.min(
      10,
      Math.round(value),
    ),
  );
}

function normalizePriceLabel(
  value: string,
) {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return "가격 정보 준비 중";
  }

  /*
    "318000원", "318,000원"처럼
    원 단위 숫자로 저장된 가격은
    화면에서 천 단위 쉼표를 통일한다.
  */
  const wonMatch =
    trimmed.match(
      /^([\d,]+)\s*원$/,
    );

  if (wonMatch) {
    const numeric =
      Number(
        wonMatch[1].replace(
          /,/g,
          "",
        ),
      );

    if (
      Number.isFinite(numeric) &&
      numeric > 0
    ) {
      return `${numeric.toLocaleString(
        "ko-KR",
      )}원`;
    }
  }

  /*
    "31.8만원" 같은 표현은
    원래 표현을 그대로 유지한다.
  */
  if (
    /만원|천원/.test(
      trimmed,
    )
  ) {
    return trimmed;
  }

  const numeric =
    Number(
      trimmed.replace(
        /[^\d.]/g,
        "",
      ),
    );

  if (
    Number.isFinite(numeric) &&
    numeric > 0
  ) {
    return `${Math.round(
      numeric,
    ).toLocaleString(
      "ko-KR",
    )}원`;
  }

  return trimmed;
}

export default function AdvisorPage() {
  const router = useRouter();

  const searchParams =
    useSearchParams();

  /*
    URL에 category가 있어도
    자동으로 가이드를 열지는 않는다.
    사용자가 "구매 가이드 보기"를 눌러야
    제품과 Buying Guide를 로드한다.
  */
  const initialInput =
    searchParams.get("category") ??
    "";

  const [
    categoryInput,
    setCategoryInput,
  ] = useState(
    initialInput,
  );

  const [
    activeCategory,
    setActiveCategory,
  ] = useState("");

  const [
    profile,
    setProfile,
  ] =
    useState<CategoryProfile | null>(
      null,
    );

  const [
    representativeProducts,
    setRepresentativeProducts,
  ] = useState<CatalogProduct[]>(
    [],
  );

  const [
    weights,
    setWeights,
  ] = useState<
    Record<string, number>
  >({});

  const [
    openHelpKey,
    setOpenHelpKey,
  ] = useState("");

  const [
    isLoading,
    setIsLoading,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    if (!activeCategory) {
      return;
    }

    const controller =
      new AbortController();

    async function loadGuide() {
      setIsLoading(true);
      setErrorMessage("");
      setProfile(null);
      setRepresentativeProducts(
        [],
      );
      setOpenHelpKey("");

      try {
        const [
          profileResponse,
          catalogResponse,
        ] = await Promise.all([
          fetch(
            `/api/category-profile?category=${encodeURIComponent(
              activeCategory,
            )}`,
            {
              cache:
                "no-store",
              signal:
                controller.signal,
            },
          ),

          fetch(
            `/api/catalog-products?category=${encodeURIComponent(
              activeCategory,
            )}&analyzedOnly=true`,
            {
              cache:
                "no-store",
              signal:
                controller.signal,
            },
          ),
        ]);

        const profileResult =
          (await profileResponse.json()) as ProfileResponse;

        const catalogResult =
          (await catalogResponse.json()) as CatalogResponse;

        if (
          !profileResponse.ok ||
          !profileResult.success ||
          !profileResult.profile
        ) {
          throw new Error(
            profileResult.message ??
              "카테고리 구매 가이드를 불러오지 못했습니다.",
          );
        }

        if (
          !catalogResponse.ok ||
          !catalogResult.success
        ) {
          throw new Error(
            catalogResult.message ??
              "비교 제품을 불러오지 못했습니다.",
          );
        }

        const nextProfile =
          profileResult.profile;

        const nextWeights =
          Object.fromEntries(
            nextProfile.criteria.map(
              (criterion) => [
                criterion.key,
                clampWeight(
                  criterion.defaultWeight,
                ),
              ],
            ),
          );

        setProfile(
          nextProfile,
        );

        setWeights(
          nextWeights,
        );

        setRepresentativeProducts(
          (
            catalogResult.products ??
            []
          ).slice(0, 5),
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "구매 가이드를 불러오지 못했습니다.",
        );
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setIsLoading(
            false,
          );
        }
      }
    }

    void loadGuide();

    return () =>
      controller.abort();
  }, [activeCategory]);

  const topPriorities =
    useMemo(() => {
      if (!profile) {
        return [];
      }

      return [
        ...profile.criteria,
      ]
        .sort(
          (a, b) =>
            (weights[b.key] ??
              b.defaultWeight) -
            (weights[a.key] ??
              a.defaultWeight),
        )
        .slice(0, 3);
    }, [profile, weights]);

  function searchCategory(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalized =
      categoryInput.trim();

    if (!normalized) {
      return;
    }

    setActiveCategory(
      normalized,
    );

    router.replace(
      `/advisor?category=${encodeURIComponent(
        normalized,
      )}`,
    );
  }

  function continueToQuestions() {
    if (!profile) {
      return;
    }

    const params =
      new URLSearchParams({
        category:
          profile.category,

        weights:
          JSON.stringify(
            weights,
          ),
      });

    router.push(
      `/advisor/questions?${params.toString()}`,
    );
  }

  const hasGuide =
    Boolean(
      activeCategory &&
        profile &&
        !isLoading &&
        !errorMessage,
    );

  return (
    <main>
      <Header />

      <section
        className="advisorHero"
        style={{
          minHeight:
            hasGuide
              ? undefined
              : "calc(100vh - 74px)",
          display:
            "flex",
          alignItems:
            hasGuide
              ? undefined
              : "center",
        }}
      >
        <div className="advisorHeroInner">
          <span className="heroBadge">
            AI 구매 컨설턴트
          </span>

          <h1>
            어떤 제품을 찾고
            계신가요?
          </h1>

          {!hasGuide ? (
            <p>
              찾고 싶은 제품군만
              입력해주세요. 비교할
              제품과 구매 기준부터
              정리해드릴게요.
            </p>
          ) : (
            <p>
              현재 비교할 제품과
              구매할 때 중요한 기준을
              함께 확인해보세요.
            </p>
          )}

          <form
            className="advisorSearch"
            onSubmit={
              searchCategory
            }
          >
            <input
              aria-label="구매 카테고리"
              value={
                categoryInput
              }
              onChange={(
                event,
              ) =>
                setCategoryInput(
                  event.target
                    .value,
                )
              }
              placeholder="예: 캠핑용 에어컨"
            />

            <button type="submit">
              구매 가이드 보기
            </button>
          </form>
        </div>
      </section>

      {activeCategory ? (
        <section className="container advisorContainer">
          {isLoading ? (
            <div className="card emptyState">
              비교 제품과 구매
              가이드를 준비하고
              있습니다.
            </div>
          ) : errorMessage ? (
            <div className="advisorError">
              <strong>
                {errorMessage}
              </strong>

              <p>
                현재 체험 가능한
                카테고리를 다시
                확인해 주세요.
              </p>
            </div>
          ) : profile ? (
            <>
              <section
                style={{
                  marginBottom:
                    30,
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "flex-end",
                    justifyContent:
                      "space-between",
                    gap: 20,
                    marginBottom:
                      18,
                  }}
                >
                  <div>
                    <span className="eyebrow">
                      COMPARISON
                      PRODUCTS
                    </span>

                    <h2
                      style={{
                        margin:
                          "6px 0 0",
                      }}
                    >
                      {
                        profile.category
                      }{" "}
                      대표 비교 제품
                    </h2>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      color:
                        "#667085",
                      fontSize:
                        14,
                    }}
                  >
                    현재 등록된 제품
                    중 최대 5개를
                    비교합니다.
                  </p>
                </div>

                {representativeProducts.length >
                0 ? (
                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 14,
                    }}
                  >
                    {representativeProducts.map(
                      (
                        product,
                      ) => (
                        <article
                          key={
                            product.id
                          }
                          className="card"
                          style={{
                            overflow:
                              "hidden",
                            padding: 0,
                          }}
                        >
                          <a
                            href={
                              product.sourceUrl
                            }
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display:
                                "block",
                              color:
                                "inherit",
                              textDecoration:
                                "none",
                            }}
                          >
                            <div
                              style={{
                                width:
                                  "100%",
                                aspectRatio:
                                  "1 / 1",
                                background:
                                  "#f3f6fa",
                                display:
                                  "flex",
                                alignItems:
                                  "center",
                                justifyContent:
                                  "center",
                                overflow:
                                  "hidden",
                              }}
                            >
                              {product.representativeImageUrl ? (
                                <img
                                  src={
                                    product.representativeImageUrl
                                  }
                                  alt={
                                    product.productName
                                  }
                                  style={{
                                    width:
                                      "100%",
                                    height:
                                      "100%",
                                    objectFit:
                                      "contain",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    padding:
                                      20,
                                    textAlign:
                                      "center",
                                    color:
                                      "#98a2b3",
                                    fontSize:
                                      13,
                                    lineHeight:
                                      1.5,
                                  }}
                                >
                                  대표 이미지
                                  준비 중
                                </div>
                              )}
                            </div>

                            <div
                              style={{
                                padding:
                                  16,
                              }}
                            >
                              <strong
                                style={{
                                  display:
                                    "block",
                                  minHeight:
                                    44,
                                  lineHeight:
                                    1.45,
                                  fontSize:
                                    15,
                                }}
                              >
                                {
                                  product.productName
                                }
                              </strong>

                              <span
                                style={{
                                  display:
                                    "block",
                                  marginTop:
                                    9,
                                  fontSize:
                                    18,
                                  fontWeight:
                                    800,
                                  color:
                                    "#101828",
                                }}
                              >
                                {normalizePriceLabel(
                                  product.price,
                                )}
                              </span>
                            </div>
                          </a>
                        </article>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="card emptyState">
                    현재 비교할 수
                    있는 등록 제품이
                    없습니다.
                  </div>
                )}
              </section>

              <section className="advisorIntroCard">
                <div>
                  <span className="eyebrow">
                    BUYING GUIDE
                  </span>

                  <h2>
                    {profile.title}
                  </h2>

                  <p>
                    {
                      profile.introduction
                    }
                  </p>
                </div>

                <div className="advisorSummaryBox">
                  <small>
                    현재 가장 중요한
                    기준
                  </small>

                  {topPriorities.map(
                    (
                      criterion,
                      index,
                    ) => (
                      <strong
                        key={
                          criterion.key
                        }
                      >
                        {index +
                          1}
                        .{" "}
                        {
                          criterion.label
                        }
                      </strong>
                    ),
                  )}
                </div>
              </section>

              <section className="advisorSection">
                <div className="advisorSectionHeading">
                  <div>
                    <span className="eyebrow">
                      STEP 1
                    </span>

                    <h2>
                      이 제품군에서는
                      이런 점을
                      비교해야 합니다.
                    </h2>
                  </div>

                  <p>
                    모르는 용어는
                    ‘쉽게 설명’ 버튼으로
                    바로 확인할 수
                    있습니다.
                  </p>
                </div>

                <div className="criteriaGrid">
                  {profile.criteria
                    .slice(0, 5)
                    .map(
                      (
                        criterion,
                      ) => {
                        const isOpen =
                          openHelpKey ===
                          criterion.key;

                        return (
                          <article
                            className="criterionCard"
                            key={
                              criterion.key
                            }
                          >
                            <div className="criterionHeader">
                              <div>
                                <h3>
                                  {
                                    criterion.label
                                  }
                                </h3>

                                <p>
                                  {
                                    criterion.shortDescription
                                  }
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="helpToggle"
                              onClick={() =>
                                setOpenHelpKey(
                                  isOpen
                                    ? ""
                                    : criterion.key,
                                )
                              }
                            >
                              {isOpen
                                ? "설명 닫기"
                                : "쉽게 설명"}
                            </button>

                            {isOpen ? (
                              <div className="criterionHelp">
                                <strong>
                                  {
                                    criterion.helpTitle
                                  }
                                </strong>

                                <p>
                                  {
                                    criterion.helpText
                                  }
                                </p>
                              </div>
                            ) : null}
                          </article>
                        );
                      },
                    )}
                </div>
              </section>

              <div className="advisorStickyAction">
                <div>
                  <strong>
                    다음 단계: 맞춤
                    질문
                  </strong>

                  <span>
                    추천 결과를 실제로
                    바꾸는 몇 가지
                    조건만 확인합니다.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={
                    continueToQuestions
                  }
                >
                  맞춤 질문 시작 →
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

