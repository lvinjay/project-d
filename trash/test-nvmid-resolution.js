const items = [
  {
    name: "모바 P70 Pro Ultra",
    nvMid: "59760912197"
  },
  {
    name: "드리미 X60 Ultra",
    nvMid: "59215055197"
  },
  {
    name: "드리미 X60 Master",
    nvMid: "59204433943"
  }
];

async function main() {
  const apiKey =
    process.env.SERPAPI_API_KEY;

  for (const item of items) {
    console.log("");
    console.log("================================");
    console.log(
      "검색:",
      item.name,
      item.nvMid
    );

    const queries = [
      item.nvMid,
      `${item.nvMid} ${item.name}`,
      `${item.name} ${item.nvMid}`
    ];

    const found =
      new Set();

    for (const query of queries) {
      const params =
        new URLSearchParams({
          engine: "naver",
          query,
          where: "nexearch",
          output: "json",
          api_key: apiKey
        });

      const response =
        await fetch(
          "https://serpapi.com/search?" +
            params.toString()
        );

      const data =
        await response.json();

      console.log("");
      console.log("QUERY:", query);

      if (!response.ok || data.error) {
        console.log(
          "ERROR:",
          data.error || response.status
        );
        continue;
      }

      const serialized =
        JSON.stringify(data);

      const matches =
        serialized.match(
          /https?:\\?\/\\?\/(?:brand|smartstore)\.naver\.com\\?\/[^"'\\\s]+/gi
        ) || [];

      for (const value of matches) {
        found.add(
          value.replace(/\\\//g, "/")
        );
      }

      console.log(
        "shopping_results:",
        Array.isArray(data.shopping_results)
          ? data.shopping_results.length
          : 0
      );

      console.log(
        "web_results:",
        Array.isArray(data.web_results)
          ? data.web_results.length
          : 0
      );

      console.log(
        "발견 URL:",
        [...found].slice(0, 20)
      );
    }

    console.log("");
    console.log(
      "최종 발견 URL:",
      [...found]
    );
  }
}

main().catch(console.error);
