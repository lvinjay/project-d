import {
  writeFile,
} from "node:fs/promises";

async function main() {
  const captureId =
    "1494ae18-2eaf-45fa-92bf-381e7a2bd476";

  const url =
    `http://localhost:3000/api/market-candidates-enriched?captureId=${encodeURIComponent(
      captureId,
    )}`;

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

  const text =
    await response.text();

  await writeFile(
    "./trash/fresh-manufacturer-enriched-full.json",
    text,
    "utf8",
  );

  let data: any;

  try {
    data =
      JSON.parse(
        text,
      );
  } catch {
    await writeFile(
      "./trash/fresh-manufacturer-enriched-summary.txt",
      [
        "JSON 파싱 실패",
        `HTTP: ${response.status}`,
        "",
        text.slice(
          0,
          3000,
        ),
      ].join("\n"),
      "utf8",
    );

    console.log(
      "JSON 파싱 실패",
    );

    process.exitCode = 1;
    return;
  }

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

  const ts450 =
    candidates.find(
      (item: any) => {
        const marketName =
          String(
            item?.market
              ?.productName ??
            "",
          ).toLowerCase();

        const detailName =
          String(
            item?.detail
              ?.productName ??
            "",
          ).toLowerCase();

        return (
          marketName.includes(
            "ts450",
          ) ||
          detailName.includes(
            "ts450",
          )
        );
      },
    );

  const ts450Status =
    ts450?.detail
      ?.detailStatus ??
    "";

  const ts450SourceType =
    ts450?.canonicalSource
      ?.sourceType ??
    ts450?.resolution
      ?.sourceType ??
    "";

  const ts450ProductId =
    String(
      ts450?.detail
        ?.productId ??
      "",
    );

  const ts450Identity =
    String(
      ts450?.canonicalSource
        ?.identityKey ??
      ts450?.resolution
        ?.identityKey ??
      "",
    );

  const ts450Passed =
    Boolean(ts450) &&
    ts450Status ===
      "full" &&
    ts450SourceType ===
      "manufacturer" &&
    !ts450ProductId &&
    ts450Identity.startsWith(
      "manufacturer:",
    );

  const summaryLines = [
    "===== Fresh Manufacturer Enriched 통합 결과 =====",
    "",
    `HTTP: ${response.status}`,
    `성공: ${data.success}`,
    `소요 시간: ${Math.round(
      (Date.now() -
        startedAt) /
        1000,
    )}초`,
    `카테고리: ${data.category ?? ""}`,
    `시장 후보: ${data.marketCandidateCount ?? 0}`,
    `최종 후보: ${data.finalCandidateCount ?? 0}`,
    `FULL: ${full.length}`,
    `PARTIAL: ${partial.length}`,
    `목표 달성: ${data.targetReached}`,
    `Resolver 시도: ${data.resolverAttempts ?? 0}`,
    `Bright Data 호출: ${data.brightDataCalls ?? 0}`,
    "",
    "===== TS450 생산 판정 =====",
    `TS450 존재: ${ts450 ? "YES" : "NO"}`,
    `상태: ${ts450Status || "-"}`,
    `sourceType: ${ts450SourceType || "-"}`,
    `productId: ${ts450ProductId || "(없음)"}`,
    `identityKey: ${ts450Identity || "-"}`,
    `가격: ${ts450?.detail?.finalPrice ?? 0}`,
    `이미지: ${ts450?.detail?.imageUrl ? "YES" : "NO"}`,
    "",
    ts450Passed
      ? "[PASS] TS450 Manufacturer FULL"
      : "[FAIL] TS450 Manufacturer 생산 판정",
    "",
    "===== 최종 후보 =====",
  ];

  for (
    const candidate of
    candidates
  ) {
    summaryLines.push(
      "",
      `${candidate?.position ?? "?"}. [${candidate?.detail?.detailStatus ?? ""}] [${candidate?.canonicalSource?.sourceType ?? candidate?.resolution?.sourceType ?? "legacy"}]`,
      `MARKET: ${candidate?.market?.productName ?? ""}`,
      `DETAIL: ${candidate?.detail?.productName ?? ""}`,
      `BRAND: ${candidate?.canonicalSource?.brandName ?? ""}`,
      `URL: ${candidate?.canonicalSource?.url ?? ""}`,
      `IDENTITY: ${candidate?.canonicalSource?.identityKey ?? candidate?.resolution?.identityKey ?? ""}`,
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
    summaryLines.push(
      "",
      "===== 실패 목록 =====",
    );

    for (
      const failure of
      failures
    ) {
      summaryLines.push(
        "",
        `${failure.position ?? "?"}. [${failure.stage ?? ""}]`,
        `${failure.marketProduct ?? ""}`,
        `${failure.reason ?? ""}`,
      );
    }
  }

  await writeFile(
    "./trash/fresh-manufacturer-enriched-summary.txt",
    summaryLines.join(
      "\n",
    ),
    "utf8",
  );

  console.log("");
  console.log(
    "===== 실행 완료 =====",
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
    "최종 후보:",
    data.finalCandidateCount ??
      0,
  );

  console.log(
    "FULL:",
    full.length,
  );

  console.log(
    "PARTIAL:",
    partial.length,
  );

  console.log(
    "Bright Data 호출:",
    data.brightDataCalls ??
      0,
  );

  console.log("");
  console.log(
    "TS450:",
    ts450
      ? `${ts450Status} / ${ts450SourceType}`
      : "없음",
  );

  console.log(
    ts450Passed
      ? "TS450 Manufacturer FULL: PASS"
      : "TS450 Manufacturer FULL: FAIL",
  );

  console.log("");
  console.log(
    "저장 파일:",
  );

  console.log(
    "trash\\fresh-manufacturer-enriched-summary.txt",
  );

  console.log(
    "trash\\fresh-manufacturer-enriched-full.json",
  );
}

main().catch(
  async (
    error,
  ) => {
    const message =
      error instanceof Error
        ? error.stack ||
          error.message
        : String(error);

    await writeFile(
      "./trash/fresh-manufacturer-enriched-error.txt",
      message,
      "utf8",
    );

    console.error(
      "ERROR:",
      error,
    );

    process.exitCode = 1;
  },
);
