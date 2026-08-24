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

const targets = [
  "V70 Ultra",
  "X60 Master",
  "비스포크 AI 스팀",
  "N95TWU",
  "N95THU",
];

for (const target of targets) {
  console.log("");
  console.log("========================================");
  console.log("TARGET:", target);
  console.log("========================================");

  const {
    data,
    error,
  } =
    await supabase
      .from("products")
      .select(
        "id,product_name,origin_product_no,source_url,product_detail_analysis,updated_at",
      )
      .ilike(
        "product_name",
        `%${target}%`,
      )
      .limit(10);

  if (error) {
    console.log("ERROR:", error.message);
    continue;
  }

  console.log("count:", data.length);

  for (const row of data) {
    const detail =
      row.product_detail_analysis ?? {};

    console.log("");
    console.log("product_name:", row.product_name);
    console.log("origin_product_no:", row.origin_product_no);
    console.log("source_url:", row.source_url);
    console.log("detail productId:", detail.productId ?? "");
    console.log("detail modelName:", detail.modelName ?? "");
    console.log("detail finalPrice:", detail.price?.finalPrice ?? 0);
    console.log(
      "detail reviewSamples:",
      detail.collectedReviewSamples ?? 0,
    );
  }
}

console.log("");
console.log("===== 완료 =====");
console.log("SerpApi 호출: 0");
console.log("Bright Data 호출: 0");
console.log("DB 변경: 0");
