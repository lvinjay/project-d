const baseUrl =
  process.env.PROJECT_D_BASE_URL?.trim() ||
  "http://localhost:3000";

const categories = [
  "캠핑용 에어컨",
  "로봇청소기",
];

for (const category of categories) {
  const manifestResponse = await fetch(
    `${baseUrl}/api/selected-five-manifest?category=${encodeURIComponent(category)}`,
    { cache: "no-store" },
  );

  const manifestResult = await manifestResponse.json();

  if (
    !manifestResponse.ok ||
    manifestResult.success !== true ||
    !manifestResult.manifest ||
    !Array.isArray(manifestResult.manifest.products) ||
    manifestResult.manifest.products.length !== 5
  ) {
    throw new Error(
      `${category}: published selected-five readiness failed: ${
        manifestResult.message ?? manifestResponse.status
      }`,
    );
  }

  const productIds =
    manifestResult.manifest.products.map(
      (product) => product.dbProductId,
    );

  const scoreResponse = await fetch(
    `${baseUrl}/api/generate-product-scores`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category,
        productIds,
        dryRun: true,
      }),
    },
  );

  const scoreResult = await scoreResponse.json();

  if (
    !scoreResponse.ok ||
    scoreResult.success !== true ||
    scoreResult.dryRun !== true ||
    scoreResult.paidApiCalls !== 0 ||
    scoreResult.cacheHit !== true ||
    scoreResult.estimatedOpenAiCalls !== 0
  ) {
    throw new Error(
      `${category}: product-score readiness failed: ${
        scoreResult.message ?? scoreResponse.status
      }`,
    );
  }

  console.log(
    `${category}: READY | selected-five=5 | score-cache=HIT | OpenAI=0`,
  );
}

console.log(
  "LIVE PUBLIC READINESS PASS: all currently published categories are ready; paid calls 0.",
);
