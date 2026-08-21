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
  Accept: "application/json",
};

const target =
  `${base}/rest/v1/brand_store_mappings` +
  `?brand_key=eq.${encodeURIComponent("드리미")}` +
  `&brand_site=eq.${encodeURIComponent("https://brand.naver.com/lezen")}`;

const before = await fetch(
  target + "&select=*",
  {
    headers,
  },
);

const beforeRows =
  await before.json();

console.log("");
console.log("===== 삭제 대상 확인 =====");
console.log(JSON.stringify(beforeRows, null, 2));

if (
  !Array.isArray(beforeRows) ||
  beforeRows.length !== 1
) {
  throw new Error(
    `안전 중단: 삭제 대상이 정확히 1건이 아닙니다. (${Array.isArray(beforeRows) ? beforeRows.length : 0}건)`,
  );
}

const del = await fetch(
  target,
  {
    method: "DELETE",
    headers: {
      ...headers,
      Prefer: "return=representation",
    },
  },
);

const deletedText =
  await del.text();

if (!del.ok) {
  throw new Error(
    `삭제 실패 (${del.status}): ${deletedText}`,
  );
}

console.log("");
console.log("===== 삭제 완료 =====");
console.log(deletedText);
console.log("");
console.log("삭제 조건:");
console.log("brand_key = 드리미");
console.log("brand_site = https://brand.naver.com/lezen");
