import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  productId?: string;
  browserSnapshot?: unknown;
};

type ImageCandidate = {
  index: number;
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
};

function asObject(value: unknown) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeString(
  value: unknown,
  maxLength = 1000,
) {
  return typeof value === "string"
    ? value
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
    : "";
}

function safeStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) =>
      safeString(item, maxLength),
    )
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseJson(
  value: string,
) {
  return JSON.parse(
    value
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim(),
  ) as Record<string, unknown>;
}

function normalizeImages(
  value: unknown,
): ImageCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: ImageCandidate[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const row = asObject(item);

    if (!row) continue;

    const src =
      safeString(row.src, 5000);

    if (
      !src ||
      !/^https?:\/\//i.test(src) ||
      seen.has(src)
    ) {
      continue;
    }

    const width = Number(row.width);
    const height = Number(row.height);

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 250 ||
      height < 180
    ) {
      continue;
    }

    seen.add(src);

    result.push({
      index:
        Number.isFinite(
          Number(row.index),
        )
          ? Number(row.index)
          : result.length,
      src,
      alt: safeString(
        row.alt,
        700,
      ),
      title: safeString(
        row.title,
        700,
      ),
      width,
      height,
    });
  }

  return result
    .sort(
      (a, b) =>
        a.index - b.index,
    )
    .slice(0, 100);
}

function normalizeSnapshot(
  value: unknown,
) {
  const row = asObject(value);

  if (!row) {
    return null;
  }

  const meta =
    asObject(row.meta);

  return {
    pageUrl:
      safeString(
        row.pageUrl,
        3000,
      ),
    cleanSourceUrl:
      safeString(
        row.cleanSourceUrl,
        3000,
      ),
    hostname:
      safeString(
        row.hostname,
        300,
      ),
    title:
      safeString(
        row.title,
        1500,
      ),
    meta: {
      description:
        safeString(
          meta?.description,
          4000,
        ),
      ogTitle:
        safeString(
          meta?.ogTitle,
          2000,
        ),
      ogDescription:
        safeString(
          meta?.ogDescription,
          4000,
        ),
      ogImage:
        safeString(
          meta?.ogImage,
          5000,
        ),
      ogPrice:
        safeString(
          meta?.ogPrice,
          300,
        ),
      ogCurrency:
        safeString(
          meta?.ogCurrency,
          100,
        ),
    },
    jsonLd:
      safeStringArray(
        row.jsonLd,
        8,
        12000,
      ),
    headings:
      safeStringArray(
        row.headings,
        120,
        500,
      ),
    tables:
      safeStringArray(
        row.tables,
        30,
        4000,
      ),
    definitionLists:
      safeStringArray(
        row.definitionLists,
        40,
        2500,
      ),
    imageTexts:
      safeStringArray(
        row.imageTexts,
        250,
        700,
      ),
    buttonAndLabels:
      safeStringArray(
        row.buttonAndLabels,
        250,
        500,
      ),
    visibleText:
      safeString(
        row.visibleText,
        65000,
      ),
    imageCandidates:
      normalizeImages(
        row.imageCandidates,
      ),
  };
}

function imagePriority(
  image: ImageCandidate,
) {
  const text =
    `${image.alt} ${image.title} ${image.src}`
      .toLowerCase();

  let score = 0;

  if (
    /spec|사양|제원|스펙|제품정보|제품사양|specification/.test(
      text,
    )
  ) {
    score += 100;
  }

  if (
    /btu|냉방|소비전력|무게|중량|소음|전압|냉매|제품크기/.test(
      text,
    )
  ) {
    score += 70;
  }

  const area =
    image.width *
    image.height;

  if (area >= 1000000) {
    score += 20;
  } else if (
    area >= 500000
  ) {
    score += 10;
  }

  return score;
}

function selectScoutImages(
  images: ImageCandidate[],
) {
  if (images.length <= 40) {
    return images;
  }

  const selected =
    new Map<string, ImageCandidate>();

  const add = (
    image:
      | ImageCandidate
      | undefined,
  ) => {
    if (
      image &&
      selected.size < 40
    ) {
      selected.set(
        image.src,
        image,
      );
    }
  };

  const priority =
    [...images].sort(
      (a, b) =>
        imagePriority(b) -
        imagePriority(a),
    );

  for (
    const image of
    priority.slice(0, 16)
  ) {
    add(image);
  }

  const ordered =
    [...images].sort(
      (a, b) =>
        a.index - b.index,
    );

  const sampleCount = 28;

  for (
    let i = 0;
    i < sampleCount;
    i += 1
  ) {
    const ratio =
      i /
      Math.max(
        1,
        sampleCount - 1,
      );

    const position =
      Math.round(
        ratio *
          (ordered.length - 1),
      );

    add(
      ordered[position],
    );
  }

  for (const image of priority) {
    if (
      selected.size >= 40
    ) {
      break;
    }

    add(image);
  }

  return [
    ...selected.values(),
  ].sort(
    (a, b) =>
      a.index - b.index,
  );
}

function normalizeCandidateIndexes(
  raw: unknown,
  validImages: ImageCandidate[],
) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const valid =
    new Set(
      validImages.map(
        (image) =>
          image.index,
      ),
    );

  return [
    ...new Set(
      raw
        .map(Number)
        .filter(
          (value) =>
            Number.isInteger(
              value,
            ) &&
            valid.has(value),
        ),
    ),
  ].slice(0, 10);
}

function normalizeAnalysis(
  raw: Record<string, unknown>,
) {
  const rawSpecs =
    Array.isArray(
      raw.keySpecs,
    )
      ? raw.keySpecs
      : [];

  const keySpecs =
    rawSpecs
      .map((item) => {
        const row =
          asObject(item);

        if (!row) {
          return null;
        }

        const name =
          safeString(
            row.name,
            120,
          );

        const value =
          safeString(
            row.value,
            300,
          );

        if (
          !name ||
          !value ||
          value.toLowerCase() ===
            "null"
        ) {
          return null;
        }

        return {
          name,
          value,
          evidence:
            safeString(
              row.evidence,
              700,
            ),
          source:
            safeString(
              row.source,
              30,
            ) === "review"
              ? "review"
              : "detail",
        };
      })
      .filter(
        (
          value,
        ): value is {
          name: string;
          value: string;
          evidence: string;
          source:
            | "detail"
            | "review";
        } =>
          value !== null,
      );

  const uniqueSpecs =
    keySpecs.filter(
      (
        spec,
        index,
        array,
      ) => {
        const key =
          `${spec.name
            .toLowerCase()
            .replace(/\s+/g, "")}:${spec.value
            .toLowerCase()
            .replace(/\s+/g, "")}`;

        return (
          array.findIndex(
            (other) =>
              `${other.name
                .toLowerCase()
                .replace(/\s+/g, "")}:${other.value
                .toLowerCase()
                .replace(/\s+/g, "")}` ===
              key,
          ) === index
        );
      },
    )
    .slice(0, 30);

  const array = (
    value: unknown,
    max: number,
  ) =>
    safeStringArray(
      value,
      max,
      1000,
    );

  const reviewSignals =
    asObject(
      raw.reviewPurchaseSignals,
    );

  const quality =
    asObject(
      raw.dataQuality,
    );

  return {
    price:
      typeof raw.price ===
      "string"
        ? raw.price.trim()
        : null,

    keySpecs:
      uniqueSpecs,

    sellerClaims:
      array(
        raw.sellerClaims,
        15,
      ),

    differentiators:
      array(
        raw.differentiators,
        15,
      ),

    installationAndUse:
      array(
        raw.installationAndUse,
        15,
      ),

    warrantyAndService:
      array(
        raw.warrantyAndService,
        15,
      ),

    maintenanceAndConsumables:
      array(
        raw.maintenanceAndConsumables,
        15,
      ),

    cautions:
      array(
        raw.cautions,
        15,
      ),

    reviewPurchaseSignals: {
      satisfactionDrivers:
        array(
          reviewSignals
            ?.satisfactionDrivers,
          10,
        ),

      complaintDrivers:
        array(
          reviewSignals
            ?.complaintDrivers,
          10,
        ),

      serviceAndDurability:
        array(
          reviewSignals
            ?.serviceAndDurability,
          10,
        ),

      valueForMoney:
        array(
          reviewSignals
            ?.valueForMoney,
          10,
        ),
    },

    dataQuality: {
      browserCaptured: true,

      detailEvidenceLevel:
        ["high", "medium", "low"].includes(
          safeString(
            quality
              ?.detailEvidenceLevel,
            20,
          ),
        )
          ? safeString(
              quality
                ?.detailEvidenceLevel,
              20,
            )
          : "medium",

      notes:
        array(
          quality?.notes,
          12,
        ),
    },
  };
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as RequestBody;

    const productId =
      safeString(
        body.productId,
        200,
      );

    if (!productId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "productId가 필요합니다.",
        },
        { status: 400 },
      );
    }

    const snapshot =
      normalizeSnapshot(
        body.browserSnapshot,
      );

    if (!snapshot) {
      return NextResponse.json(
        {
          success: false,
          message:
            "브라우저 상세정보 데이터가 없습니다.",
        },
        { status: 400 },
      );
    }

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const apiKey =
      process.env.OPENAI_API_KEY;

    if (
      !supabaseUrl ||
      !supabaseKey ||
      !apiKey
    ) {
      throw new Error(
        "필수 환경변수가 설정되지 않았습니다.",
      );
    }

    const supabase =
      createClient(
        supabaseUrl,
        supabaseKey,
      );

    const {
      data: product,
      error: productError,
    } = await supabase
      .from("products")
      .select(
        "id, category, product_name, source_url, review_analysis",
      )
      .eq("id", productId)
      .single();

    if (
      productError ||
      !product
    ) {
      throw new Error(
        productError?.message ??
          "제품을 찾지 못했습니다.",
      );
    }

    const openai =
      new OpenAI({
        apiKey,
      });

    /*
      1단계:
      상세페이지 이미지들을 low detail로 넓게 훑어서
      제품 사양표/제원표/스펙 이미지 후보를 찾는다.
    */
    const scoutImages =
      selectScoutImages(
        snapshot.imageCandidates,
      );

    let candidateIndexes:
      number[] = [];

    if (
      scoutImages.length > 0
    ) {
      const scoutContent:
        any[] = [
          {
            type:
              "input_text",
            text: `
당신은 쇼핑몰 상세페이지 이미지 중 제품 사양표를 찾는 검사기입니다.

제품명: ${product.product_name}
카테고리: ${product.category}

이어지는 각 이미지 앞에는 IMAGE_INDEX가 붙습니다.

다음 정보가 들어있는 이미지를 우선 찾아주세요:
- 제품 사양 / Product Specification / 제원
- 냉방능력 / BTU / W
- 소비전력 / 정격전력
- 제품 무게 / 중량
- 제품 크기 / 사이즈
- 소음 dB
- 전압 / 전류 / 주파수
- 냉매
- 용량
- 인증 및 공식 제원표

광고 배너, 사용 장면, 후기 이미지, 단순 제품 사진은 제외하세요.

사양표로 보이는 이미지 index만 골라주세요.
확실한 후보뿐 아니라 사양표일 가능성이 있는 이미지도 포함해도 됩니다.
최대 10개까지만 반환하세요.

JSON만 출력:
{
  "candidateIndexes": [1, 5, 12]
}
`,
          },
        ];

      for (
        const image of
        scoutImages
      ) {
        scoutContent.push({
          type:
            "input_text",
          text:
            `IMAGE_INDEX=${image.index}\nALT=${image.alt}\nTITLE=${image.title}`,
        });

        scoutContent.push({
          type:
            "input_image",
          image_url:
            image.src,
          detail: "low",
        });
      }

      const scoutResponse =
        await openai.responses.create({
          model:
            "gpt-5-mini",
          reasoning: {
            effort:
              "minimal",
          },
          max_output_tokens:
            300,
          input: [
            {
              role: "user",
              content:
                scoutContent,
            },
          ],
        });

      const scoutOutput =
        scoutResponse.output_text?.trim();

      if (scoutOutput) {
        try {
          const parsed =
            parseJson(
              scoutOutput,
            );

          candidateIndexes =
            normalizeCandidateIndexes(
              parsed.candidateIndexes,
              scoutImages,
            );
        } catch (
          parseError
        ) {
          console.error(
            "사양 이미지 후보 JSON 파싱 실패:",
            parseError,
            scoutOutput,
          );
        }
      }
    }

    /*
      AI가 후보를 못 찾았을 때도
      기존 방식보다 놓칠 확률을 낮추기 위해
      우선순위가 높은 이미지 일부를 fallback으로 사용한다.
    */
    let detailImages =
      candidateIndexes
        .map((index) =>
          snapshot.imageCandidates.find(
            (image) =>
              image.index ===
              index,
          ),
        )
        .filter(
          (
            image,
          ): image is ImageCandidate =>
            Boolean(image),
        );

    if (
      detailImages.length === 0
    ) {
      detailImages =
        [...snapshot.imageCandidates]
          .sort(
            (a, b) =>
              imagePriority(b) -
              imagePriority(a),
          )
          .slice(0, 8);
    }

    detailImages =
      detailImages.slice(
        0,
        10,
      );

    /*
      2단계:
      실제 사양표 후보 이미지만 high detail로 읽고,
      HTML 텍스트/리뷰 분석과 합쳐 최종 상세정보를 만든다.
    */
    const detailContent:
      any[] = [
        {
          type:
            "input_text",
          text: `
당신은 Project D의 제품 상세정보 분석가입니다.

제품명: ${product.product_name}
카테고리: ${product.category}

아래에는
1) 브라우저에서 수집한 상세페이지 텍스트
2) 기존 리뷰 분석
3) 1차 이미지 탐색에서 제품 사양표 가능성이 높다고 판단한 이미지
가 제공됩니다.

가장 중요한 목표:
공식 상세페이지에 존재하는 객관적인 제품 스펙을 빠짐없이 keySpecs에 저장하세요.

특히 다음 항목이 이미지에서 보이면 적극적으로 추출하세요:
- 냉방능력 / 냉방용량 / BTU/h / W
- 소비전력 / 정격전력 / 최대 소비전력
- 제품 무게 / 중량
- 제품 크기 / 사이즈
- 소음 dB
- 전압 / 전류 / 주파수
- 냉매 / 냉매량
- 권장 사용면적
- 배터리 용량/사용시간
- 풍량
- 주요 공식 성능 수치

중요 원칙:
- 이미지에서 실제로 읽은 숫자만 사용하세요.
- 절대 추측하지 마세요.
- 상세페이지 공식 사양은 source="detail".
- 리뷰에서만 나온 체감 정보는 source="review".
- 공식 숫자가 있는데 리뷰의 대략적인 숫자로 대체하지 마세요.
- 제품명/제조사/색상처럼 제품 비교에 도움이 적은 항목은 keySpecs를 불필요하게 채우지 마세요.
- 동일한 의미의 항목은 중복 저장하지 마세요.
- 값이 확인되지 않으면 null 값을 가진 keySpec을 만들지 마세요.
- 냉방능력에 W와 BTU가 함께 적혀 있으면 둘 다 하나의 value에 보존하세요.
- 소비전력에 평균/정격/최대가 함께 있으면 하나의 value에 함께 보존하세요.
- evidence에는 "상세페이지 제품 사양 이미지"처럼 근거 위치를 명확히 적으세요.
- JSON 이외의 텍스트를 출력하지 마세요.

브라우저 상세정보:
${JSON.stringify({
  title:
    snapshot.title,
  meta:
    snapshot.meta,
  jsonLd:
    snapshot.jsonLd,
  headings:
    snapshot.headings,
  tables:
    snapshot.tables,
  definitionLists:
    snapshot.definitionLists,
  visibleText:
    snapshot.visibleText,
})}

기존 리뷰 분석:
${JSON.stringify(
  product.review_analysis ??
    null,
)}

반드시 아래 JSON 구조:
{
  "price": string | null,
  "keySpecs": [
    {
      "name": string,
      "value": string,
      "evidence": string,
      "source": "detail" | "review"
    }
  ],
  "sellerClaims": string[],
  "differentiators": string[],
  "installationAndUse": string[],
  "warrantyAndService": string[],
  "maintenanceAndConsumables": string[],
  "cautions": string[],
  "reviewPurchaseSignals": {
    "satisfactionDrivers": string[],
    "complaintDrivers": string[],
    "serviceAndDurability": string[],
    "valueForMoney": string[]
  },
  "dataQuality": {
    "browserCaptured": true,
    "detailEvidenceLevel": "high" | "medium" | "low",
    "notes": string[]
  }
}
`,
        },
      ];

    for (
      const image of
      detailImages
    ) {
      detailContent.push({
        type:
          "input_text",
        text:
          `SPEC_IMAGE_INDEX=${image.index}`,
      });

      detailContent.push({
        type:
          "input_image",
        image_url:
          image.src,
        detail: "high",
      });
    }

    const detailResponse =
      await openai.responses.create({
        model:
          "gpt-5-mini",

        reasoning: {
          effort:
            "minimal",
        },

        max_output_tokens:
          5000,

        text: {
          format: {
            type:
              "json_schema",

            name:
              "product_detail_analysis",

            strict: true,

            schema: {
              type:
                "object",

              additionalProperties:
                false,

              properties: {
                price: {
                  type: [
                    "string",
                    "null",
                  ],
                },

                keySpecs: {
                  type:
                    "array",

                  items: {
                    type:
                      "object",

                    additionalProperties:
                      false,

                    properties: {
                      name: {
                        type:
                          "string",
                      },

                      value: {
                        type:
                          "string",
                      },

                      evidence: {
                        type:
                          "string",
                      },

                      source: {
                        type:
                          "string",

                        enum: [
                          "detail",
                          "review",
                        ],
                      },
                    },

                    required: [
                      "name",
                      "value",
                      "evidence",
                      "source",
                    ],
                  },
                },

                sellerClaims: {
                  type:
                    "array",

                  items: {
                    type:
                      "string",
                  },
                },

                differentiators: {
                  type:
                    "array",

                  items: {
                    type:
                      "string",
                  },
                },

                installationAndUse: {
                  type:
                    "array",

                  items: {
                    type:
                      "string",
                  },
                },

                warrantyAndService: {
                  type:
                    "array",

                  items: {
                    type:
                      "string",
                  },
                },

                maintenanceAndConsumables: {
                  type:
                    "array",

                  items: {
                    type:
                      "string",
                  },
                },

                cautions: {
                  type:
                    "array",

                  items: {
                    type:
                      "string",
                  },
                },

                reviewPurchaseSignals: {
                  type:
                    "object",

                  additionalProperties:
                    false,

                  properties: {
                    satisfactionDrivers: {
                      type:
                        "array",

                      items: {
                        type:
                          "string",
                      },
                    },

                    complaintDrivers: {
                      type:
                        "array",

                      items: {
                        type:
                          "string",
                      },
                    },

                    serviceAndDurability: {
                      type:
                        "array",

                      items: {
                        type:
                          "string",
                      },
                    },

                    valueForMoney: {
                      type:
                        "array",

                      items: {
                        type:
                          "string",
                      },
                    },
                  },

                  required: [
                    "satisfactionDrivers",
                    "complaintDrivers",
                    "serviceAndDurability",
                    "valueForMoney",
                  ],
                },

                dataQuality: {
                  type:
                    "object",

                  additionalProperties:
                    false,

                  properties: {
                    browserCaptured: {
                      type:
                        "boolean",
                    },

                    detailEvidenceLevel: {
                      type:
                        "string",

                      enum: [
                        "high",
                        "medium",
                        "low",
                      ],
                    },

                    notes: {
                      type:
                        "array",

                      items: {
                        type:
                          "string",
                      },
                    },
                  },

                  required: [
                    "browserCaptured",
                    "detailEvidenceLevel",
                    "notes",
                  ],
                },
              },

              required: [
                "price",
                "keySpecs",
                "sellerClaims",
                "differentiators",
                "installationAndUse",
                "warrantyAndService",
                "maintenanceAndConsumables",
                "cautions",
                "reviewPurchaseSignals",
                "dataQuality",
              ],
            },
          },
        },

        input: [
          {
            role: "user",
            content:
              detailContent,
          },
        ],
      });

    const output =
      detailResponse.output_text?.trim();

    if (!output) {
      throw new Error(
        "AI 상세정보 분석 결과가 없습니다.",
      );
    }

    const parsed =
      parseJson(output);

    const analysis =
      normalizeAnalysis(
        parsed,
      );

    /*
      핵심 비교 스펙이 사양 이미지에 있는데도
      1차 최종 분석에서 일부 누락되는 경우를 보완한다.

      모든 제품에 추가 호출하지 않고,
      냉방능력 / 소비전력 / 무게 중 하나라도 빠졌을 때만
      사양 후보 이미지를 대상으로 짧은 보충 추출을 실행한다.
    */
    const normalizedCoreSpecNames =
      analysis.keySpecs.map((spec) =>
        spec.name
          .toLowerCase()
          .replace(/\s+/g, ""),
      );

    const hasCoolingSpec =
      normalizedCoreSpecNames.some((name) =>
        /냉방능력|냉방용량|냉방성능|냉방량|정격냉방능력/.test(
          name,
        ),
      );

    const hasPowerSpec =
      normalizedCoreSpecNames.some((name) =>
        /소비전력|정격전력|정격출력|전력소비|평균소비전력/.test(
          name,
        ),
      );

    const hasWeightSpec =
      normalizedCoreSpecNames.some((name) =>
        /제품무게|본체무게|중량|무게/.test(
          name,
        ),
      );

    const missingCoreSpecs = [
      !hasCoolingSpec
        ? "냉방능력/냉방량"
        : "",
      !hasPowerSpec
        ? "소비전력"
        : "",
      !hasWeightSpec
        ? "제품 무게/중량"
        : "",
    ].filter(Boolean);

    if (
      missingCoreSpecs.length > 0 &&
      scoutImages.length > 0
    ) {
      const recoveryContent: any[] = [
        {
          type: "input_text",
          text: `
제품명: ${product.product_name}

앞의 제품 상세정보 분석에서 아래 핵심 공식 스펙이 누락되었습니다.

누락 항목:
${missingCoreSpecs.join(", ")}

이어지는 제품 사양 이미지들을 다시 자세히 확인해서
누락 항목이 실제 이미지에 적혀 있다면 정확히 추출하세요.

특히 다음 표현을 같은 의미로 인식하세요.

- 제품 무게 = 무게 = 중량 = 본체 무게
- 냉방능력 = 냉방량 = 냉방용량 = 정격 냉방능력
- 소비전력 = 정격 소비전력 = 정격 출력 = 평균 소비전력

중요:
- 이미지에 실제로 적힌 값만 사용하세요.
- 추측하지 마세요.
- kg, g, W, BTU/h 등의 단위를 그대로 보존하세요.
- 찾을 수 없는 항목은 결과 배열에 넣지 마세요.
- source는 반드시 "detail"로 작성하세요.

JSON 스키마에 맞춰 결과만 반환하세요.
`,
        },
      ];

      /*
        기존 정밀분석 후보에 사양표가 빠졌을 수 있으므로
        보충 단계에서는 1차 탐색 이미지 전체를 다시 확인한다.
        단, 비용을 제한하기 위해 최대 40장까지 low detail로 탐색한다.
      */
      for (
        const image of
        scoutImages.slice(0, 40)
      ) {
        recoveryContent.push({
          type: "input_text",
          text:
            `IMAGE_INDEX=${image.index}`,
        });

        recoveryContent.push({
          type: "input_image",
          image_url: image.src,
          detail: "low",
        });
      }

      const recoveryResponse =
        await openai.responses.create({
          model: "gpt-5-mini",

          reasoning: {
            effort: "minimal",
          },

          max_output_tokens: 700,

          text: {
            format: {
              type: "json_schema",

              name: "missing_core_product_specs",

              strict: true,

              schema: {
                type: "object",

                additionalProperties: false,

                properties: {
                  keySpecs: {
                    type: "array",

                    items: {
                      type: "object",

                      additionalProperties: false,

                      properties: {
                        name: {
                          type: "string",
                        },

                        value: {
                          type: "string",
                        },

                        evidence: {
                          type: "string",
                        },

                        source: {
                          type: "string",
                          enum: ["detail"],
                        },
                      },

                      required: [
                        "name",
                        "value",
                        "evidence",
                        "source",
                      ],
                    },
                  },
                },

                required: [
                  "keySpecs",
                ],
              },
            },
          },

          input: [
            {
              role: "user",
              content: recoveryContent,
            },
          ],
        });

      const recoveryOutput =
        recoveryResponse.output_text?.trim();

      if (recoveryOutput) {
        try {
          const recoveryParsed =
            parseJson(recoveryOutput);

          const rawRecovered =
            Array.isArray(
              recoveryParsed.keySpecs,
            )
              ? recoveryParsed.keySpecs
              : [];

          for (const item of rawRecovered) {
            const row =
              asObject(item);

            if (!row) {
              continue;
            }

            const name =
              safeString(
                row.name,
                120,
              );

            const value =
              safeString(
                row.value,
                300,
              );

            if (
              !name ||
              !value
            ) {
              continue;
            }

            const normalizedName =
              name
                .toLowerCase()
                .replace(/\s+/g, "");

            const alreadyExists =
              analysis.keySpecs.some(
                (spec) => {
                  const existing =
                    spec.name
                      .toLowerCase()
                      .replace(/\s+/g, "");

                  if (
                    /제품무게|본체무게|중량|무게/.test(
                      normalizedName,
                    )
                  ) {
                    return /제품무게|본체무게|중량|무게/.test(
                      existing,
                    );
                  }

                  if (
                    /냉방능력|냉방량|냉방용량|냉방성능|정격냉방능력/.test(
                      normalizedName,
                    )
                  ) {
                    return /냉방능력|냉방량|냉방용량|냉방성능|정격냉방능력/.test(
                      existing,
                    );
                  }

                  if (
                    /소비전력|정격전력|정격출력|전력소비|평균소비전력/.test(
                      normalizedName,
                    )
                  ) {
                    return /소비전력|정격전력|정격출력|전력소비|평균소비전력/.test(
                      existing,
                    );
                  }

                  return (
                    existing ===
                    normalizedName
                  );
                },
              );

            if (!alreadyExists) {
              analysis.keySpecs.push({
                name,
                value,
                evidence:
                  safeString(
                    row.evidence,
                    700,
                  ) ||
                  "상세페이지 제품 사양 이미지 보충 확인",
                source: "detail",
              });
            }
          }
        } catch (recoveryError) {
          console.error(
            "핵심 스펙 보충 분석 실패:",
            recoveryError,
            recoveryOutput,
          );
        }
      }
    }

    analysis.dataQuality.notes =
      [
        ...analysis
          .dataQuality
          .notes,
        `1차 이미지 탐색 ${scoutImages.length}장`,
        `2차 정밀 사양 이미지 분석 ${detailImages.length}장`,
      ].slice(0, 12);

    const storedAnalysis = {
      ...analysis,

      representativeImageUrl:
        snapshot.meta.ogImage ||
        null,
    };

    const {
      error: updateError,
    } = await supabase
      .from("products")
      .update({
        product_detail_analysis:
          storedAnalysis,
        product_detail_updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        productId,
      );

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      analysis:
        storedAnalysis,
      scoutImageCount:
        scoutImages.length,
      detailImageCount:
        detailImages.length,
      message:
        `${product.product_name} 상세정보 분석 완료 · 이미지 1차 탐색 ${scoutImages.length}장 / 사양 후보 정밀분석 ${detailImages.length}장`,
    });
  } catch (error) {
    console.error(
      "Product detail analysis API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "제품 상세정보 분석 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}




