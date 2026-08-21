import {
  collectManufacturerProduct,
} from "../lib/manufacturerProductCollector";

async function main() {
  console.log("");
  console.log("===== S10 Manufacturer 최종 단독 확인 =====");

  const result =
    await collectManufacturerProduct({
      officialSite:
        "https://kr.roborock.com",

      searchTerms: [
        "S10",
        "MaxV",
        "Ultra",
      ],
    });

  console.log(
    JSON.stringify(
      result,
      null,
      2,
    ),
  );

  if (
    result.success
  ) {
    console.log("");
    console.log("===== 시장가격 fallback 가정 =====");

    const marketPrice =
      1490000;

    const finalPrice =
      result.detail.finalPrice > 0
        ? result.detail.finalPrice
        : marketPrice;

    console.log(
      "manufacturer finalPrice:",
      result.detail.finalPrice,
    );

    console.log(
      "market fallback price:",
      marketPrice,
    );

    console.log(
      "resolved finalPrice:",
      finalPrice,
    );

    console.log(
      "title:",
      result.detail.title,
    );

    console.log(
      "canonicalUrl:",
      result.detail.canonicalUrl,
    );
  }

  console.log("");
  console.log("SerpApi 호출: 0");
  console.log("Bright Data 호출: 0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
