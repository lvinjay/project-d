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

console.log("");
console.log("===== official_site_mappings 전체 조회 =====");

const { data, error } =
  await supabase
    .from("official_site_mappings")
    .select("*")
    .order("brand_key");

if (error) {
  throw error;
}

console.log("전체 매핑:", data.length);

console.log("");
console.log("===== 드리미 관련 매핑 =====");

const dreame =
  data.filter((row) => {
    const text =
      JSON.stringify(row).toLowerCase();

    return (
      text.includes("드리미") ||
      text.includes("dreame")
    );
  });

console.log(
  JSON.stringify(dreame, null, 2),
);

fs.writeFileSync(
  "./trash/official-site-mappings-dreame-audit.json",
  JSON.stringify(
    {
      total: data.length,
      dreame,
    },
    null,
    2,
  ),
  "utf8",
);

console.log("");
console.log(
  "저장 파일: ./trash/official-site-mappings-dreame-audit.json",
);
console.log("");
console.log("DB 변경: 0건 (읽기 전용)");
