import {
  writeFile,
} from "node:fs/promises";

async function main() {
  const captureId =
    "b62a232b-a3d7-4da0-85ea-d923fac4597b";

  const url =
    `http://localhost:3000/api/market-candidates-enriched?captureId=${encodeURIComponent(
      captureId,
    )}`;

  console.log("");
  console.log(
    "===== 로봇청소기 Manufacturer 생산 통합 테스트 =====",
  );

  console.log(
    "Capture:",
    captureId,
  );

  console.log("");
  console.log(
    "실행 중...",
  );

  console.log(
    "※ 실제 Resolver / Bright Data 호출이 발생할 수 있습니다.",
  );

  const startedAt =
    Date.now();

  const response =
    await fetch(
      url,
      {
        cache:
          "no-store",
      },
    );

  const rawText =
    await response.text();

  await writeFile(
    "./trash/robot-manufacturer-production-integration.json",
    rawText,
    "utf8",
  );

  let data: any;

  try {
    data =
      JSON.parse(
        rawText,
      );
  } catch {
    console.log("");
    console.log(
      "JSON 파싱 실패",
    );

    console.log(
      rawText.slice(
        0,
        1500,
      ),
    );

    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log(
    "===== 완료 =====",
  );

  console.log(
    "HTTP:",
    response.status,
  );

  console.log(
    "성공:",
    data.success,
  );

  console.log(
    "소요 시간:",
    Math.round(
      (
        Date.now() -
        startedAt
      ) /
        1000,
    ),
    "초",
  );

  console.log(
    "카테고리:",
    data.category ??
      "",
  );

  console.log(
    "시장 후보:",
    data.marketCandidateCount ??
      0,
  );

  console.log(
    "최종 후보:",
    data.finalCandidateCount ??
      0,
  );

  console.log(
    "목표 달성:",
    data.targetReached,
  );

  console.log(
    "Resolver 시도:",
    data.resolverAttempts ??
      0,
  );

  console.log(
    "Bright Data 호출:",
    data.brightDataCalls ??
      0,
  );

  const candidates =
    Array.isArray(
      data.finalCandidates,
    )
      ? data.finalCandidates
      : [];

  const full =
    candidates.filter(
      (item: any) =>
        item?.detail
          ?.detailStatus ===
        "full",
    );

  const partial =
    candidates.filter(
      (item: any) =>
        item?.detail
          ?.detailStatus !==
        "full",
    );

  console.log(
    "FULL:",
    full.length,
  );

  console.log(
    "PARTIAL:",
    partial.length,
  );

  console.log("");
  console.log(
    "===== 최종 후보 =====",
  );

  for (
    const candidate of
    candidates
  ) {
    const status =
      candidate?.detail
        ?.detailStatus ??
      "";

    const sourceType =
      candidate?.canonicalSource
        ?.sourceType ??
      candidate?.resolution
        ?.sourceType ??
      "legacy";

    const productId =
      candidate?.detail
        ?.productId ??
      "";

    console.log("");
    console.log(
      `${candidate?.position ?? "?"}. [${status}] [${sourceType}]`,
    );

    console.log(
      "MARKET:",
      candidate?.market
        ?.productName ??
        "",
    );

    console.log(
      "DETAIL:",
      candidate?.detail
        ?.productName ??
        "",
    );

    console.log(
      "PRODUCT ID:",
      productId ||
        "(없음)",
    );

    console.log(
      "BRAND:",
      candidate?.canonicalSource
        ?.brandName ??
        "",
    );

    console.log(
      "URL:",
      candidate?.canonicalSource
        ?.url ??
        "",
    );

    console.log(
      "IDENTITY:",
      candidate?.canonicalSource
        ?.identityKey ??
        candidate?.resolution
          ?.identityKey ??
        "",
    );
  }

  const ts450 =
    candidates.find(
      (candidate: any) =>
        String(
          candidate?.market
            ?.productName ??
          "",
        )
          .toLowerCase()
          .includes(
            "ts450",
          ) ||
        String(
          candidate?.detail
            ?.productName ??
          "",
        )
          .toLowerCase()
          .includes(
            "ts450",
          ),
    );

  console.log("");
  console.log(
    "===== TS450 생산 판정 =====",
  );

  if (!ts450) {
    console.log(
      "TS450 최종 후보에 없음",
    );
  } else {
    const status =
      ts450?.detail
        ?.detailStatus ??
      "";

    const sourceType =
      ts450?.canonicalSource
        ?.sourceType ??
      ts450?.resolution
        ?.sourceType ??
      "";

    const productId =
      String(
        ts450?.detail
          ?.productId ??
        "",
      );

    const identity =
      String(
        ts450?.canonicalSource
          ?.identityKey ??
        ts450?.resolution
          ?.identityKey ??
        "",
      );

    console.log(
      "상태:",
      status,
    );

    console.log(
      "sourceType:",
      sourceType,
    );

    console.log(
      "productId:",
      productId ||
        "(없음 - Manufacturer 정상)",
    );

    console.log(
      "identityKey:",
      identity,
    );

    console.log(
      "가격:",
      ts450?.detail
        ?.finalPrice ??
        0,
    );

    console.log(
      "이미지:",
      ts450?.detail
        ?.imageUrl
        ? "YES"
        : "NO",
    );

    const passed =
      status ===
        "full" &&
      sourceType ===
        "manufacturer" &&
      !productId &&
      identity.startsWith(
        "manufacturer:",
      );

    console.log("");
    console.log(
      passed
        ? "[PASS] TS450 Manufacturer FULL"
        : "[FAIL] TS450 Manufacturer 생산 판정",
    );
  }

  const failures =
    Array.isArray(
      data.failures,
    )
      ? data.failures
      : [];

  if (
    failures.length >
    0
  ) {
    console.log("");
    console.log(
      "===== 실패 목록 =====",
    );

    for (
      const failure of
      failures
    ) {
      console.log(
        `- ${failure.position}. [${failure.stage}] ${failure.marketProduct}`,
      );

      console.log(
        `  ${failure.reason}`,
      );
    }
  }

  console.log("");
  console.log(
    "결과 파일:",
  );

  console.log(
    "trash\\robot-manufacturer-production-integration.json",
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
