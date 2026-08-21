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
      name + " 환경변수를 찾지 못했습니다."
    );
  }

  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

const apiKey =
  getEnv("BRIGHTDATA_API_KEY");

/*
  Bright Data Naver products - Collect by URL
  dataset id
*/
const datasetId =
  "gd_m9qqjxxr1hab7okefj";

const productUrl =
  "https://brand.naver.com/roborock/products/13069025259";

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

async function main() {
  const triggerUrl =
    "https://api.brightdata.com/datasets/v3/trigger" +
    "?dataset_id=" +
    encodeURIComponent(datasetId) +
    "&include_errors=true";

  console.log(
    "Bright Data 상품 상세 수집 시작..."
  );

  const triggerResponse =
    await fetch(
      triggerUrl,
      {
        method: "POST",
        headers: {
          Authorization:
            "Bearer " + apiKey,
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

  if (!triggerResponse.ok) {
    throw new Error(
      "Trigger 실패 (" +
        triggerResponse.status +
        "): " +
        triggerText
    );
  }

  const trigger =
    JSON.parse(triggerText);

  const snapshotId =
    trigger.snapshot_id;

  if (!snapshotId) {
    throw new Error(
      "snapshot_id 없음: " +
        triggerText
    );
  }

  console.log(
    "Snapshot ID:",
    snapshotId
  );

  fs.writeFileSync(
    "./trash/brightdata-product-trigger.json",
    JSON.stringify(
      trigger,
      null,
      2
    ),
    "utf8"
  );

  for (
    let attempt = 1;
    attempt <= 60;
    attempt++
  ) {
    const progressResponse =
      await fetch(
        "https://api.brightdata.com/datasets/v3/progress/" +
          snapshotId,
        {
          headers: {
            Authorization:
              "Bearer " + apiKey,
          },
        }
      );

    const progress =
      await progressResponse.json();

    console.log(
      `[${attempt}/60] 상태:`,
      progress.status
    );

    fs.writeFileSync(
      "./trash/brightdata-product-progress.json",
      JSON.stringify(
        progress,
        null,
        2
      ),
      "utf8"
    );

    if (
      progress.status === "ready"
    ) {
      const resultResponse =
        await fetch(
          "https://api.brightdata.com/datasets/v3/snapshot/" +
            snapshotId +
            "?format=json",
          {
            headers: {
              Authorization:
                "Bearer " + apiKey,
            },
          }
        );

      const resultText =
        await resultResponse.text();

      fs.writeFileSync(
        "./trash/brightdata-product-detail.json",
        resultText,
        "utf8"
      );

      console.log("");
      console.log(
        "상품 상세 수집 완료"
      );
      console.log(
        "저장: .\\trash\\brightdata-product-detail.json"
      );

      return;
    }

    if (
      progress.status === "failed"
    ) {
      throw new Error(
        "수집 실패: " +
          JSON.stringify(progress)
      );
    }

    await sleep(10000);
  }

  throw new Error(
    "10분 안에 완료되지 않았습니다."
  );
}

main().catch((error) => {
  console.error("");
  console.error(error);
  process.exit(1);
});
