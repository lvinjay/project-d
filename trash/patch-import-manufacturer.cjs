const fs = require("fs");

const path =
  "app/api/import-market-candidates/route.ts";

let text =
  fs.readFileSync(
    path,
    "utf8",
  );

/*
  1. productId 숫자 강제 조건 제거.

  Naver:
  productId 있음 -> origin_product_no 사용

  Manufacturer:
  productId 없음 -> origin_product_no = null
  source_url을 canonical identity로 사용
*/
text =
  text.replace(
`      const originProductNo =
        Number(
          productId,
        );

      if (
        !productId ||
        !productName ||
        !sourceUrl ||
        !Number.isSafeInteger(
          originProductNo,
        )
      ) {`,
`      const numericProductId =
        Number(
          productId,
        );

      const originProductNo =
        productId &&
        Number.isSafeInteger(
          numericProductId,
        ) &&
        numericProductId > 0
          ? numericProductId
          : null;

      if (
        !productName ||
        !sourceUrl
      ) {`,
  );

/*
  2. product_detail_analysis에 source identity 기록.
*/
text =
  text.replace(
`        source:
          "market_candidate_brightdata",

        productId,`,
`        source:
          productId
            ? "market_candidate_naver"
            : "market_candidate_manufacturer",

        sourceType:
          productId
            ? "naver-brand"
            : "manufacturer",

        identityKey:
          productId
            ? \`naver:\${productId}\`
            : \`manufacturer:\${sourceUrl}\`,

        productId,`,
  );

/*
  3. 기존상품 검색을 source type별로 분리.

  Manufacturer에서
  origin_product_no.eq.null 같은 잘못된 OR 조건을 만들지 않는다.
*/
text =
  text.replace(
`      const {
        data: existing,
        error:
          existingError,
      } =
        await supabase
          .from("products")
          .select("id")
          .or(
            \`origin_product_no.eq.\${originProductNo},source_url.eq.\${sourceUrl}\`,
          )
          .limit(1);`,
`      let existingQuery =
        supabase
          .from("products")
          .select("id");

      if (
        originProductNo !==
        null
      ) {
        existingQuery =
          existingQuery.or(
            \`origin_product_no.eq.\${originProductNo},source_url.eq.\${sourceUrl}\`,
          );
      } else {
        existingQuery =
          existingQuery.eq(
            "source_url",
            sourceUrl,
          );
      }

      const {
        data: existing,
        error:
          existingError,
      } =
        await existingQuery
          .limit(1);`,
  );

fs.writeFileSync(
  path,
  text,
  "utf8",
);

console.log(
  "import-market-candidates Manufacturer 지원 적용 완료",
);
