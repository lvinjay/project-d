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
  } = await import("../lib/officialSiteMappingsDb");

  const {
    collectManufacturerProduct,
  } = await import("../lib/manufacturerProductCollector");

  console.log("");
  console.log("===== 1. 현재 드리미 공식사이트 매핑 확인 =====");

  let mapping =
    await findOfficialSiteMapping([
      "드리미",
      "Dreame",
    ]);

  console.log(mapping);

  if (!mapping) {
    console.log("");
    console.log("===== 2. 드리미 공식사이트 등록 =====");

    await saveOfficialSiteMapping(
      [
        "드리미",
        "Dreame",
      ],
      "https://www.kr.dreametech.com",
      {
        brandName: "드리미",
        source: "verified",
        confidence: 100,
      },
    );

    mapping =
      await findOfficialSiteMapping([
        "드리미",
        "Dreame",
      ]);
  }

  console.log("");
  console.log("===== 등록 후 매핑 =====");
  console.log(mapping);

  if (!mapping?.officialSite) {
    throw new Error(
      "드리미 공식사이트 매핑을 확보하지 못했습니다.",
    );
  }

  console.log("");
  console.log("===== 3. X60 Master Manufacturer 단독 테스트 =====");

  const result =
    await collectManufacturerProduct({
      officialSite:
        mapping.officialSite,
      searchTerms: [
        "X60",
        "Master",
      ],
    });

  console.log(
    JSON.stringify(
      result,
      null,
      2,
    ),
  );

  fs.writeFileSync(
    "./trash/x60-manufacturer-direct-test.json",
    JSON.stringify(
      result,
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log(
    "저장 파일: ./trash/x60-manufacturer-direct-test.json",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
