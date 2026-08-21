const fs = require("fs");

const INPUT =
  "./trash/review-analysis-5-products.json";

function readJson(path) {
  return JSON.parse(
    fs
      .readFileSync(path, "utf8")
      .replace(/^\uFEFF/, "")
  );
}

async function main() {
  const source =
    readJson(INPUT);

  const products =
    Array.isArray(source.products)
      ? source.products
      : [];

  if (products.length !== 5) {
    throw new Error(
      `리뷰 분석 결과가 5개가 아닙니다. 현재 ${products.length}개`
    );
  }

  const response =
    await fetch(
      "http://localhost:3000/api/save-review-analysis-batch",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          category:
            source.category,
          products,
        }),
      }
    );

  const data =
    await response.json();

  console.log(
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
