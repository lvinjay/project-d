import {
  readFile,
  writeFile,
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

type DatasetItem = {
  id?: string;
  name?: string;
  size?: number;
};

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
    "===== Bright Data Dataset 목록 확인 =====",
  );

  const response =
    await fetch(
      "https://api.brightdata.com/datasets/list",
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
      "목록 조회 실패:",
      text.slice(0, 500),
    );

    return;
  }

  let datasets:
    DatasetItem[] = [];

  try {
    const parsed =
      JSON.parse(text);

    datasets =
      Array.isArray(parsed)
        ? parsed
        : [];
  } catch {
    console.log(
      "Dataset 목록 JSON 파싱 실패",
    );

    return;
  }

  await writeFile(
    "./trash/brightdata-datasets-list.json",
    JSON.stringify(
      datasets,
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    "전체 Dataset:",
    datasets.length,
  );

  const keywords = [
    "product",
    "shopping",
    "ecommerce",
    "e-commerce",
    "commerce",
    "web",
    "crawl",
    "scraper",
  ];

  const relevant =
    datasets.filter(
      (item) => {
        const name =
          String(
            item.name ?? "",
          ).toLowerCase();

        return keywords.some(
          (keyword) =>
            name.includes(
              keyword,
            ),
        );
      },
    );

  console.log("");
  console.log(
    "===== 상품/웹 관련 후보 =====",
  );

  if (
    relevant.length === 0
  ) {
    console.log(
      "관련 이름의 Dataset 없음",
    );
  } else {
    for (
      const item of
      relevant.slice(0, 60)
    ) {
      console.log(
        "-",
        item.id ?? "",
        "|",
        item.name ?? "",
      );
    }
  }

  /*
    현재 Naver 상세수집 Dataset이 실제로
    어떤 Dataset인지 metadata도 확인한다.
  */
  const currentDatasetId =
    "gd_m9qqjxxr1hab7okefj";

  console.log("");
  console.log(
    "===== 현재 Dataset metadata =====",
  );

  const metadataResponse =
    await fetch(
      `https://api.brightdata.com/datasets/${currentDatasetId}/metadata`,
      {
        headers: {
          Authorization:
            `Bearer ${apiKey}`,
        },
      },
    );

  console.log(
    "Metadata HTTP:",
    metadataResponse.status,
  );

  const metadataText =
    await metadataResponse.text();

  if (
    metadataResponse.ok
  ) {
    try {
      const metadata =
        JSON.parse(
          metadataText,
        );

      await writeFile(
        "./trash/brightdata-current-dataset-metadata.json",
        JSON.stringify(
          metadata,
          null,
          2,
        ),
        "utf8",
      );

      console.log(
        "현재 Dataset ID:",
        currentDatasetId,
      );

      console.log(
        "이름:",
        metadata?.name ??
          metadata?.dataset_name ??
          "(이름 필드 없음)",
      );

      const fieldNames =
        metadata?.fields &&
        typeof metadata.fields ===
          "object"
          ? Object.keys(
              metadata.fields,
            )
          : [];

      console.log(
        "필드 일부:",
        fieldNames
          .slice(0, 20)
          .join(", "),
      );
    } catch {
      console.log(
        "Metadata JSON 파싱 실패",
      );
    }
  } else {
    console.log(
      "Metadata 조회 실패:",
      metadataText.slice(
        0,
        500,
      ),
    );
  }

  console.log("");
  console.log(
    "저장 파일:",
  );

  console.log(
    "trash\\brightdata-datasets-list.json",
  );

  console.log(
    "trash\\brightdata-current-dataset-metadata.json",
  );

  console.log("");
  console.log(
    "/trigger 호출: 0",
  );

  console.log(
    "/scrape 호출: 0",
  );

  console.log(
    "SerpApi 호출: 0",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
