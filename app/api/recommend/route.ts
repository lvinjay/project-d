import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

    const body = await request.json();
    const prompt =
      typeof body?.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json(
        {
          success: false,
          message: "질문 내용을 입력해 주세요.",
        },
        { status: 400 },
      );
    }

    const client = new OpenAI({
      apiKey,
    });

    const response = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    return NextResponse.json({
      success: true,
      result: response.output_text,
    });
  } catch (error) {
    console.error("OpenAI API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "AI 요청 처리 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}