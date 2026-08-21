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
    const line = rawLine.trim();

    if (
      !line ||
      line.startsWith("#")
    ) {
      continue;
    }

    const index = line.indexOf("=");

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
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  await loadEnv();

  const {
    resolveNaverBrandProductUrl,
  } =
    await import(
      "../lib/resolveNaverBrandProductUrl"
    );

  const startedAt =
    Date.now();

  const result =
    await resolveNaverBrandProductUrl(
      "https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=90381860933",
      "에브리봇 TS450 쓰리스핀 슬림 물걸레 로봇청소기 26년 NEW",
    );

  console.log("");
  console.log(
    "===== TS450 강한 모델토큰 실제 확인 =====",
  );

  console.log(
    "성공:",
    result.success,
  );

  console.log(
    "상품번호:",
    result.productId,
  );

  console.log(
    "브랜드:",
    result.brandName,
  );

  console.log(
    "브랜드스토어:",
    result.brandSite,
  );

  console.log(
    "공식 URL:",
    result.canonicalUrl,
  );

  console.log(
    "검색 횟수:",
    result.triedQueries.length,
  );

  console.log("");
  console.log(
    "검색 경로:",
  );

  for (
    const query of
    result.triedQueries
  ) {
    console.log(
      "-",
      query,
    );
  }

  if (!result.success) {
    console.log("");
    console.log(
      "실패 이유:",
      result.reason,
    );
  }

  console.log(
    "소요 시간:",
    Math.round(
      (Date.now() - startedAt) / 1000,
    ),
    "초",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
