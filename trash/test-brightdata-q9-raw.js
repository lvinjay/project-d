const fs = require("fs");

const env = fs.readFileSync(
  ".env.local",
  "utf8"
);

const line = env
  .split(/\r?\n/)
  .find((row) =>
    row
      .trim()
      .startsWith(
        "BRIGHTDATA_API_KEY="
      )
  );

if (!line) {
  throw new Error(
    "BRIGHTDATA_API_KEY를 찾지 못했습니다."
  );
}

const apiKey = line
  .slice(
    line.indexOf("=") + 1
  )
  .trim()
  .replace(
    /^["']|["']$/g,
    ""
  );

const DATASET_ID =
  "gd_m9qqjxxr1hab7okefj";

const productUrl =
  "https://smartstore.naver.com/main/products/10775617216";

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

async function main() {
  const triggerUrl =
    new URL(
      "https://api.brightdata.com/datasets/v3/trigger"
    );

  triggerUrl.searchParams.set(
    "dataset_id",
    DATASET_ID
  );

  triggerUrl.searchParams.set(
    "include_errors",
    "true"
  );

  const triggerResponse =
    await fetch(
      triggerUrl.toString(),
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${apiKey}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify([
          {
            url: productUrl,
          },
        ]),
      }
    );

  const triggerText =
    await triggerResponse.text();

  console.log(
    "TRIGGER STATUS:",
    triggerResponse.status
  );

  console.log(
    "TRIGGER BODY:",
    triggerText
  );

  if (!triggerResponse.ok) {
    return;
  }

  const trigger =
    JSON.parse(triggerText);

  const snapshotId =
    trigger.snapshot_id;

  if (!snapshotId) {
    console.log(
      "snapshot_id 없음"
    );
    return;
  }

  console.log(
    "SNAPSHOT:",
    snapshotId
  );

  for (
    let attempt = 1;
    attempt <= 90;
    attempt++
  ) {
    const progressResponse =
      await fetch(
        `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
        {
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
          },
        }
      );

    const progressText =
      await progressResponse.text();

    console.log(
      `PROGRESS ${attempt}:`,
      progressText
    );

    if (!progressResponse.ok) {
      return;
    }

    const progress =
      JSON.parse(
        progressText
      );

    if (
      progress.status ===
      "ready"
    ) {
      const resultResponse =
        await fetch(
          `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
          {
            headers: {
              Authorization:
                `Bearer ${apiKey}`,
            },
          }
        );

      const resultText =
        await resultResponse.text();

      console.log(
        "RESULT STATUS:",
        resultResponse.status
      );

      console.log(
        "RESULT BODY:",
        resultText
      );

      fs.writeFileSync(
        "./trash/brightdata-everybot-q9-raw.json",
        resultText,
        "utf8"
      );

      console.log(
        "저장 완료: ./trash/brightdata-everybot-q9-raw.json"
      );

      return;
    }

    if (
      progress.status ===
      "failed"
    ) {
      console.log(
        "Bright Data failed"
      );
      return;
    }

    await sleep(5000);
  }

  console.log(
    "시간 초과"
  );
}

main().catch(
  console.error
);

