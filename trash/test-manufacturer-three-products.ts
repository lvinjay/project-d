import fs from "fs";
import path from "path";

function loadEnv(file: string) {
  if (!fs.existsSync(file)) return;

  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();

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

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnv(path.resolve(".env.local"));
  loadEnv(path.resolve(".env"));

  const {
    findOfficialSiteMapping,
    saveOfficialSiteMapping,
  } =
    await import("../lib/officialSiteMappingsDb");

  const {
    collectManufacturerProduct,
  } =
    await import("../lib/manufacturerProductCollector");

  console.log("");
  console.log("===== 1. 로보락 공식사이트 매핑 =====");

  await saveOfficialSiteMapping(
    [
      "로보락",
      "Roborock",
    ],
    "https://kr.roborock.com",
    {
      brandName: "로보락",
      source: "verified",
      confidence: 100,
    },
  );

  console.log(
    await findOfficialSiteMapping([
      "로보락",
      "Roborock",
    ]),
  );

  console.log("");
  console.log("===== 2. 모바 공식사이트 매핑 =====");

  await saveOfficialSiteMapping(
    [
      "모바",
      "MOVA",
    ],
    "https://kr.mova.tech",
    {
      brandName: "모바",
      source: "verified",
      confidence: 100,
    },
  );

  console.log(
    await findOfficialSiteMapping([
      "모바",
      "MOVA",
    ]),
  );

  console.log("");
  console.log("===== 3. Manufacturer 단독 테스트 =====");

  const tests = [
    {
      name: "P70 Pro Ultra",
      site: "https://kr.mova.tech",
      terms: [
        "P70",
        "Pro",
        "Ultra",
      ],
    },
    {
      name: "S10 MaxV Ultra",
      site: "https://kr.roborock.com",
      terms: [
        "S10",
        "MaxV",
        "Ultra",
      ],
    },
    {
      name: "X60 Master",
      site: "https://www.kr.dreametech.com",
      terms: [
        "X60",
        "Master",
      ],
    },
  ];

  const results = [];

  for (const test of tests) {
    console.log("");
    console.log(
      "-----",
      test.name,
      "-----",
    );

    const result =
      await collectManufacturerProduct({
        officialSite:
          test.site,
        searchTerms:
          test.terms,
      });

    results.push({
      name: test.name,
      result,
    });

    console.log(
      JSON.stringify(
        result,
        null,
        2,
      ),
    );
  }

  fs.writeFileSync(
    "./trash/manufacturer-three-product-test.json",
    JSON.stringify(
      results,
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log("===== 완료 =====");
  console.log(
    "저장 파일: ./trash/manufacturer-three-product-test.json",
  );
  console.log("SerpApi 호출: 0");
  console.log("Bright Data 호출: 0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
