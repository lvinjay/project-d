const { createClient } =
  require("@supabase/supabase-js");

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

function findPrices(value, path = "") {
  const results = [];

  if (!value || typeof value !== "object") {
    return results;
  }

  for (const [key, item] of Object.entries(value)) {
    const nextPath =
      path ? `${path}.${key}` : key;

    if (
      /price|가격|판매가|할인가|actualPurchase/i.test(key)
    ) {
      results.push({
        path: nextPath,
        value: item
      });
    }

    if (
      item &&
      typeof item === "object"
    ) {
      results.push(
        ...findPrices(
          item,
          nextPath
        )
      );
    }
  }

  return results;
}

async function main() {
  const { data, error } =
    await supabase
      .from("products")
      .select(
        "product_name, market_metrics, product_detail_analysis"
      )
      .eq(
        "category",
        "로봇청소기"
      );

  if (error) {
    throw error;
  }

  for (const product of data ?? []) {
    console.log("");
    console.log(
      "================================"
    );
    console.log(
      product.product_name
    );

    console.log(
      "MARKET:",
      findPrices(
        product.market_metrics
      )
    );

    console.log(
      "DETAIL:",
      findPrices(
        product.product_detail_analysis
      )
    );
  }
}

main().catch(console.error);
