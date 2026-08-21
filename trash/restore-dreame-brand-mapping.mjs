import fs from "fs";
import path from "path";

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

const base =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!base || !key) {
  throw new Error("Supabase 환경변수가 없습니다.");
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

const checkUrl =
  `${base}/rest/v1/brand_store_mappings` +
  `?brand_key=eq.${encodeURIComponent("드리미")}` +
  `&select=*`;

const beforeResponse =
  await fetch(checkUrl, {
    headers,
  });

const before =
  await beforeResponse.json();

console.log("");
console.log("===== 현재 드리미 매핑 =====");
console.log(JSON.stringify(before, null, 2));

if (!Array.isArray(before)) {
  throw new Error("현재 매핑 조회에 실패했습니다.");
}

if (before.length > 0) {
  throw new Error(
    `안전 중단: 드리미 매핑이 이미 ${before.length}건 있습니다.`,
  );
}

const insertResponse =
  await fetch(
    `${base}/rest/v1/brand_store_mappings`,
    {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        brand_key: "드리미",
        brand_name: "드리미",
        brand_slug: "dreame",
        brand_site: "https://brand.naver.com/dreame",
        source: "verified_product_url",
        confidence: 100,
        updated_at: new Date().toISOString(),
      }),
    },
  );

const insertedText =
  await insertResponse.text();

if (!insertResponse.ok) {
  throw new Error(
    `정상 매핑 등록 실패 (${insertResponse.status}): ${insertedText}`,
  );
}

console.log("");
console.log("===== 정상 드리미 매핑 등록 완료 =====");
console.log(insertedText);
