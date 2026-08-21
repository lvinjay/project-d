const fs = require("fs");

const SOURCE =
  "./trash/market-candidates-final.json";

const OUTPUT =
  "./trash/review-analysis-5-products.json";

function readJson(path) {
  const text = fs
    .readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .trim();

  return JSON.parse(text);
}

function cleanText(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function analyzeProduct(
  category,
  candidate,
  index,
) {
  const detail =
    candidate.detail || {};

  const reviewObjects =
    Array.isArray(detail.reviews)
      ? detail.reviews
      : [];

  const reviews =
    reviewObjects
      .map((review) =>
        cleanText(review.text)
      )
      .filter(Boolean);

  const lowScore =
    reviewObjects.filter(
      (review) =>
        Number(review.rating || 0) > 0 &&
        Number(review.rating || 0) <= 3
    ).length;

  console.log("");
  console.log(
    `===== ${index + 1}번째 제품 =====`
  );
  console.log(
    detail.productName
  );
  console.log(
    `리뷰 샘플: ${reviews.length}개`
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      600000
    );

  try {
    const response =
      await fetch(
        "http://localhost:3000/api/analyze-reviews",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            productName:
              detail.productName,

            category,

            reviews,

            collectionStats: {
              total:
                reviews.length,

              ranking: 0,

              latest:
                reviews.length,

              lowScore,
            },
          }),

          signal:
            controller.signal,
        }
      );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.message ||
          `리뷰 분석 실패 (${response.status})`
      );
    }

    console.log(
      "분석 성공"
    );

    console.log(
      "요약:",
      data.analysis?.summary || "-"
    );

    console.log(
      "신뢰도:",
      data.analysis
        ?.confidenceScore ?? "-"
    );

    return {
      productId:
        detail.productId,

      productName:
        detail.productName,

      brand:
        detail.brand,

      finalPrice:
        detail.finalPrice,

      reviewSampleCount:
        reviews.length,

      analysis:
        data.analysis,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const source =
    readJson(SOURCE);

  const candidates =
    Array.isArray(
      source.finalCandidates
    )
      ? source.finalCandidates
      : [];

  const category =
    String(
      source.category || ""
    ).trim();

  let saved = {
    success: false,
    category,
    expectedCount: 5,
    analyzedCount: 0,
    products: [],
  };

  if (
    fs.existsSync(OUTPUT)
  ) {
    try {
      saved =
        readJson(OUTPUT);
    } catch {}
  }

  const existingProducts =
    Array.isArray(
      saved.products
    )
      ? saved.products
      : [];

  const results =
    [...existingProducts];

  console.log(
    "기존 분석 완료:",
    results.length
  );

  for (
    let i = results.length;
    i < candidates.length;
    i++
  ) {
    try {
      const result =
        await analyzeProduct(
          category,
          candidates[i],
          i
        );

      results.push(result);

      fs.writeFileSync(
        OUTPUT,
        JSON.stringify(
          {
            success:
              results.length === 5,

            category,

            expectedCount: 5,

            analyzedCount:
              results.length,

            products:
              results,
          },
          null,
          2
        ),
        "utf8"
      );
    } catch (error) {
      console.error("");
      console.error(
        `${i + 1}번째 제품 분석 실패:`,
        error instanceof Error
          ? error.message
          : error
      );

      break;
    }
  }

  console.log("");
  console.log(
    "=============================="
  );
  console.log(
    `분석 완료: ${results.length}/5`
  );
  console.log(
    `저장: ${OUTPUT}`
  );
  console.log(
    "=============================="
  );
}

main().catch((error) => {
  console.error(
    "실행 실패:",
    error
  );

  process.exit(1);
});
