import { UUID_PATTERN } from "../../../lib/project-d-selected-five-manifest";
import OpenAI from "openai";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  category?: unknown;
  mode?: unknown;
  budgetChoice?: unknown;
  customPreference?: unknown;
  productIds?: unknown;
  productNames?: unknown;
  dryRun?: unknown;
  inputFingerprint?: unknown;
};

const PERSONAL_PREFERENCE_PIPELINE_VERSION =
  "project-d-personal-preference-v2-cost-guard-final-candidates";

const PERSONAL_PREFERENCE_MODEL =
  "gpt-5-mini";

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => text(item))
        .filter(Boolean),
    ),
  ];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertExactUniqueProductMembership(
  results: unknown,
  expectedProductIds: string[],
): asserts results is Array<{ productId: string }> {
  // Validate every raw row before any requested-ID filtering or reordering.
  if (!Array.isArray(results) || results.some((row) =>
    !row || typeof row !== "object" || Array.isArray(row) ||
    typeof row.productId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.productId.trim())
  )) {
    throw new Error("AI 제품 평가 원본 배열 또는 productId 형식이 올바르지 않습니다.");
  }

  const expected =
    new Set(
      expectedProductIds,
    );

  const actualIds =
    results.map(
      (item) =>
        item.productId.trim(),
    );

  const actual =
    new Set(
      actualIds,
    );

  if (
    expected.size !==
      expectedProductIds.length ||
    actual.size !==
      actualIds.length ||
    actualIds.length !==
      expectedProductIds.length ||
    actualIds.some(
      (productId) =>
        !expected.has(
          productId,
        ),
    ) ||
    expectedProductIds.some(
      (productId) =>
        !actual.has(
          productId,
        ),
    )
  ) {
    throw new Error(
      "AI 개인조건 평가 결과의 productId 집합이 요청한 제품 UUID 집합과 정확히 일치하지 않습니다. 유료 응답을 확인한 뒤 다시 판단해야 합니다.",
    );
  }
}

function parseJson(value: string) {
  return JSON.parse(
    value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim(),
  ) as Record<string, unknown>;
}


type BudgetRange = {
  min: number | null;
  max: number | null;
  label: string;
};

function parseBudgetChoice(value: string): BudgetRange | null {
  if (!value || value === "no_limit") {
    return null;
  }

  const numbers = value.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];

  if (value.startsWith("up_to_") && numbers.length >= 1) {
    return {
      min: null,
      max: numbers[0],
      label: `${Math.round(numbers[0] / 10000)}만원 이하`,
    };
  }

  if (value.startsWith("over_") && numbers.length >= 1) {
    return {
      min: numbers[0],
      max: null,
      label: `${Math.round(numbers[0] / 10000)}만원 이상`,
    };
  }

  if (numbers.length >= 2) {
    return {
      min: Math.min(numbers[0], numbers[1]),
      max: Math.max(numbers[0], numbers[1]),
      label: `${Math.round(Math.min(numbers[0], numbers[1]) / 10000)}만~${Math.round(
        Math.max(numbers[0], numbers[1]) / 10000,
      )}만원`,
    };
  }

  return null;
}

function findNumbers(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }

  if (typeof value === "string") {
    return (value.match(/\d[\d,]*/g) ?? [])
      .map((item) => Number(item.replace(/,/g, "")))
      .filter((item) => Number.isFinite(item) && item >= 1000);
  }

  if (Array.isArray(value)) {
    return value.flatMap(findNumbers);
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, item]) =>
        /(price|가격|최저가|판매가|금액)/i.test(key)
          ? findNumbers(item)
          : [],
    );
  }

  return [];
}

function getProductPrice(product: Record<string, unknown>) {
  const marketPrices = findNumbers(product.market_metrics);
  const detailPrices = findNumbers(product.product_detail_analysis);
  const prices = [...marketPrices, ...detailPrices].filter(
    (value) => value >= 10000 && value <= 100000000,
  );

  return prices.length > 0 ? Math.min(...prices) : null;
}

function niceBudgetCeil(value: number) {
  const unit =
    value >= 1000000
      ? 100000
      : value >= 500000
        ? 50000
        : 10000;

  return Math.max(unit, Math.ceil(value / unit) * unit);
}

function niceBudgetRound(value: number) {
  const unit =
    value >= 1000000
      ? 100000
      : value >= 500000
        ? 50000
        : 10000;

  return Math.max(unit, Math.round(value / unit) * unit);
}

function createBudgetOptions(
  products: Array<Record<string, unknown>>,
) {
  const prices = products
    .map((product) => getProductPrice(product))
    .filter((price): price is number => price !== null && price > 0)
    .sort((a, b) => a - b);

  if (prices.length < 2) {
    return [
      {
        label: "예산 제한 없음",
        value: "no_limit",
      },
    ];
  }

  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];

  // 최고가를 포함하는 명확한 상한을 먼저 만듭니다.
  // 마지막 유한 구간을 "...이상"으로 열어두지 않아
  // "예산 제한 없음"과 의미가 겹치지 않게 합니다.
  let upperBoundary = niceBudgetCeil(maxPrice);

  if (upperBoundary <= maxPrice) {
    upperBoundary = niceBudgetCeil(maxPrice + 1);
  }

  const spreadRatio = maxPrice / Math.max(minPrice, 1);

  let firstBoundary: number;
  let secondBoundary: number;

  if (spreadRatio >= 2) {
    // 가격 차이가 큰 제품군은 로그 스케일로 나눠
    // 저가 구간이 지나치게 좁아지는 것을 방지합니다.
    const logMin = Math.log(minPrice);
    const logMax = Math.log(upperBoundary);

    firstBoundary = niceBudgetRound(
      Math.exp(logMin + (logMax - logMin) / 3),
    );
    secondBoundary = niceBudgetRound(
      Math.exp(logMin + ((logMax - logMin) * 2) / 3),
    );
  } else {
    // 가격대가 촘촘하면 실제 최저~최고가 사이를 균등하게 나눕니다.
    const span = upperBoundary - minPrice;
    firstBoundary = niceBudgetRound(minPrice + span / 3);
    secondBoundary = niceBudgetRound(minPrice + (span * 2) / 3);
  }

  // 반올림 때문에 경계가 겹치는 경우를 방지합니다.
  const minimumGap =
    upperBoundary >= 1000000
      ? 100000
      : upperBoundary >= 500000
        ? 50000
        : 10000;

  firstBoundary = Math.max(minimumGap, firstBoundary);
  secondBoundary = Math.max(firstBoundary + minimumGap, secondBoundary);

  if (secondBoundary >= upperBoundary) {
    secondBoundary = Math.max(
      firstBoundary + minimumGap,
      upperBoundary - minimumGap,
    );
  }

  if (firstBoundary >= secondBoundary) {
    firstBoundary = Math.max(minimumGap, secondBoundary - minimumGap);
  }

  return [
    {
      label: `${Math.round(firstBoundary / 10000)}만원 이하`,
      value: `up_to_${firstBoundary}`,
    },
    {
      label: `${Math.round(firstBoundary / 10000)}만~${Math.round(
        secondBoundary / 10000,
      )}만원`,
      value: `${firstBoundary}_${secondBoundary}`,
    },
    {
      label: `${Math.round(secondBoundary / 10000)}만~${Math.round(
        upperBoundary / 10000,
      )}만원`,
      value: `${secondBoundary}_${upperBoundary}`,
    },
    {
      label: "예산 제한 없음",
      value: "no_limit",
    },
  ];
}

function budgetOnlyScores(
  products: Array<Record<string, unknown>>,
  budgetChoice: string,
) {
  const range = parseBudgetChoice(budgetChoice);

  return products.map((product) => {
    const price = getProductPrice(product);

    if (!range) {
      return {
        productId: String(product.id),
        score: 100,
        reason: "예산 제한이 없어 가격 초과 페널티를 적용하지 않았습니다.",
      };
    }

    if (price === null) {
      return {
        productId: String(product.id),
        score: 70,
        reason: "확인 가능한 가격 정보가 부족해 예산 적합성을 보수적으로 반영했습니다.",
      };
    }

    if (range.max !== null && price > range.max) {
      const overRatio = (price - range.max) / Math.max(range.max, 1);
      const score = Math.max(0, Math.round(55 - overRatio * 80));

      return {
        productId: String(product.id),
        score,
        reason: `확인 가격 약 ${Math.round(price / 10000)}만원으로 선택 예산 ${range.label}을 초과합니다.`,
      };
    }

    if (range.min !== null && price < range.min) {
      return {
        productId: String(product.id),
        score: 92,
        reason: `확인 가격 약 ${Math.round(price / 10000)}만원으로 선택 예산 ${range.label} 범위보다 낮습니다.`,
      };
    }

    return {
      productId: String(product.id),
      score: 100,
      reason: `확인 가격 약 ${Math.round(price / 10000)}만원으로 선택 예산 ${range.label}에 들어옵니다.`,
    };
  });
}


function compactText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}…`
    : normalized;
}

function compactEvidence(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === "string") {
    return compactText(value, 600);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 8)
      .map((item) => compactEvidence(item, depth + 1));
  }

  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const entries = Object.entries(row)
      .filter(([key]) =>
        ![
          "rawReviews",
          "reviews",
          "reviewTexts",
          "sourceHtml",
          "html",
          "collectionStats",
          "criterionReasons",
          "criterion_reasons",
        ].includes(key),
      )
      .slice(0, 24);

    return Object.fromEntries(
      entries.map(([key, item]) => [
        key,
        compactEvidence(item, depth + 1),
      ]),
    );
  }

  return null;
}

function createPersonalPreferenceEvidence(
  products: Array<Record<string, unknown>>,
) {
  return products.map((product) => ({
    id: String(product.id ?? ""),
    productName: compactText(product.product_name, 120),
    price: getProductPrice(product),
    marketMetrics: compactEvidence(product.market_metrics),
    detailSummary: compactEvidence(product.product_detail_analysis),
    reviewSummary: compactEvidence(product.review_analysis),
  }));
}

export async function POST(request: Request) {
  let paidApiCalls = 0;
  let paidResponseAudit:
    | {
        responseId: string;
        responseStatus: string;
        rawModelOutputText: string;
      }
    | null = null;

  try {
    const body = (await request.json()) as Body;
    // Budget options and dry-run are read-only; public production never generates AI output.
    if (process.env.NODE_ENV === "production" &&
        body.dryRun !== true && text(body.mode) !== "budget_options") {
      return NextResponse.json(
        { success: false, paidApiCalls: 0, dbWrites: 0, message: "Not available." },
        { status: 403 },
      );
    }
    const category = text(body.category);
    const mode = text(body.mode);
    const budgetChoice = text(body.budgetChoice) || "no_limit";
    const customPreference = text(body.customPreference).slice(0, 500);
    const requestedProductIds = stringList(body.productIds);
    const requestedProductNames = stringList(body.productNames);
    const dryRun = body.dryRun === true;
    const requestedFingerprint = text(body.inputFingerprint);

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          paidApiCalls: 0,
          message: "카테고리가 필요합니다.",
        },
        { status: 400 },
      );
    }

    let budgetProductIds: string[] = [];
    if (mode === "budget_options") {
      if (!Array.isArray(body.productIds) || body.productIds.length !== 5 ||
          body.productIds.some(id => typeof id !== "string" || !UUID_PATTERN.test(id.trim()))) {
        return NextResponse.json({ success: false, paidApiCalls: 0, message: "예산 선택지는 정확히 5개의 제품 UUID가 필요합니다." }, { status: 400 });
      }
      budgetProductIds = body.productIds.map(id => String(id).trim().toLowerCase());
      if (new Set(budgetProductIds).size !== 5) {
        return NextResponse.json({ success: false, paidApiCalls: 0, message: "중복 제품 UUID는 허용되지 않습니다." }, { status: 400 });
      }
    }
    let productsQuery =
      supabase
        .from("products")
        .select(
          "id, product_name, source_url, product_detail_analysis, review_analysis, market_metrics",
        )
        .eq("category", category);

    if (mode === "budget_options") {
      productsQuery = productsQuery.in("id", budgetProductIds);
    } else {
      if (requestedProductIds.length > 0) {
        productsQuery =
          productsQuery.in(
            "id",
            requestedProductIds,
          );
      } else if (requestedProductNames.length > 0) {
        productsQuery =
          productsQuery.in(
            "product_name",
            requestedProductNames,
          );
      }
    }

    const { data, error } =
      await productsQuery.order(
        "created_at",
        { ascending: true },
      );

    if (error) throw error;

    const products = data ?? [];
    if (mode === "budget_options" && (products.length !== 5 ||
        new Set(products.map(p => p.id)).size !== 5 ||
        budgetProductIds.some(id => !products.some(p => p.id === id)) ||
        products.some(p => !budgetProductIds.includes(p.id)))) {
      return NextResponse.json({ success: false, paidApiCalls: 0, message: "선택한 5개 제품의 카테고리와 UUID가 모두 일치해야 합니다." }, { status: 409 });
    }

    if (products.length < 2) {
      return NextResponse.json(
        {
          success: false,
          paidApiCalls: 0,
          message: "비교할 제품이 부족합니다.",
        },
        { status: 400 },
      );
    }

    if (mode === "budget_options") {
      return NextResponse.json({
        success: true,
        category,
        budgetOptions: createBudgetOptions(
          products as Array<Record<string, unknown>>,
        ),
        analysisMode: "budget_options_server",
        paidApiCalls: 0,
      });
    }

    const requestedProductCount =
      requestedProductIds.length > 0
        ? requestedProductIds.length
        : requestedProductNames.length;

    if (
      requestedProductCount > 0 &&
      products.length !== requestedProductCount
    ) {
      return NextResponse.json(
        {
          success: false,
          paidApiCalls: 0,
          productCount: products.length,
          requestedProductCount,
          message:
            `현재 실행 제품 ${requestedProductCount}개 중 ${products.length}개만 개인조건 평가 대상으로 확인됐습니다.`,
        },
        { status: 400 },
      );
    }

    const personalPreferenceEvidence =
      createPersonalPreferenceEvidence(
        products as Array<Record<string, unknown>>,
      );

    const inputFingerprint =
      createHash("sha256")
        .update(
          JSON.stringify({
            pipelineVersion:
              PERSONAL_PREFERENCE_PIPELINE_VERSION,
            model:
              PERSONAL_PREFERENCE_MODEL,
            category,
            customPreference,
            products:
              personalPreferenceEvidence,
          }),
          "utf8",
        )
        .digest("hex");

    const estimatedOpenAiCalls =
      customPreference
        ? 1
        : 0;

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        category,
        budgetChoice,
        customPreference,
        pipelineVersion:
          PERSONAL_PREFERENCE_PIPELINE_VERSION,
        inputFingerprint,
        productCount: products.length,
        requestedProductCount:
          requestedProductCount || null,
        estimatedOpenAiCalls,
        paidApiCalls: 0,
        dbWrites: 0,
        interpretedPreferences:
          customPreference
            ? undefined
            : [],
        productScores:
          customPreference
            ? undefined
            : [],
        analysisMode:
          customPreference
            ? "custom_preference_paid_precheck"
            : "no_custom_preference_precheck",
      });
    }

    // 자유입력 조건이 없으면 개인조건 점수를 만들지 않습니다.
    // 예산은 advisor-recommendations에서 최종 점수에 딱 한 번만 적용합니다.
    if (!customPreference) {
      return NextResponse.json({
        success: true,
        category,
        budgetChoice,
        customPreference,
        interpretedPreferences: [],
        productScores: [],
        analysisMode: "no_custom_preference",
        pipelineVersion:
          PERSONAL_PREFERENCE_PIPELINE_VERSION,
        inputFingerprint,
        paidApiCalls: 0,
        dbWrites: 0,
      });
    }

    if (!requestedFingerprint) {
      return NextResponse.json(
        {
          success: false,
          stage: "precheck",
          pipelineVersion:
            PERSONAL_PREFERENCE_PIPELINE_VERSION,
          inputFingerprint,
          estimatedOpenAiCalls: 1,
          paidApiCalls: 0,
          dbWrites: 0,
          message:
            "유료 개인조건 AI 분석에는 dryRun에서 받은 inputFingerprint가 필요합니다.",
        },
        { status: 400 },
      );
    }

    if (
      requestedFingerprint !==
      inputFingerprint
    ) {
      return NextResponse.json(
        {
          success: false,
          stage: "precheck",
          pipelineVersion:
            PERSONAL_PREFERENCE_PIPELINE_VERSION,
          inputFingerprint,
          estimatedOpenAiCalls: 1,
          paidApiCalls: 0,
          dbWrites: 0,
          message:
            "개인조건 분석 입력이 무료 사전검증 이후 변경되었습니다. 다시 사전검증해 주세요.",
        },
        { status: 409 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          pipelineVersion:
            PERSONAL_PREFERENCE_PIPELINE_VERSION,
          inputFingerprint,
          paidApiCalls: 0,
          dbWrites: 0,
          message:
            "OPENAI_API_KEY가 설정되지 않았습니다.",
        },
        { status: 500 },
      );
    }

    const client = new OpenAI({
      apiKey,
      maxRetries: 0,
    });

    paidApiCalls += 1;

    const response = await client.responses.create({
      model:
        PERSONAL_PREFERENCE_MODEL,
      reasoning: { effort: "minimal" },
      max_output_tokens: 1200,
      text: {
        format: {
          type: "json_schema",
          name: "personal_preference_evaluation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              interpretedPreferences: {
                type: "array",
                maxItems: 8,
                items: { type: "string" },
              },
              products: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    productId: { type: "string" },
                    score: {
                      type: "integer",
                      minimum: 0,
                      maximum: 100,
                    },
                    reason: { type: "string" },
                  },
                  required: ["productId", "score", "reason"],
                },
              },
            },
            required: ["interpretedPreferences", "products"],
          },
        },
      },
      input: `
당신은 Project D의 개인 구매조건 평가 엔진입니다.

카테고리: ${category}

사용자가 직접 적은 추가 조건:
${customPreference}

비교 제품 핵심 데이터:
${JSON.stringify(personalPreferenceEvidence)}

위 데이터는 개인조건 평가에 필요한 가격·상세분석·리뷰분석의 핵심 정보만 압축한 것입니다.
원문 전체가 없다는 이유로 정보를 추측하지 마세요. 제공된 근거 안에서만 평가하세요.

각 제품을 사용자가 직접 적은 '자유입력 추가 조건'에 얼마나 잘 맞는지 0~100점으로 평가하세요.

중요: 예산은 이 단계에서 평가하지 마세요. 예산 적합성은 별도의 최종 추천 서버에서 한 번만 계산합니다.

중요 원칙:
- 사용자가 적은 조건은 기존 카테고리 TOP 5에 없더라도 반드시 별도 개인조건으로 평가하세요.
- 자유입력에 사용자가 직접 가격/예산 관련 문장을 적었더라도 여기서는 가격 점수나 예산 페널티를 만들지 마세요. 최종 예산 처리는 별도 서버 계산을 따릅니다.
- "절대", "반드시", "꼭", "무조건", "넘으면 안 됨" 같은 표현은 강한 제약으로 해석하세요.
- "되도록", "조금", "가능하면"은 선호 조건으로 해석하세요.
- 무게, 크기, A/S, 고장률, 내구성, 브랜드, 소모품 등 어떤 조건도 제품 데이터에서 근거를 찾아 비교하세요.
- 판매자 주장과 실제 리뷰가 충돌하면 리뷰를 더 강한 실사용 근거로 보되 단정하지 마세요.
- 정보가 없는 조건은 추측하지 마세요.
- 제품별 score 차이를 억지로 벌리거나 같게 만들지 마세요. 실제 근거 차이에 따라 평가하세요.
- reason은 제품당 1~2문장, 120자 안팎으로 간결하게 작성하세요.
- 반드시 제공된 출력 스키마를 지키세요.
`,
    });

    const responseRecord =
      response as unknown as
        Record<string, unknown>;

    paidResponseAudit = {
      responseId:
        text(responseRecord.id),
      responseStatus:
        text(responseRecord.status),
      rawModelOutputText:
        response.output_text ?? "",
    };

    const output =
      response.output_text?.trim();

    if (!output) {
      throw new Error(
        "AI가 개인조건 평가를 반환하지 않았습니다.",
      );
    }

    let parsed:
      Record<string, unknown>;

    try {
      parsed = parseJson(output);
    } catch (parseError) {
      console.error(
        "Structured personal preference JSON parse error:",
        parseError,
        output,
      );

      throw new Error(
        "AI 개인조건 응답 형식이 올바르지 않습니다. 저장된 응답을 확인한 뒤 다시 판단해야 합니다.",
      );
    }

    const rawProducts = parsed.products;
    assertExactUniqueProductMembership(
      rawProducts,
      products.map((product) => String(product.id)),
    );

    const validIds =
      new Set(
        products.map(
          (product) =>
            String(product.id),
        ),
      );

    const productScores =
      rawProducts
        .map((item) => {
          if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item)
          ) {
            return null;
          }

          const row =
            item as Record<string, unknown>;

          const productId =
            text(row.productId);

          const rawScore =
            Number(row.score);

          if (
            !validIds.has(productId) ||
            !Number.isFinite(rawScore)
          ) {
            return null;
          }

          return {
            productId,
            score:
              Math.max(
                0,
                Math.min(
                  100,
                  Math.round(rawScore),
                ),
              ),
            reason:
              text(row.reason) ||
              "개인조건 평가 근거가 없습니다.",
          };
        })
        .filter(
          (
            item,
          ): item is {
            productId: string;
            score: number;
            reason: string;
          } => item !== null,
        );

    assertExactUniqueProductMembership(
      productScores,
      products.map(
        (product) =>
          String(
            product.id,
          ),
      ),
    );

    const interpretedPreferences =
      Array.isArray(
        parsed.interpretedPreferences,
      )
        ? parsed.interpretedPreferences
            .map(text)
            .filter(Boolean)
            .slice(0, 8)
        : [];

    return NextResponse.json({
      success: true,
      category,
      budgetChoice,
      customPreference,
      interpretedPreferences,
      productScores,
      analysisMode:
        "custom_preference_only_structured_ai",
      pipelineVersion:
        PERSONAL_PREFERENCE_PIPELINE_VERSION,
      inputFingerprint,
      paidApiCalls,
      dbWrites: 0,
    });
  } catch (error) {
    console.error(
      "Personal preference analysis error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        paidApiCalls,
        dbWrites: 0,
        paidResponseAudit,
        message:
          error instanceof Error
            ? error.message
            : "개인 구매조건을 분석하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
