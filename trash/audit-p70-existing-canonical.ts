import fs from "fs";
import path from "path";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;

  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();

    if (!line || line.startsWith("#")) continue;

    const index = line.indexOf("=");

    if (index <= 0) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnv(path.resolve(".env.local"));
  loadEnv(path.resolve(".env"));

  const {
    supabaseAdmin,
  } = await import("../lib/supabaseAdmin");

  const productId = 13280227814;

  console.log("");
  console.log("===== P70 products 조회 =====");

  const {
    data: products,
    error: productError,
  } =
    await supabaseAdmin
      .from("products")
      .select(
        "id,origin_product_no,name,product_detail_analysis",
      )
      .eq(
        "origin_product_no",
        productId,
      );

  if (productError) {
    throw productError;
  }

  console.log(
    JSON.stringify(
      products,
      null,
      2,
    ),
  );

  console.log("");
  console.log("===== P70 brand_store_mappings 조회 =====");

  const {
    data: mappings,
    error: mappingError,
  } =
    await supabaseAdmin
      .from("brand_store_mappings")
      .select("*")
      .eq(
        "brand_key",
        "모바",
      );

  if (mappingError) {
    throw mappingError;
  }

  console.log(
    JSON.stringify(
      mappings,
      null,
      2,
    ),
  );

  console.log("");
  console.log("===== 비용 =====");
  console.log("SerpApi 호출: 0");
  console.log("Bright Data 호출: 0");
  console.log("DB 변경: 0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
