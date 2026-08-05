import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReviewAnalysisRequest = {
  productName?: string;
  reviews?: string[];
};

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message: "OPENAI_API_KEY가 설정되지 않았습니다.",
        },
        { status: 500 },
      );
    }

    const body = (await request.json()) as ReviewAnalysisRequest;

    const productName =
      typeof body.productName === "string"
        ? body.productName.trim()
        : "";

    const reviews = Array.isArray(body.reviews)
      ? body.reviews
          .filter(
            (review): review is string =>
              typeof review === "string" &&
              review.trim().length > 0,
          )
          .map((review) => review.trim())
          .slice(0, 200)
      : [];

    if (!productName) {
      return NextResponse.json(
        {
          success: false,
          message: "제품명이 필요합니다.",
        },
        { status: 400 },
      );
    }

    if (reviews.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "분석할 리뷰가 없습니다.",
        },
        { status: 400 },
      );
    }

    const client = new OpenAI({
      apiKey,
    });

    const prompt = `
당신은 제품의 실제 사용자 리뷰를 객관적으로 분석하는 전문가입니다.

제품명:
${productName}

분석 대상 리뷰:
${reviews
  .map((review, index) => `${index + 1}. ${review}`)
  .join("\n")}

다음 원칙을 지켜 주세요.

- 제공된 리뷰에 없는 사실은 만들지 마세요.
- 광고성 표현이나 단순 배송 후기는 핵심 평가에서 제외하세요.
- 반복적으로 언급되는 의견을 우선하세요.
- 장점뿐 아니라 단점과 구매 전 위험 요소를 분명히 표시하세요.
- 리뷰 수가 적으면 신뢰도가 낮다는 점을 반영하세요.
- 반드시 아래 JSON 형식만 출력하세요.
- 마크다운 코드 블록은 사용하지 마세요.

{
  "productName": "제품명",
  "reviewCount": 0,
  "summary": "전체 리뷰를 종합한 2~3문장 요약",
  "positivePoints": [
    {
      "topic": "장점 항목",
      "summary": "반복적으로 언급된 내용",
      "evidenceCount": 0
    }
  ],
  "negativePoints": [
    {
      "topic": "단점 항목",
      "summary": "반복적으로 언급된 내용",
      "evidenceCount": 0
    }
  ],
  "cautions": [
    "구매 전에 확인해야 할 사항"
  ],
  "bestFor": [
    "이 제품이 잘 맞는 사용자"
  ],
  "notFor": [
    "이 제품이 잘 맞지 않는 사용자"
  ],
  "confidenceScore": 0
}

confidenceScore는 리뷰의 개수, 구체성, 의견의 일관성을 고려해 0부터 100 사이의 숫자로 작성하세요.
`;

    const response = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    const outputText = response.output_text?.trim();

    if (!outputText) {
      throw new Error("AI가 분석 결과를 반환하지 않았습니다.");
    }

    let analysis;

    try {
      analysis = extractJson(outputText);
    } catch {
      console.error(
        "Review analysis JSON parsing failed:",
        outputText,
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "AI 분석 결과를 구조화하는 데 실패했습니다.",
          rawResult: outputText,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Review analysis API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "리뷰 분석 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}