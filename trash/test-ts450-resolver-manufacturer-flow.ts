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
    resolveNaverBrandProductUrl,
  } = await import(
    "../lib/resolveNaverBrandProductUrl"
  );

  const {
    findOfficialSiteMapping,
  } = await import(
    "../lib/officialSiteMappingsDb"
  );

  const {
    getStrongSearchModelTokens,
  } = await import(
    "../lib/buildResolverSearchPlan"
  );

  const {
    collectManufacturerProduct,
  } = await import(
    "../lib/manufacturerProductCollector"
  );

  const marketUrl =
    "https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=90381860933";

  const marketName =
    "에브리봇 TS450 쓰리스핀 슬림 물걸레 로봇청소기 26년 NEW";

  console.log("");
  console.log("===== 1. RESOLVER =====");

  try {
    const resolved =
      await resolveNaverBrandProductUrl(
        marketUrl,
        marketName
      );

    console.log("success:", resolved.success);
    console.log("canonicalUrl:", resolved.canonicalUrl);
    console.log("reason:", resolved.reason ?? "");
  } catch (error) {
    console.log(
      "resolver exception:",
      error instanceof Error ? error.message : String(error)
    );
  }

  console.log("");
  console.log("===== 2. MANUFACTURER FALLBACK =====");

  const marketTokens =
    marketName
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean);

  const brandCandidates = [
    ...marketTokens.slice(0, 8),
    marketTokens.slice(0, 2).join(" "),
    marketTokens.slice(0, 3).join(" "),
  ].filter(Boolean);

  const mapping =
    await findOfficialSiteMapping(
      brandCandidates
    );

  console.log(
    "officialSite:",
    mapping?.officialSite ?? ""
  );

  const searchTerms =
    getStrongSearchModelTokens(
      marketTokens
    );

  console.log(
    "searchTerms:",
    searchTerms.join(" ")
  );

  if (
    !mapping?.officialSite ||
    searchTerms.length === 0
  ) {
    console.log("Manufacturer fallback 준비 실패");
    return;
  }

  const collected =
    await collectManufacturerProduct({
      officialSite:
        mapping.officialSite,
      searchTerms,
  });

  console.log("success:", collected.success);

  if (collected.success) {
    console.log(
      "discoveredUrl:",
      collected.discoveredUrl
    );
    console.log(
      "title:",
      collected.detail.title
    );
    console.log(
      "finalPrice:",
      collected.detail.finalPrice
    );
    console.log(
      "brand:",
      collected.detail.brand
    );
  } else {
    console.log(
      "reason:",
      collected.reason
    );
  }
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exit(1);
});