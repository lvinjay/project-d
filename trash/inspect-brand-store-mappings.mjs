import fs from "fs";
import path from "path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const eq = line.indexOf("=");

    if (eq <= 0) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

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

loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL이 없습니다.",
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY가 없습니다.",
  );
}

const endpoint =
  `${supabaseUrl.replace(/\/+$/, "")}` +
  "/rest/v1/brand_store_mappings" +
  "?select=brand_key,brand_name,brand_slug,brand_site,source,confidence,updated_at" +
  "&order=brand_key.asc";

const response = await fetch(endpoint, {
  method: "GET",
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
  },
});

const body = await response.text();

if (!response.ok) {
  throw new Error(
    `Supabase 조회 실패 (${response.status}): ${body}`,
  );
}

const rows = JSON.parse(body);

const suspicious = rows.filter((row) => {
  const key =
    String(row.brand_key ?? "")
      .toLowerCase();

  const name =
    String(row.brand_name ?? "")
      .toLowerCase();

  return (
    key.includes("드리미") ||
    key.includes("dreame") ||
    name.includes("드리미") ||
    name.includes("dreame")
  );
});

const output = {
  success: true,
  totalCount: rows.length,
  suspiciousCount: suspicious.length,
  suspicious,
  rows,
};

const outPath =
  path.resolve(
    "trash",
    "brand-store-mappings-audit.json",
  );

fs.mkdirSync(
  path.dirname(outPath),
  {
    recursive: true,
  },
);

fs.writeFileSync(
  outPath,
  JSON.stringify(
    output,
    null,
    2,
  ),
  "utf8",
);

console.log("");
console.log(
  "===== brand_store_mappings 읽기 전용 조회 =====",
);
console.log(
  "전체 매핑:",
  rows.length,
);
console.log(
  "드리미/Dreame 관련:",
  suspicious.length,
);
console.log("");

for (const row of suspicious) {
  console.log(
    JSON.stringify(
      row,
      null,
      2,
    ),
  );
}

console.log("");
console.log(
  "저장 파일:",
  "./trash/brand-store-mappings-audit.json",
);
console.log("");
console.log(
  "DB 변경: 0건 (GET 조회만 수행)",
);
