import fs from "fs";
import { searchProductOffers } from "../lib/marketSearch";

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

  const result = await searchProductOffers(
    "에브리봇 TS450 쓰리스핀 슬림 물걸레 로봇청소기 26년 NEW"
  );

  console.log("");
  console.log("===== TS450 OFFER TEST =====");
  console.log("offers:", result.offers.length);

  console.log("");
  console.log("===== REVIEW SOURCE =====");

  if (!result.reviewSource) {
    console.log("reviewSource: NULL");
  } else {
    console.log("name:", result.reviewSource.name);
    console.log("seller:", result.reviewSource.brand);
    console.log("reviewCount:", result.reviewSource.reviewCount);
    console.log("sourceType:", result.reviewSource.sourceType);
    console.log("resolvedUrl:", result.reviewSource.resolvedUrl);
  }

  console.log("");
  console.log("===== PURCHASE SOURCE =====");

  if (!result.purchaseSource) {
    console.log("purchaseSource: NULL");
  } else {
    console.log("seller:", result.purchaseSource.brand);
    console.log("price:", result.purchaseSource.price);
    console.log("sourceType:", result.purchaseSource.sourceType);
  }

  fs.writeFileSync(
    "./trash/ts450-offer-test-result.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );

  console.log("");
  console.log("저장 파일: ./trash/ts450-offer-test-result.json");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exit(1);
});