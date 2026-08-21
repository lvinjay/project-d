import fs from "fs";

function loadEnv() {
  const text = fs.readFileSync(".env.local", "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const index = line.indexOf("=");
    if (index <= 0) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnv();

  const {
    collectNaverProduct,
  } = await import(
    "../lib/brightDataProduct"
  );

  const url =
    "https://smartstore.naver.com/everybot/products/12837349941";

  console.log("");
  console.log("===== TS450 CANONICAL SMARTSTORE TEST =====");
  console.log("URL:", url);
  console.log("");

  const result =
    await collectNaverProduct(url);

  console.log("productId:", result.productId);
  console.log("title:", result.title);
  console.log("totalReviews:", result.totalReviews);
  console.log("topReviews:", result.topReviews.length);
  console.log("finalPrice:", result.finalPrice);

  if (result.topReviews.length > 0) {
    console.log("");
    console.log("===== REVIEW SAMPLE =====");

    result.topReviews
      .slice(0, 3)
      .forEach((review, index) => {
        console.log(
          `${index + 1}.`,
          review.text
        );
      });
  }

  fs.writeFileSync(
    "./trash/ts450-canonical-smartstore-brightdata.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );

  console.log("");
  console.log(
    "저장 파일: ./trash/ts450-canonical-smartstore-brightdata.json"
  );
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exit(1);
});