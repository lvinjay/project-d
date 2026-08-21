const fs = require("fs");

const env = fs.readFileSync(".env.local", "utf8");

function getEnv(name) {
  const line = env
    .split(/\r?\n/)
    .find((row) =>
      row.trim().startsWith(name + "=")
    );

  if (!line) {
    throw new Error(
      name + "를 찾지 못했습니다."
    );
  }

  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

const apiKey =
  getEnv("SERPAPI_API_KEY");

const tests = [
  {
    productId: "10775617216",
    name: "에브리봇 Q9",
  },
  {
    productId: "11662274981",
    name: "로보락",
  },
  {
    productId: "13280227814",
    name: "로봇청소기",
  },
];

function collectSites(value, output = []) {
  if (typeof value === "string") {
    const matches =
      value.match(
        /(?:https?:\/\/)?brand\.naver\.com\/[a-zA-Z0-9_-]+/g
      ) || [];

    for (const match of matches) {
      const url =
        match.startsWith("http")
          ? match
          : "https://" + match;

      output.push(url);
    }

    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSites(item, output);
    }

    return output;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    for (const item of Object.values(value)) {
      collectSites(item, output);
    }
  }

  return output;
}

async function resolve(test) {
  const params =
    new URLSearchParams({
      engine: "naver",
      query:
        `${test.productId} ${test.name}`,
      where: "nexearch",
      output: "json",
      api_key: apiKey,
    });

  const response =
    await fetch(
      "https://serpapi.com/search?" +
        params.toString()
    );

  const data =
    await response.json();

  const sites =
    [...new Set(
      collectSites(data)
    )];

  const canonicalUrls =
    sites.map(
      (site) =>
        `${site}/products/${test.productId}`
    );

  return {
    ...test,
    sites,
    canonicalUrls,
  };
}

async function main() {
  const results = [];

  for (const test of tests) {
    console.log("");
    console.log(
      "검색:",
      test.productId,
      test.name
    );

    const result =
      await resolve(test);

    results.push(result);

    console.log(
      "BRAND SITES:",
      result.sites
    );

    console.log(
      "CANONICAL:",
      result.canonicalUrls
    );
  }

  fs.writeFileSync(
    "./trash/serpapi-brand-resolution-test.json",
    JSON.stringify(
      results,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(
    "완료: ./trash/serpapi-brand-resolution-test.json"
  );
}

main().catch(console.error);
