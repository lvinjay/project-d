import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(file) {
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

loadEnv(path.resolve(".env.local"));
loadEnv(path.resolve(".env"));

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Supabase 환경변수가 없습니다.");
}

const supabase =
  createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

const market =
  JSON.parse(
    fs.readFileSync(
      "./trash/final-flow-market-candidates.json",
      "utf8",
    ).replace(/^\uFEFF/, ""),
  );

const {
  data: brandMappings,
  error: brandError,
} =
  await supabase
    .from("brand_store_mappings")
    .select("*");

if (brandError) {
  throw brandError;
}

const {
  data: officialMappings,
  error: officialError,
} =
  await supabase
    .from("official_site_mappings")
    .select("*");

if (officialError) {
  throw officialError;
}

console.log("");
console.log("===== 매핑 현황 =====");
console.log(
  "brand_store_mappings:",
  brandMappings.length,
);
console.log(
  "official_site_mappings:",
  officialMappings.length,
);

console.log("");
console.log("===== 후보별 매칭 =====");

for (
  let index = 0;
  index < market.candidates.length;
  index++
) {
  const candidate =
    market.candidates[index];

  function repairUtf8(value) {
    const text =
      String(value ?? "");

    if (
      !/[ÃÂëìíê]/.test(text)
    ) {
      return text;
    }

    try {
      const repaired =
        Buffer.from(
          text,
          "latin1",
        ).toString(
          "utf8",
        );

      return repaired.includes("�")
        ? text
        : repaired;
    } catch {
      return text;
    }
  }

  const productName =
    repairUtf8(
      candidate.productName,
    );

  const seller =
    repairUtf8(
      candidate.seller,
    );

  const text =
    `${productName} ${seller}`
      .toLowerCase();

  const brandMatch =
    brandMappings.find((row) => {
      const keys = [
        row.brand_key,
        row.brand_name,
      ]
        .filter(Boolean)
        .map((x) =>
          String(x).toLowerCase(),
        );

      return keys.some((x) =>
        text.includes(x),
      );
    });

  const officialMatch =
    officialMappings.find((row) => {
      const keys = [
        row.brand_key,
        row.brand_name,
      ]
        .filter(Boolean)
        .map((x) =>
          String(x).toLowerCase(),
        );

      return keys.some((x) =>
        text.includes(x),
      );
    });

  console.log("");
  console.log("position:", index + 1);
  console.log(
    "product:",
    productName,
  );
  console.log(
    "brandStore:",
    brandMatch
      ? brandMatch.brand_site
      : "-"
  );
  console.log(
    "officialSite:",
    officialMatch
      ? officialMatch.official_site
      : "-"
  );
}

console.log("");
console.log("DB 변경: 0건");
console.log("SerpApi 호출: 0");
console.log("Bright Data 호출: 0");



