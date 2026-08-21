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

const apiKey =
  process.env.SERPAPI_API_KEY;

if (!apiKey) {
  throw new Error("SERPAPI_API_KEY가 없습니다.");
}

const query =
  'site:brand.naver.com/dreame/products "X60 Master"';

const params =
  new URLSearchParams({
    engine: "google",
    q: query,
    hl: "ko",
    gl: "kr",
    api_key: apiKey,
  });

const response =
  await fetch(
    "https://serpapi.com/search?" +
      params.toString(),
  );

const data =
  await response.json();

const serialized =
  JSON.stringify(data);

const urls =
  [
    ...new Set(
      serialized.match(
        /https?:\/\/brand\.naver\.com\/dreame\/products\/\d+/gi,
      ) ?? [],
    ),
  ];

const out = {
  query,
  urls,
  organicResults:
    (data.organic_results ?? [])
      .slice(0, 10)
      .map((x) => ({
        title: x.title,
        link: x.link,
        snippet: x.snippet,
      })),
};

fs.writeFileSync(
  "./trash/x60-exact-brand-search.json",
  JSON.stringify(out, null, 2),
  "utf8",
);

console.log("");
console.log("===== X60 EXACT BRAND SEARCH =====");
console.log("query:", query);
console.log("product URLs:", urls.length);

for (const url of urls) {
  console.log("-", url);
}

console.log("");
console.log(
  "저장 파일: ./trash/x60-exact-brand-search.json",
);
