import {
  readFile,
} from "node:fs/promises";

async function loadEnv() {
  const text =
    await readFile(
      ".env.local",
      "utf8",
    );

  for (const rawLine of text.split(/\r?\n/)) {
    const line =
      rawLine.trim();

    if (
      !line ||
      line.startsWith("#")
    ) {
      continue;
    }

    const index =
      line.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const key =
      line.slice(0, index).trim();

    let value =
      line.slice(index + 1).trim();

    if (
      (value.startsWith('"') &&
        value.endsWith('"')) ||
      (value.startsWith("'") &&
        value.endsWith("'"))
    ) {
      value =
        value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  await loadEnv();

  const {
    collectNaverProduct,
  } =
    await import(
      "../lib/brightDataProduct"
    );

  const url =
    "https://www.everybotmall.com/product/ts450";

  console.log("");
  console.log(
    "===== TS450 제조사몰 Bright Data 단건 확인 =====",
  );

  console.log(
    "URL:",
    url,
  );

  const startedAt =
    Date.now();

  try {
    const result =
      await collectNaverProduct(
        url,
      );

    console.log("");
    console.log(
      "수집 성공:",
      Boolean(result),
    );

    if (result) {
      console.log(
        "상품번호:",
        result.productId ?? "",
      );

      console.log(
        "상품명:",
        result.title ?? "",
      );

      console.log(
        "브랜드:",
        result.brand ?? "",
      );

      console.log(
        "제조사:",
        result.manufacturer ?? "",
      );

      console.log(
        "모델명:",
        result.modelName ?? "",
      );

      console.log(
        "가격:",
        result.finalPrice ?? 0,
      );

      console.log(
        "이미지:",
        result.imageUrl ?? "",
      );

      console.log(
        "결과 URL:",
        result.url ?? "",
      );
    }
  } catch (error) {
    console.log("");
    console.log(
      "수집 오류:",
      error instanceof Error
        ? error.message
        : String(error),
    );
  }

  console.log("");
  console.log(
    "소요 시간:",
    Math.round(
      (Date.now() - startedAt) / 1000,
    ),
    "초",
  );

  console.log(
    "SerpApi 호출: 0",
  );

  console.log(
    "Bright Data 예상 호출: 1",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);

