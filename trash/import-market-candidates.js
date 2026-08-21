const fs = require("fs");

const path =
  "./trash/market-candidates-final.json";

const source =
  JSON.parse(
    fs
      .readFileSync(
        path,
        "utf8"
      )
      .replace(
        /^\uFEFF/,
        ""
      )
  );

async function main() {
  const response =
    await fetch(
      "http://localhost:3000/api/import-market-candidates",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            category:
              source.category,

            candidates:
              source.finalCandidates,
          }),
      }
    );

  const data =
    await response.json();

  console.log(
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

main().catch(
  console.error
);
