import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerateCriteriaRequest = {
  category?: string;
};

type ProductRow = {
  id: string;
  category: string;
  product_name: string;
  source_url: string;
  review_analysis: Record<string, unknown> | null;
  product_detail_analysis: Record<string, unknown> | null;
};

type Criterion = {
  key: string;
  label: string;
  shortDescription: string;
  helpTitle: string;
  helpText: string;
  sourceType: string;
  defaultWeight: number;
  importanceReason?: string;
  evidence?: string[];
};

type PersonalizationOption = {
  label: string;
  value: string;
  weightAdjustments: Record<string, number>;
};

type PersonalizationQuestion = {
  key: string;
  question: string;
  reason: string;
  options: PersonalizationOption[];
};

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return stripHtml(match[1]);
  }

  return "";
}

async function fetchProductPageSummary(sourceUrl: string) {
  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
      },
    });

    const html = await response.text();
    const blocked =
      response.status === 403 ||
      response.status === 418 ||
      html.includes("비정상적인 접근") ||
      html.includes("접근이 제한") ||
      html.includes("Access Denied");

    if (!response.ok || blocked) {
      return {
        ok: false,
        status: response.status,
        description: "",
        visibleText: "",
      };
    }

    const description =
      extractMeta(html, "og:description") ||
      extractMeta(html, "description");

    const visibleText = stripHtml(html).slice(0, 7000);

    return {
      ok: true,
      status: response.status,
      description,
      visibleText,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      description: "",
      visibleText: "",
    };
  }
}

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as Record<string, unknown>;
}

function normalizeCommonCautions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const description =
        typeof row.description === "string" ? row.description.trim() : "";
      const affectedProducts = Array.isArray(row.affectedProducts)
        ? row.affectedProducts
            .filter((name): name is string => typeof name === "string")
            .map((name) => name.trim())
            .filter(Boolean)
        : [];

      if (!title || !description || affectedProducts.length < 2) return null;

      return {
        title,
        description,
        affectedProducts,
        affectedCount: affectedProducts.length,
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeKey(value: unknown, index: number) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const normalized = raw
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);

  return normalized || `criterion_${index + 1}`;
}

function normalizeCriteria(raw: unknown): Criterion[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const result: Criterion[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const record = item as Record<string, unknown>;
    let key = normalizeKey(record.key, index);
    if (seen.has(key)) key = `${key}_${index + 1}`;
    seen.add(key);

    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!label) continue;

    const defaultWeightRaw = Number(record.defaultWeight);
    const defaultWeight = Number.isFinite(defaultWeightRaw)
      ? Math.max(1, Math.min(10, Math.round(defaultWeightRaw)))
      : 5;

    const evidence = Array.isArray(record.evidence)
      ? record.evidence
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];

    result.push({
      key,
      label,
      shortDescription:
        typeof record.shortDescription === "string"
          ? record.shortDescription.trim()
          : "구매 전에 비교할 가치가 큰 기준입니다.",
      helpTitle:
        typeof record.helpTitle === "string"
          ? record.helpTitle.trim()
          : `${label}은 왜 중요한가요?`,
      helpText:
        typeof record.helpText === "string"
          ? record.helpText.trim()
          : "제품별 차이를 확인해야 합니다.",
      sourceType:
        typeof record.sourceType === "string"
          ? record.sourceType.trim()
          : "detail_and_review",
      defaultWeight,
      importanceReason:
        typeof record.importanceReason === "string"
          ? record.importanceReason.trim()
          : "",
      evidence,
    });
  }

  return result.slice(0, 5);
}


function normalizePersonalizationQuestions(
  value: unknown,
  validCriterionKeys: string[],
): PersonalizationQuestion[] {
  if (!Array.isArray(value)) return [];

  const validKeys = new Set(validCriterionKeys);

  return value
    .map((item, questionIndex) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;

      const question =
        typeof row.question === "string" ? row.question.trim() : "";
      if (!question) return null;

      const key =
        typeof row.key === "string" && row.key.trim()
          ? row.key.trim()
          : `question_${questionIndex + 1}`;

      const reason =
        typeof row.reason === "string" ? row.reason.trim() : "";

      const rawOptions = Array.isArray(row.options) ? row.options : [];
      const options = rawOptions
        .map((option, optionIndex) => {
          if (!option || typeof option !== "object" || Array.isArray(option)) {
            return null;
          }

          const optionRow = option as Record<string, unknown>;
          const label =
            typeof optionRow.label === "string" ? optionRow.label.trim() : "";
          if (!label) return null;

          const optionValue =
            typeof optionRow.value === "string" && optionRow.value.trim()
              ? optionRow.value.trim()
              : `option_${optionIndex + 1}`;

          const rawAdjustments =
            optionRow.weightAdjustments &&
            typeof optionRow.weightAdjustments === "object" &&
            !Array.isArray(optionRow.weightAdjustments)
              ? (optionRow.weightAdjustments as Record<string, unknown>)
              : {};

          const weightAdjustments: Record<string, number> = {};

          for (const [criterionKey, rawAmount] of Object.entries(rawAdjustments)) {
            if (!validKeys.has(criterionKey)) continue;

            const amount =
              typeof rawAmount === "number"
                ? rawAmount
                : typeof rawAmount === "string"
                  ? Number(rawAmount)
                  : NaN;

            if (!Number.isFinite(amount) || amount === 0) continue;

            weightAdjustments[criterionKey] = Math.max(
              -3,
              Math.min(3, Math.round(amount)),
            );
          }

          return {
            label,
            value: optionValue,
            weightAdjustments,
          };
        })
        .filter((option): option is PersonalizationOption => Boolean(option))
        .slice(0, 5);

      if (options.length < 2) return null;

      return {
        key,
        question,
        reason,
        options,
      };
    })
    .filter((question): question is PersonalizationQuestion => Boolean(question))
    .slice(0, 3);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "OPENAI_API_KEY가 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as GenerateCriteriaRequest;
    const category = typeof body.category === "string" ? body.category.trim() : "";

    if (!category) {
      return NextResponse.json(
        { success: false, message: "카테고리가 필요합니다." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("products")
      .select("id, category, product_name, source_url, review_analysis, product_detail_analysis")
      .eq("category", category)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const products = (data ?? []) as ProductRow[];

    if (products.length < 3) {
      return NextResponse.json(
        {
          success: false,
          message: "구매기준 자동 생성을 위해 같은 카테고리 제품을 최소 3개 등록해 주세요.",
        },
        { status: 400 },
      );
    }

    const sourceProducts = products.slice(0, 5);

    const productEvidence = sourceProducts.map((product) => ({
      productName: product.product_name,
      sourceUrl: product.source_url,
      productDetailAnalysis: product.product_detail_analysis,
      reviewAnalysis: product.review_analysis,
      evidenceAvailability: {
        hasBrowserDetailAnalysis: Boolean(product.product_detail_analysis),
        hasReviewAnalysis: Boolean(product.review_analysis),
      },
    }));

    const detailReadyCount = productEvidence.filter(
      (product) => product.evidenceAvailability.hasBrowserDetailAnalysis,
    ).length;

    const reviewReadyCount = productEvidence.filter(
      (product) => product.evidenceAvailability.hasReviewAnalysis,
    ).length;

    if (detailReadyCount < 3) {
      return NextResponse.json(
        {
          success: false,
          message:
            `구매기준 V3 생성을 위해 상세정보 분석 완료 제품이 최소 3개 필요합니다. 현재 ${detailReadyCount}개입니다.`,
        },
        { status: 400 },
      );
    }

    const client = new OpenAI({ apiKey });

    const prompt = `
당신은 Project D의 카테고리 구매기준 설계자입니다.

목표는 운영자가 기준이나 질문을 직접 정하는 것이 아니라, 같은 카테고리의 대표 제품 상세페이지와 실제 리뷰 분석을 보고
1) 소비자가 정말 비교해야 할 핵심 구매기준 5개와
2) 개인별 추천 순위를 실제로 바꾸는 맞춤 질문 2~3개와
3) 여러 비교 제품에서 의미상 반복되는 제품군 공통 한계 0~4개를
자동으로 설계하는 것입니다.

카테고리: ${category}
분석 제품 수: ${sourceProducts.length}

제품별 근거 데이터:
${JSON.stringify(productEvidence, null, 2)}

데이터 상태:
- 브라우저 상세정보 분석 완료: ${detailReadyCount}/${sourceProducts.length}개
- 리뷰 분석 완료: ${reviewReadyCount}/${sourceProducts.length}개

중요:
- productDetailAnalysis는 사용자의 실제 브라우저에서 상품 상세페이지를 펼친 뒤 수집·분석한 데이터입니다. 서버에서 다시 상품페이지를 읽으려고 하지 말고 이 데이터를 상세페이지의 주 근거로 사용하세요.
- reviewAnalysis는 실제 리뷰 분석 결과입니다.
- 두 데이터가 충돌하면 임의로 사실을 확정하지 말고 evidence에서 근거의 성격을 구분하세요.
- 단순히 카테고리에서 일반적으로 중요하다고 알려진 항목을 떠올리지 말고, 제공된 제품들 사이에서 실제 차이가 확인되는지를 반드시 평가하세요.

선정 절차:
1. 먼저 내부적으로 구매기준 후보를 최소 8개, 최대 12개까지 폭넓게 찾으세요.
2. 후보는 아래 세 축을 모두 검토해서 만드세요.
   A) 판매자/상세페이지 축: 판매자가 경쟁적으로 강조하는 스펙, 기능, 구조, 성능, 차별점
   B) 실사용자/리뷰 축: 만족·불만·후회·고장·사용 불편·설치·소음·성능 등 반복되는 실제 경험
   C) 구매경제성/리스크 축: A/S, 내구성, 유지비, 소모품, 고장 리스크, 보증 등
   ※ 가격/예산은 Project D가 모든 카테고리에 공통으로 별도 적용하므로 TOP 5 자리에는 넣지 마세요.
3. 각 후보마다 아래 네 가지를 내부적으로 평가하세요.
   - 구매결정 영향도: 이 차이 때문에 제품 선택이 실제로 달라지는가?
   - 제품 간 변별력: 현재 제품들 사이에 의미 있는 차이가 실제 데이터로 확인되는가?
   - 근거 강도: 상세정보 또는 리뷰에서 충분한 근거가 있는가?
   - 초보자 필요도: 구매자가 모르고 지나치면 잘못 고를 가능성이 큰가?
4. 의미가 겹치는 후보는 하나의 상위 구매기준으로 통합하세요. 예: BTU와 풍량이 모두 '냉방 성능'을 설명한다면 별도 두 자리를 쓰지 마세요.
5. 객관 스펙 후보와 실사용/리스크 후보를 서로 경쟁시키세요. 스펙이라는 이유만으로 우선하지 말고 A/S·내구성·가격·가성비·유지관리도 같은 기준으로 평가하세요.
6. '이 기준 때문에 제품 A 대신 B를 선택할 가능성이 실제로 달라지는가?'에 답하기 어려운 후보는 TOP 5에서 제외하세요.
7. 위 평가를 종합해 가장 중요한 정확히 5개만 최종 선정하세요.

반드시 지켜야 할 원칙:
- 핵심 구매기준은 정확히 5개를 선정하세요.
- '만족도', '품질', '휴대성', '편의성'처럼 너무 추상적이고 당연한 표현은 그 자체로 기준을 만들지 마세요. 실제 비교 가능한 하위 의미가 있을 때 구체적으로 표현하세요.
- 객관 스펙(BTU, 흡입력, 제습량, 배터리시간, 소음 dB 등)은 실제 구매 선택을 가르는 경우 적극적으로 반영하되, 비슷한 스펙끼리는 하나의 의미 있는 기준으로 묶으세요.
- 판매자가 강조하는 요소만 따라가지 마세요. 판매자가 잘 강조하지 않는 A/S·내구성·유지비·고장 리스크도 반드시 후보군에서 검토하세요.
- 가격·예산·가성비는 모든 카테고리에 공통으로 별도 평가하므로 핵심 구매기준 5개에는 넣지 마세요. 대신 제품 고유의 성능·사용성·리스크 기준 5개를 선정하세요.
- A/S·내구성은 현재 데이터와 카테고리 특성을 바탕으로 다른 후보보다 구매결정 영향도가 높을 때 TOP 5에 넣으세요.
- 리뷰에서 반복적으로 등장하는 불만이나 구매 후 후회 포인트는 판매자 소구점과 동등하거나 더 중요한 근거로 취급하세요.
- '특장점'이라는 포괄적 기준은 가급적 피하세요. 여러 제품 사이에서 실제 선택을 가르는 구체적 기능/구조가 있다면 그 이름으로 기준화하세요.
- 한 제품에만 있는 기능이라도 소비자의 선택을 크게 바꾸는 핵심 차별점이라면 후보가 될 수 있습니다. 다만 다른 제품과 비교 가능한 관점으로 표현하세요.
- 최종 5개는 서로 다른 구매 고민을 대표해야 합니다. 같은 성능축의 기준을 여러 개 넣어 5개 자리를 낭비하지 마세요.
- productDetailAnalysis가 없는 제품은 reviewAnalysis와 제품명에서 확인 가능한 근거만 사용하세요. productDetailAnalysis가 있는 제품은 그 저장 데이터를 우선 사용하세요.
- 확인되지 않은 숫자나 사실을 만들어내지 마세요.
- evidence에는 제공된 데이터에서 실제로 확인 가능한 내용만 요약하세요.
- 각 기준의 defaultWeight는 일반 소비자 기준 중요도를 1~10으로 평가하세요.
- key는 짧은 영문 snake_case로 작성하세요. 특정 카테고리에 종속되어도 괜찮습니다.
- sourceType은 spec, review, detail_and_review, price_and_review 중 가장 적절한 값을 사용하세요.

맞춤 질문 설계 원칙:
- 질문은 정확히 2개 또는 3개만 만드세요.
- 성별, 나이처럼 추천 순위를 거의 바꾸지 않는 질문은 만들지 마세요.
- 이미 구매기준 설명에서 끝나는 질문이 아니라, 사용자의 상황에 따라 제품 순위가 실제로 달라질 질문만 고르세요.
- 선택지는 질문당 2~5개로 간결하게 만드세요.
- 각 선택지는 위에서 생성한 criteria의 key만 사용해 weightAdjustments를 지정하세요.
- weightAdjustments 값은 -3~+3의 정수입니다. +는 해당 기준을 더 중요하게, -는 덜 중요하게 본다는 뜻입니다.
- 모든 기준을 억지로 조정하지 마세요. 실제로 영향을 받는 기준만 넣으세요.
- 예산/가격 질문은 만들지 마세요. 가격은 모든 카테고리에서 공통 질문으로 별도 처리합니다.
- 사용환경, 설치환경, 전원, 크기, 사용빈도, 소음 민감도, 유지관리 등도 현재 제품군에서 실제 순위를 바꿀 때만 질문으로 선정하세요.
- 질문끼리 같은 내용을 반복하지 마세요.
- 반드시 JSON만 출력하세요.

제품군 공통 한계 설계 원칙:
- 단어가 같은지가 아니라 의미가 같은지를 판단하세요.
- 각 제품의 reviewAnalysis와 productDetailAnalysis를 제품 전체를 가로질러 비교하세요.
- 서로 다른 표현이라도 같은 실사용 한계라면 하나로 통합하세요.
- 최소 2개 제품에서 근거가 확인되고, 비교 제품의 절반 이상에서 반복되는 경우에만 commonCautions에 넣으세요.
- 특정 제품에서만 두드러지는 문제는 commonCautions에 넣지 마세요.
- affectedProducts에는 실제 근거가 확인된 제품명만 정확히 넣으세요.
- 공통 한계가 충분히 확인되지 않으면 빈 배열을 반환하세요.
- 공통 한계는 제품 간 순위를 가르는 고유 단점으로 취급하면 안 됩니다.

출력 형식:
{
  "title": "이 카테고리를 살 때 무엇을 봐야 하는지 한 줄 제목",
  "introduction": "초보 구매자가 2~3문장 안에 이해할 수 있는 짧은 구매 가이드",
  "criteria": [
    {
      "key": "example_key",
      "label": "사용자에게 보여줄 짧고 명확한 기준명",
      "shortDescription": "무엇을 비교하는 기준인지 한 문장",
      "helpTitle": "초보자가 궁금해할 질문",
      "helpText": "왜 중요한지와 무엇을 보면 되는지 2문장 이내",
      "sourceType": "detail_and_review",
      "defaultWeight": 8,
      "importanceReason": "이 기준을 TOP 5에 넣은 이유",
      "evidence": ["제품 상세페이지/리뷰에서 확인된 근거 요약"]
    }
  ],
  "personalizationQuestions": [
    {
      "key": "usage_environment",
      "question": "추천 결과를 실제로 바꾸는 짧은 질문",
      "reason": "왜 이 질문이 제품 선택에 중요한지",
      "options": [
        {
          "label": "사용자에게 보여줄 선택지",
          "value": "short_value",
          "weightAdjustments": {
            "위 criteria에 실제 존재하는 key": 2
          }
        }
      ]
    }
  ],
  "commonCautions": [
    {
      "title": "제품군 공통 한계의 짧은 제목",
      "description": "소비자가 이해하기 쉬운 한 문장 설명",
      "affectedProducts": ["실제 근거가 확인된 제품명"]
    }
  ]
}
`;

    const response = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    const outputText = response.output_text?.trim();
    if (!outputText) throw new Error("AI가 구매기준을 반환하지 않았습니다.");

    const parsed = extractJson(outputText);
    const criteria = normalizeCriteria(parsed.criteria);

    if (criteria.length !== 5) {
      throw new Error("AI가 핵심 구매기준 5개를 올바르게 생성하지 못했습니다.");
    }

    const personalizationQuestions = normalizePersonalizationQuestions(
      parsed.personalizationQuestions,
      criteria.map((criterion) => criterion.key),
    );
    const commonCautions = normalizeCommonCautions(parsed.commonCautions);

    if (
      personalizationQuestions.length < 2 ||
      personalizationQuestions.length > 3
    ) {
      throw new Error(
        "AI가 맞춤 질문 2~3개를 올바르게 생성하지 못했습니다.",
      );
    }

    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : `${category} 구매 가이드`;

    const introduction =
      typeof parsed.introduction === "string" && parsed.introduction.trim()
        ? parsed.introduction.trim()
        : `${category} 구매 시 제품별 핵심 차이를 먼저 비교하세요.`;

    const { data: existing, error: existingError } = await supabase
      .from("category_profiles")
      .select("id, use_cases, candidate_limit")
      .eq("category", category)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { error: updateError } = await supabase
        .from("category_profiles")
        .update({
          title,
          introduction,
          criteria,
          personalization_questions: personalizationQuestions,
          common_cautions: commonCautions,
          candidate_limit: Math.min(5, products.length),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from("category_profiles")
        .insert({
          category,
          title,
          introduction,
          criteria,
          personalization_questions: personalizationQuestions,
          common_cautions: commonCautions,
          use_cases: [],
          candidate_limit: Math.min(5, products.length),
        });

      if (insertError) throw insertError;
    }

    return NextResponse.json({
      success: true,
      category,
      analyzedProductCount: sourceProducts.length,
      detailPageSuccessCount: detailReadyCount,
      title,
      introduction,
      criteria,
      personalizationQuestions,
      commonCautions,
      message:
        `제품 상세정보와 리뷰를 바탕으로 핵심 구매기준 5개와 맞춤 질문 ${personalizationQuestions.length}개를 자동 생성했습니다.`, 
    });
  } catch (error) {
    console.error("Generate category criteria API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "카테고리 구매기준을 자동 생성하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
