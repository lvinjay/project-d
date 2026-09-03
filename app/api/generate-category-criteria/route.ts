import OpenAI from "openai";
import {
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "../../../lib/supabaseAdmin";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type GenerateCriteriaRequest = {
  category?: string;
};

type ProductRow = {
  id: string;
  category: string;
  product_name: string;
  source_url: string;
  review_analysis:
    | Record<string, unknown>
    | null;
  product_detail_analysis:
    | Record<string, unknown>
    | null;
};

type Criterion = {
  key: string;
  label: string;
  shortDescription: string;
  helpTitle: string;
  helpText: string;
  sourceType: string;
  defaultWeight: number;
  importanceReason: string;
  evidence: string[];
};

type PersonalizationOption = {
  label: string;
  value: string;
  weightAdjustments:
    Record<string, number>;
};

type PersonalizationQuestion = {
  key: string;
  question: string;
  reason: string;
  options:
    PersonalizationOption[];
};

type CommonCaution = {
  title: string;
  description: string;
  affectedProducts: string[];
  affectedCount: number;
};

function normalizeText(
  value: unknown,
) {
  return typeof value === "string"
    ? value
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function extractJson(
  text: string,
) {
  const cleaned =
    text
      .replace(
        /^```json\s*/i,
        "",
      )
      .replace(
        /^```\s*/i,
        "",
      )
      .replace(
        /\s*```$/i,
        "",
      )
      .trim();

  return JSON.parse(
    cleaned,
  ) as Record<
    string,
    unknown
  >;
}

function normalizeKey(
  value: unknown,
  index: number,
) {
  const raw =
    normalizeText(value)
      .toLowerCase();

  const normalized =
    raw
      .replace(
        /[^a-z0-9_]+/g,
        "_",
      )
      .replace(
        /^_+|_+$/g,
        "",
      )
      .slice(
        0,
        50,
      );

  return (
    normalized ||
    `criterion_${index + 1}`
  );
}

function normalizeCriteria(
  raw: unknown,
): Criterion[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const result:
    Criterion[] = [];

  const seen =
    new Set<string>();

  for (
    let index = 0;
    index < raw.length;
    index++
  ) {
    const item =
      raw[index];

    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const record =
      item as Record<
        string,
        unknown
      >;

    let key =
      normalizeKey(
        record.key,
        index,
      );

    if (seen.has(key)) {
      key =
        `${key}_${index + 1}`;
    }

    seen.add(key);

    const label =
      normalizeText(
        record.label,
      );

    if (!label) {
      continue;
    }

    const weightValue =
      Number(
        record.defaultWeight,
      );

    const defaultWeight =
      Number.isFinite(
        weightValue,
      )
        ? Math.max(
            1,
            Math.min(
              10,
              Math.round(
                weightValue,
              ),
            ),
          )
        : 5;

    const evidence =
      Array.isArray(
        record.evidence,
      )
        ? record.evidence
            .filter(
              (
                value,
              ): value is string =>
                typeof value ===
                "string",
            )
            .map(
              (value) =>
                value.trim(),
            )
            .filter(
              Boolean,
            )
            .slice(
              0,
              4,
            )
        : [];

    result.push({
      key,

      label,

      shortDescription:
        normalizeText(
          record.shortDescription,
        ) ||
        "제품 선택 시 비교할 핵심 기준입니다.",

      helpTitle:
        normalizeText(
          record.helpTitle,
        ) ||
        `${label}은 왜 중요한가요?`,

      helpText:
        normalizeText(
          record.helpText,
        ) ||
        "제품별 차이와 실제 사용에 미치는 영향을 비교합니다.",

      sourceType:
        normalizeText(
          record.sourceType,
        ) ||
        "detail_and_review",

      defaultWeight,

      importanceReason:
        normalizeText(
          record.importanceReason,
        ),

      evidence,
    });
  }

  return result.slice(
    0,
    5,
  );
}

function normalizePersonalizationQuestions(
  value: unknown,
  validCriterionKeys:
    string[],
): PersonalizationQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const validKeys =
    new Set(
      validCriterionKeys,
    );

  const result:
    PersonalizationQuestion[] =
      [];

  for (
    let questionIndex = 0;
    questionIndex <
    value.length;
    questionIndex++
  ) {
    const item =
      value[
        questionIndex
      ];

    if (
      !item ||
      typeof item !==
        "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const row =
      item as Record<
        string,
        unknown
      >;

    const question =
      normalizeText(
        row.question,
      );

    if (!question) {
      continue;
    }

    const key =
      normalizeText(
        row.key,
      ) ||
      `question_${questionIndex + 1}`;

    const rawOptions =
      Array.isArray(
        row.options,
      )
        ? row.options
        : [];

    const options:
      PersonalizationOption[] =
        [];

    for (
      let optionIndex = 0;
      optionIndex <
      rawOptions.length;
      optionIndex++
    ) {
      const option =
        rawOptions[
          optionIndex
        ];

      if (
        !option ||
        typeof option !==
          "object" ||
        Array.isArray(option)
      ) {
        continue;
      }

      const optionRow =
        option as Record<
          string,
          unknown
        >;

      const label =
        normalizeText(
          optionRow.label,
        );

      if (!label) {
        continue;
      }

      const optionValue =
        normalizeText(
          optionRow.value,
        ) ||
        `option_${optionIndex + 1}`;

      const rawAdjustments =
        optionRow
          .weightAdjustments &&
        typeof optionRow
          .weightAdjustments ===
          "object" &&
        !Array.isArray(
          optionRow
            .weightAdjustments,
        )
          ? (
              optionRow
                .weightAdjustments as Record<
                string,
                unknown
              >
            )
          : {};

      const weightAdjustments:
        Record<
          string,
          number
        > = {};

      for (
        const [
          criterionKey,
          rawAmount,
        ] of Object.entries(
          rawAdjustments,
        )
      ) {
        if (
          !validKeys.has(
            criterionKey,
          )
        ) {
          continue;
        }

        const amount =
          Number(
            rawAmount,
          );

        if (
          !Number.isFinite(
            amount,
          ) ||
          amount === 0
        ) {
          continue;
        }

        weightAdjustments[
          criterionKey
        ] =
          Math.max(
            -3,
            Math.min(
              3,
              Math.round(
                amount,
              ),
            ),
          );
      }

      options.push({
        label,
        value:
          optionValue,
        weightAdjustments,
      });
    }

    if (
      options.length < 2
    ) {
      continue;
    }

    result.push({
      key,

      question,

      reason:
        normalizeText(
          row.reason,
        ),

      options:
        options.slice(
          0,
          5,
        ),
    });
  }

  return result.slice(
    0,
    3,
  );
}

function normalizeCommonCautions(
  value: unknown,
): CommonCaution[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result:
    CommonCaution[] = [];

  for (
    const item of value
  ) {
    if (
      !item ||
      typeof item !==
        "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const row =
      item as Record<
        string,
        unknown
      >;

    const title =
      normalizeText(
        row.title,
      );

    const description =
      normalizeText(
        row.description,
      );

    const affectedProducts =
      Array.isArray(
        row.affectedProducts,
      )
        ? row.affectedProducts
            .filter(
              (
                value,
              ): value is string =>
                typeof value ===
                "string",
            )
            .map(
              (value) =>
                value.trim(),
            )
            .filter(
              Boolean,
            )
        : [];

    if (
      !title ||
      !description ||
      affectedProducts.length <
        2
    ) {
      continue;
    }

    result.push({
      title,
      description,
      affectedProducts,
      affectedCount:
        affectedProducts.length,
    });
  }

  return result.slice(
    0,
    4,
  );
}

export async function POST(
  request: Request,
) {
  try {
    const apiKey =
      process.env
        .OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            "OPENAI_API_KEY가 설정되지 않았습니다.",
        },
        {
          status: 500,
        },
      );
    }

    const body =
      (
        await request.json()
      ) as GenerateCriteriaRequest;

    const category =
      normalizeText(
        body.category,
      );

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message:
            "카테고리가 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("products")
        .select(
          "id, category, product_name, source_url, review_analysis, product_detail_analysis",
        )
        .eq(
          "category",
          category,
        )
        .order(
          "created_at",
          {
            ascending: true,
          },
        );

    if (error) {
      throw error;
    }

    const products =
      (
        data ?? []
      ) as ProductRow[];

    if (
      products.length < 3
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            `구매기준 생성을 위해 최소 3개 제품이 필요합니다. 현재 ${products.length}개입니다.`,
        },
        {
          status: 400,
        },
      );
    }

    const sourceProducts =
      products.slice(
        0,
        5,
      );

    const productEvidence =
      sourceProducts.map(
        (
          product,
        ) => ({
          productId:
            product.id,

          productName:
            product.product_name,

          sourceUrl:
            product.source_url,

          productDetailAnalysis:
            product.product_detail_analysis,

          reviewAnalysis:
            product.review_analysis,
        }),
      );

    const detailReadyCount =
      sourceProducts.filter(
        (
          product,
        ) =>
          Boolean(
            product
              .product_detail_analysis,
          ),
      ).length;

    if (
      detailReadyCount < 3
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            `구매기준 생성을 위해 상세정보가 있는 제품이 최소 3개 필요합니다. 현재 ${detailReadyCount}개입니다.`,
        },
        {
          status: 400,
        },
      );
    }

    const client =
      new OpenAI({
        apiKey,
      });

    const prompt = `
당신은 Project D의 카테고리 구매기준 설계 엔진입니다.

카테고리:
${category}

비교 대상 제품 수:
${sourceProducts.length}

현재 확보한 제품별 근거:
${JSON.stringify(
  productEvidence,
  null,
  2,
)}

목표:

이 카테고리에서 실제 소비자가 제품을 비교할 때
구매결정을 크게 바꾸는 핵심 기준 5개를 정확히 선정하세요.

또한 사용자 상황에 따라 추천 순위가 달라질 수 있도록
개인화 질문 2~3개를 만드세요.

분석 원칙:

1. 제공된 productDetailAnalysis와 reviewAnalysis를 우선 근거로 사용하세요.
2. 근거가 없는 구체적인 숫자나 사양을 만들어내지 마세요.
3. 단순히 카테고리에서 일반적으로 중요하다는 이유만으로 기준을 만들지 마세요.
4. 현재 비교 제품 사이에서 실제 차이가 있고 구매결정에 영향을 주는 기준을 우선하세요.
5. 가격과 예산은 Project D에서 별도로 처리하므로 구매기준 5개에 넣지 마세요.
6. 서로 매우 비슷하거나 사실상 같은 의미의 기준을 두 개 이상 만들지 마세요.
7. 특정 제품에만 유리하도록 기준을 만들지 마세요.
8. 성능뿐 아니라 유지관리, 사용 편의성, 안정성 등 실제 구매 후 만족에 영향을 주는 요소도 고려하세요.
9. 제품 상세정보가 부족한 항목은 억지로 기준에 포함하지 마세요.

10. 리뷰 수, 판매량, 판매 순위, 브랜드 인지도, 커뮤니티 규모 같은 항목은 제품 자체의 품질이나 사용성능이 아니므로 핵심 구매기준 5개에 포함하지 마세요.
11. 리뷰 수는 분석 신뢰도를 판단하는 보조자료로만 사용하고 제품 성능점수의 직접 기준으로 사용하지 마세요.
12. '기능이 제품명에 표기되어 있는가', '판매페이지에 문구가 있는가' 자체를 구매기준으로 만들지 마세요.
13. 판매페이지 표기는 실제 기능이나 성능을 파악하기 위한 근거일 뿐이며, 최종 기준은 소비자가 체감하는 성능·편의·안정성 관점으로 표현하세요.

14. 가능한 한 현재 후보 5개 중 최소 4개 제품을 같은 척도로 비교할 수 있는 기준을 우선하세요.
15. 특정 기준에서 5개 중 2개 이상 제품의 근거가 사실상 없어 점수를 낼 수 없을 가능성이 높다면 그 기준은 TOP 5에서 제외하는 것을 우선 고려하세요.
16. 정보 부족 때문에 일부 제품만 평가 가능한 좁은 사양보다 여러 제품을 공정하게 상대비교할 수 있는 상위 개념의 기준을 우선하세요.

17. 서로 연결된 세부 기능들은 가능하면 소비자가 이해하기 쉬운 하나의 상위 구매기준으로 통합하세요.
18. 서로 다른 세부 사양이나 기능이 결국 같은 사용자 체감 결과를 설명한다면 여러 기준으로 쪼개지 말고 하나의 상위 구매기준으로 통합하세요.
19. 기술 명칭, 센서명, 칩셋명, 기능 이름 자체보다 그것이 실제 성능·편의성·품질·안정성에 어떤 차이를 만드는지를 기준으로 삼으세요.
20. 여러 자동화 기능이나 보조 기능이 하나의 사용경험을 함께 개선한다면 필요에 따라 하나의 소비자 관점 기준으로 통합하세요.

21. 최종 5개 기준은 서로 다른 구매 고민을 대표해야 합니다.
22. 제품군에 따라 핵심 성능, 품질, 기능성, 유지관리, 사용편의, 휴대성, 호환성, 내구성, 안정성 등 서로 다른 축 중 실제 데이터로 비교 가능한 요소를 균형 있게 검토하세요.
23. 특정 상품군을 미리 가정하지 말고 현재 category와 제공된 제품 데이터에서 확인되는 차이를 기준으로 선정하세요.

24. 기준 key는 영문 snake_case로 작성하세요.
25. sourceType은 spec, review, detail_and_review, price_and_review 중 가장 적합한 값을 사용하세요.
26. defaultWeight는 일반 사용자에게 해당 기준이 얼마나 중요한지 1~10 정수로 작성하세요.
27. evidence에는 제공된 데이터에서 확인되는 실제 근거를 짧게 요약하세요.

28. personalizationQuestions는 2개 또는 3개만 만드세요.
29. 개인화 질문은 답변에 따라 실제 추천 순위가 달라질 만한 질문이어야 합니다.
30. 예산 질문은 만들지 마세요.
31. 각 개인화 선택지의 weightAdjustments는 생성된 criteria key만 사용하세요.
32. weightAdjustments는 -3~+3의 정수이며 실제 영향을 받는 기준만 넣으세요.

33. commonCautions는 최소 2개 이상의 제품에서 공통적으로 확인되는 주의사항만 넣으세요.
34. 특정 제품 하나에서만 나타난 문제는 commonCautions에 넣지 마세요.
35. commonCautions 근거가 충분하지 않으면 빈 배열을 반환하세요.
36. 반드시 JSON만 반환하세요. 마크다운은 사용하지 마세요.

반환 형식:

{
  "title": "${category} 구매 가이드",
  "introduction": "초보 구매자가 이해할 수 있는 2~3문장 설명",
  "criteria": [
    {
      "key": "example_key",
      "label": "사용자에게 보여줄 구매기준 이름",
      "shortDescription": "무엇을 비교하는 기준인지 한 문장 설명",
      "helpTitle": "왜 이 기준이 중요한가요?",
      "helpText": "구매자가 어떤 차이를 확인해야 하는지 설명",
      "sourceType": "detail_and_review",
      "defaultWeight": 8,
      "importanceReason": "이 기준이 핵심 구매기준인 이유",
      "evidence": [
        "실제 확보된 제품 데이터에서 확인된 근거"
      ]
    }
  ],
  "personalizationQuestions": [
    {
      "key": "usage_environment",
      "question": "사용자 상황을 묻는 질문",
      "reason": "이 질문이 추천 순위를 바꾸는 이유",
      "options": [
        {
          "label": "사용자가 보는 선택지",
          "value": "short_value",
          "weightAdjustments": {
            "실제_criteria_key": 2
          }
        }
      ]
    }
  ],
  "commonCautions": [
    {
      "title": "공통 주의사항",
      "description": "소비자가 이해하기 쉬운 설명",
      "affectedProducts": [
        "실제 제품명"
      ]
    }
  ]
}

반드시 criteria는 정확히 5개,
personalizationQuestions는 2개 또는 3개를 반환하세요.
`;

    const response =
      await client.responses.create(
        {
          model:
            "gpt-5",
          input:
            prompt,
        },
      );

    const outputText =
      response
        .output_text
        ?.trim();

    if (!outputText) {
      throw new Error(
        "AI가 구매기준 결과를 반환하지 않았습니다.",
      );
    }

    const parsed =
      extractJson(
        outputText,
      );

    const criteria =
      normalizeCriteria(
        parsed.criteria,
      );

    if (
      criteria.length !== 5
    ) {
      throw new Error(
        `AI가 구매기준 5개를 올바르게 생성하지 못했습니다. 현재 ${criteria.length}개입니다.`,
      );
    }

    const personalizationQuestions =
      normalizePersonalizationQuestions(
        parsed.personalizationQuestions,
        criteria.map(
          (
            criterion,
          ) =>
            criterion.key,
        ),
      );

    if (
      personalizationQuestions.length <
        2 ||
      personalizationQuestions.length >
        3
    ) {
      throw new Error(
        `AI가 개인화 질문 2~3개를 올바르게 생성하지 못했습니다. 현재 ${personalizationQuestions.length}개입니다.`,
      );
    }

    const commonCautions =
      normalizeCommonCautions(
        parsed.commonCautions,
      );

    const title =
      normalizeText(
        parsed.title,
      ) ||
      `${category} 구매 가이드`;

    const introduction =
      normalizeText(
        parsed.introduction,
      ) ||
      `${category} 구매 시 제품별 핵심 차이를 비교해 보세요.`;

    const {
      data: existing,
      error:
        existingError,
    } =
      await supabaseAdmin
        .from(
          "category_profiles",
        )
        .select(
          "id, use_cases, candidate_limit",
        )
        .eq(
          "category",
          category,
        )
        .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    const payload = {
      title,
      introduction,
      criteria,

      personalization_questions:
        personalizationQuestions,

      common_cautions:
        commonCautions,

      candidate_limit:
        Math.min(
          5,
          products.length,
        ),

      updated_at:
        new Date()
          .toISOString(),
    };

    if (existing) {
      const {
        error:
          updateError,
      } =
        await supabaseAdmin
          .from(
            "category_profiles",
          )
          .update(
            payload,
          )
          .eq(
            "id",
            existing.id,
          );

      if (updateError) {
        throw updateError;
      }
    } else {
      const {
        error:
          insertError,
      } =
        await supabaseAdmin
          .from(
            "category_profiles",
          )
          .insert({
            category,

            ...payload,

            use_cases: [],
          });

      if (insertError) {
        throw insertError;
      }
    }

    return NextResponse.json({
      success: true,

      category,

      analyzedProductCount:
        sourceProducts.length,

      detailReadyCount,

      title,

      introduction,

      criteria,

      personalizationQuestions,

      commonCautions,

      message:
        `${category} 핵심 구매기준 5개와 개인화 질문 ${personalizationQuestions.length}개를 생성했습니다.`,
    });
  } catch (error) {
    console.error(
      "Generate category criteria API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "카테고리 구매기준 생성 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}


