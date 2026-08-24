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

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("products")
      .select("*")
      .limit(1);

  if (error) {
    throw error;
  }

  const row = data?.[0] ?? {};

  console.log(
    Object.keys(row).sort(),
  );

  console.log("");
  console.log("SerpApi 호출: 0");
  console.log("Bright Data 호출: 0");
  console.log("DB 변경: 0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
