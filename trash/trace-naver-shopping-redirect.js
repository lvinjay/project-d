async function trace(url) {
  let current = url;

  console.log("");
  console.log("START:", current);

  for (let i = 1; i <= 8; i++) {
    try {
      const response = await fetch(
        current,
        {
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
          },
        }
      );

      console.log("");
      console.log(
        `STEP ${i}`,
        "STATUS:",
        response.status
      );

      console.log(
        "URL:",
        current
      );

      const location =
        response.headers.get(
          "location"
        );

      console.log(
        "LOCATION:",
        location || "(없음)"
      );

      if (!location) {
        console.log(
          "FINAL RESPONSE URL:",
          response.url
        );

        break;
      }

      current =
        new URL(
          location,
          current
        ).toString();

    } catch (error) {
      console.log(
        "ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      break;
    }
  }
}

trace(
  "https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=59760912197&cat_id=50015541&query=%EB%A1%9C%EB%B4%87%EC%B2%AD%EC%86%8C%EA%B8%B0&t=msy6aekz&h=97c89bcd4100a2745d8a4bbb16c879bae22ea0c3&frm=NVSCDIG"
);
