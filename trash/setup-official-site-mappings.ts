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
      line
        .slice(0, index)
        .trim();

    let value =
      line
        .slice(index + 1)
        .trim();

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
      process.env[key] =
        value;
    }
  }
}

async function main() {
  await loadEnv();

  const {
    supabaseAdmin,
  } =
    await import(
      "../lib/supabaseAdmin"
    );

  const {
    saveOfficialSiteMapping,
    findOfficialSiteMapping,
  } =
    await import(
      "../lib/officialSiteMappingsDb"
    );

  console.log("");
  console.log(
    "===== official_site_mappings 테이블 확인 =====",
  );

  const probe =
    await supabaseAdmin
      .from(
        "official_site_mappings",
      )
      .select(
        "brand_key",
      )
      .limit(1);

  if (probe.error) {
    console.log("");
    console.log(
      "TABLE_NOT_READY",
    );

    console.log(
      probe.error.message,
    );

    console.log("");
    console.log(
      "Supabase SQL Editor에서 아래 파일 내용을 실행하세요:",
    );

    console.log(
      "trash\\official-site-mappings-schema.sql",
    );

    return;
  }

  console.log(
    "테이블 존재: YES",
  );

  console.log("");
  console.log(
    "===== 에브리봇 공식몰 매핑 저장 =====",
  );

  await saveOfficialSiteMapping(
    [
      "에브리봇",
      "EVERYBOT",
    ],
    "https://www.everybotmall.com",
    {
      brandName:
        "에브리봇",
      source:
        "verified",
      confidence:
        100,
    },
  );

  const mapping =
    await findOfficialSiteMapping(
      [
        "에브리봇",
        "EVERYBOT",
      ],
    );

  console.log("");
  console.log(
    "===== 저장 결과 =====",
  );

  console.log(
    "브랜드:",
    mapping?.brandName ??
      "",
  );

  console.log(
    "공식몰:",
    mapping?.officialSite ??
      "",
  );

  console.log(
    "SOURCE:",
    mapping?.source ??
      "",
  );

  console.log(
    "CONFIDENCE:",
    mapping?.confidence ??
      0,
  );

  console.log("");
  console.log(
    mapping?.officialSite ===
      "https://www.everybotmall.com"
      ? "[PASS] 에브리봇 공식몰 매핑 저장/조회"
      : "[FAIL] 에브리봇 공식몰 매핑",
  );

  console.log("");
  console.log(
    "SerpApi 호출: 0",
  );

  console.log(
    "Bright Data 호출: 0",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
