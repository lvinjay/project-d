async function main() {
  const apiKey =
    process.env.SERPAPI_API_KEY;

  const params =
    new URLSearchParams({
      engine: "naver",
      query: "로봇청소기",
      where: "nexearch",
      output: "json",
      api_key: apiKey,
    });

  const response =
    await fetch(
      "https://serpapi.com/search?" +
        params.toString()
    );

  const data =
    await response.json();

  console.log(
    "shopping_results 개수:",
    Array.isArray(data.shopping_results)
      ? data.shopping_results.length
      : "배열 아님"
  );

  console.log("");
  console.log(
    "===== shopping / see_more 관련 값 ====="
  );

  function walk(value, path = "") {
    if (
      !value ||
      typeof value !== "object"
    ) {
      return;
    }

    for (
      const [key, item] of
      Object.entries(value)
    ) {
      const nextPath =
        path
          ? `${path}.${key}`
          : key;

      if (
        /shopping|see_more/i.test(key)
      ) {
        console.log(
          nextPath,
          "=",
          typeof item === "string"
            ? item
            : Array.isArray(item)
              ? `[배열 ${item.length}개]`
              : item
        );
      }

      if (
        item &&
        typeof item === "object"
      ) {
        walk(
          item,
          nextPath
        );
      }
    }
  }

  walk(data);
}

main().catch(console.error);
