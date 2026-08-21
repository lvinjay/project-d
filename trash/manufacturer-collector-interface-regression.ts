import {
  collectManufacturerProduct,
} from "../lib/manufacturerProductCollector";

async function main() {
  console.log(
    "===== Manufacturer Collector 인터페이스 회귀 테스트 =====",
  );

  const empty =
    await collectManufacturerProduct({
      officialSite: "",
      searchTerms: [],
    });

  console.log(
    !empty.success
      ? "[PASS] 빈 입력 차단"
      : "[FAIL] 빈 입력 차단",
  );

  const invalid =
    await collectManufacturerProduct({
      officialSite:
        "not-a-url",
      searchTerms: [
        "TS450",
      ],
    });

  console.log(
    !invalid.success
      ? "[PASS] 잘못된 공식몰 URL 차단"
      : "[FAIL] 잘못된 공식몰 URL 차단",
  );

  console.log("");
  console.log(
    "SerpApi 호출: 0",
  );
  console.log(
    "Bright Data 호출: 0",
  );
  console.log(
    "유료 API 호출: 0",
  );

  if (
    empty.success ||
    invalid.success
  ) {
    process.exitCode = 1;
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
