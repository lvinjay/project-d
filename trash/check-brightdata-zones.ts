import {
  readFile,
} from "node:fs/promises";

async function loadEnv() {
  const text =
    await readFile(
      ".env.local",
      "utf8",
    );

  for (const rawLine of text.split(/\r?\n/)) {
    const line =
      rawLine.trim();

    if (
      !line ||
      line.startsWith("#")
    ) {
      continue;
    }

    const index =
      line.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const key =
      line
        .slice(0, index)
        .trim();

    let value =
      line
        .slice(index + 1)
        .trim();

    if (
      (value.startsWith('"') &&
        value.endsWith('"')) ||
      (value.startsWith("'") &&
        value.endsWith("'"))
    ) {
      value =
        value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] =
        value;
    }
  }
}

async function main() {
  await loadEnv();

  const apiKey =
    process.env.BRIGHTDATA_API_KEY;

  if (!apiKey) {
    console.log(
      "BRIGHTDATA_API_KEY 없음",
    );

    return;
  }

  console.log("");
  console.log(
    "===== Bright Data Zone 확인 =====",
  );

  const response =
    await fetch(
      "https://api.brightdata.com/zone/get_active_zones",
      {
        headers: {
          Authorization:
            `Bearer ${apiKey}`,
        },
      },
    );

  console.log(
    "HTTP:",
    response.status,
  );

  const text =
    await response.text();

  if (!response.ok) {
    console.log(
      "Zone 조회 실패:",
      text.slice(
        0,
        500,
      ),
    );

    return;
  }

  let data: unknown;

  try {
    data =
      JSON.parse(text);
  } catch {
    console.log(
      "Zone 응답 JSON 파싱 실패",
    );

    return;
  }

  const zones =
    Array.isArray(data)
      ? data
      : [];

  console.log(
    "전체 Zone:",
    zones.length,
  );

  console.log("");
  console.log(
    "===== Web Unlocker 후보 =====",
  );

  let found = 0;

  for (
    const item of zones as any[]
  ) {
    const name =
      String(
        item?.name ??
        item?.zone ??
        "",
      );

    const type =
      String(
        item?.type ??
        item?.plan?.type ??
        item?.product ??
        "",
      );

    const textValue =
      JSON.stringify(
        item,
      ).toLowerCase();

    const looksUnlocker =
      textValue.includes(
        "unlocker",
      ) ||
      textValue.includes(
        "web_unlocker",
      );

    if (!looksUnlocker) {
      continue;
    }

    found += 1;

    console.log(
      "- NAME:",
      name || "(이름 없음)",
    );

    console.log(
      "  TYPE:",
      type || "(타입 없음)",
    );
  }

  if (found === 0) {
    console.log(
      "Web Unlocker로 보이는 Zone 없음",
    );
  }

  console.log("");
  console.log(
    "API 키 값 출력: 없음",
  );

  console.log(
    "Web Unlocker 실제 요청: 0",
  );

  console.log(
    "SerpApi 호출: 0",
  );

  console.log(
    "Bright Data 상품 Dataset 호출: 0",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
