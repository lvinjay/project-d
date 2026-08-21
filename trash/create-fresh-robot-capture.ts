import {
  writeFile,
} from "node:fs/promises";

async function readJson(
  response: Response,
) {
  const text =
    await response.text();

  try {
    return JSON.parse(
      text,
    );
  } catch {
    throw new Error(
      `JSON 파싱 실패: ${text.slice(
        0,
        500,
      )}`,
    );
  }
}

async function main() {
  const baseUrl =
    "http://localhost:3000";

  const category =
    "로봇청소기";

  const minBudget =
    500000;

  const maxBudget =
    1500000;

  console.log(
    "===== 새 로봇청소기 Capture 생성 =====",
  );

  /*
    1. 실제 생산 UI와 같은 시장후보 API 호출
  */
  const marketResponse =
    await fetch(
      `${baseUrl}/api/market-candidates?category=${encodeURIComponent(
        category,
      )}`,
      {
        cache:
          "no-store",
      },
    );

  const marketResult =
    await readJson(
      marketResponse,
    );

  if (
    !marketResponse.ok ||
    marketResult.success !==
      true
  ) {
    throw new Error(
      marketResult.message ||
        "시장 후보 검색 실패",
    );
  }

  const candidates =
    Array.isArray(
      marketResult.candidates,
    )
      ? marketResult.candidates
      : [];

  if (
    candidates.length === 0
  ) {
    throw new Error(
      "시장 후보가 없습니다.",
    );
  }

  console.log(
    "시장 후보:",
    candidates.length,
  );

  const captureProducts =
    candidates.map(
      (candidate: any) => ({
        name:
          String(
            candidate.productName ??
            "",
          ).trim(),

        text: "",

        seller:
          String(
            candidate.seller ??
            "",
          ).trim(),

        url:
          String(
            candidate.sourceUrl ??
            "",
          ).trim(),

        imageUrl:
          String(
            candidate.imageUrl ??
            "",
          ).trim(),

        price:
          Number(
            candidate.price ??
            0,
          ),

        reviewCount:
          Number(
            candidate.reviewCount ??
            0,
          ),

        rating:
          Number(
            candidate.rating ??
            0,
          ),
      }),
    );

  /*
    2. naver-capture에 실제 생산 형식으로 저장
  */
  const captureResponse =
    await fetch(
      `${baseUrl}/api/naver-capture`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            category,
            minBudget,
            maxBudget,
            products:
              captureProducts,
          }),
      },
    );

  const captureResult =
    await readJson(
      captureResponse,
    );

  if (
    !captureResponse.ok ||
    captureResult.success !==
      true
  ) {
    throw new Error(
      captureResult.message ||
        "Capture 저장 실패",
    );
  }

  const captureId =
    String(
      captureResult.id ??
      "",
    ).trim();

  if (!captureId) {
    throw new Error(
      "captureId가 생성되지 않았습니다.",
    );
  }

  /*
    3. 즉시 다시 읽어서 서버 메모리에 존재하는지 확인
  */
  const checkResponse =
    await fetch(
      `${baseUrl}/api/naver-capture?id=${encodeURIComponent(
        captureId,
      )}`,
      {
        cache:
          "no-store",
      },
    );

  const check =
    await readJson(
      checkResponse,
    );

  if (
    !checkResponse.ok ||
    check.success !==
      true
  ) {
    throw new Error(
      check.message ||
        "Capture 재조회 실패",
    );
  }

  const products =
    Array.isArray(
      check.products,
    )
      ? check.products
      : [];

  const ts450 =
    products.find(
      (product: any) =>
        String(
          product.name ??
          "",
        )
          .toLowerCase()
          .includes(
            "ts450",
          ),
    );

  const summary = {
    success:
      true,

    category,

    captureId,

    marketCandidateCount:
      candidates.length,

    captureProductCount:
      products.length,

    ts450Included:
      Boolean(ts450),

    ts450:
      ts450 ?? null,
  };

  await writeFile(
    "./trash/fresh-robot-capture-result.json",
    JSON.stringify(
      summary,
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    "./trash/fresh-robot-capture-id.txt",
    captureId,
    "utf8",
  );

  console.log("");
  console.log(
    "===== 완료 =====",
  );

  console.log(
    "Capture ID:",
    captureId,
  );

  console.log(
    "저장 상품:",
    products.length,
  );

  console.log(
    "TS450 포함:",
    ts450
      ? "YES"
      : "NO",
  );

  console.log("");
  console.log(
    "저장 파일:",
  );

  console.log(
    "trash\\fresh-robot-capture-result.json",
  );

  console.log(
    "trash\\fresh-robot-capture-id.txt",
  );

  console.log("");
  console.log(
    "Enriched 실행: 아직 안 함",
  );
}

main().catch(
  async (
    error,
  ) => {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await writeFile(
      "./trash/fresh-robot-capture-error.txt",
      message,
      "utf8",
    );

    console.error(
      "ERROR:",
      message,
    );

    process.exitCode = 1;
  },
);
