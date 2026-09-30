export const RECOMMENDATION_POOL_TARGET = 15;
export const RECOMMENDATION_POOL_MIN = 5;

export type RecommendationPoolBand =
  | "low"
  | "mid"
  | "high";

export type RecommendationPoolCandidate = {
  dbProductId: string;
  originProductNo: number;
  productName: string;
  price: number;

  reviewCount?: number;
  rating?: number;
  marketRank?: number;
  priceVerified?: boolean;
};

export type RecommendationPoolSelection =
  RecommendationPoolCandidate & {
    priceBand:
      RecommendationPoolBand;
  };

export type RecommendationPoolPlan = {
  sourceCount: number;
  targetCount: number;
  selectedCount: number;
  lowCount: number;
  midCount: number;
  highCount: number;
  minPrice: number | null;
  maxPrice: number | null;

  products:
    RecommendationPoolSelection[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function numeric(
  value: unknown,
): number | undefined {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

function validCandidate(
  candidate:
    RecommendationPoolCandidate,
): boolean {
  return (
    UUID_PATTERN.test(
      cleanText(
        candidate.dbProductId,
      ),
    ) &&
    Number.isSafeInteger(
      candidate.originProductNo,
    ) &&
    candidate.originProductNo > 0 &&
    Boolean(
      cleanText(
        candidate.productName,
      ),
    ) &&
    Number.isFinite(
      candidate.price,
    ) &&
    candidate.price > 0
  );
}

function uniqueValidCandidates(
  candidates:
    RecommendationPoolCandidate[],
): RecommendationPoolCandidate[] {
  const ids =
    new Set<string>();

  const origins =
    new Set<number>();

  const result:
    RecommendationPoolCandidate[] =
    [];

  for (
    const candidate of
      candidates
  ) {
    if (
      !validCandidate(
        candidate,
      )
    ) {
      continue;
    }

    const id =
      candidate.dbProductId
        .trim()
        .toLowerCase();

    if (
      ids.has(id) ||
      origins.has(
        candidate.originProductNo,
      )
    ) {
      continue;
    }

    ids.add(id);

    origins.add(
      candidate.originProductNo,
    );

    const reviewCount =
      numeric(
        candidate.reviewCount,
      );

    const rating =
      numeric(
        candidate.rating,
      );

    const marketRank =
      numeric(
        candidate.marketRank,
      );

    result.push({
      dbProductId:
        candidate.dbProductId.trim(),

      originProductNo:
        candidate.originProductNo,

      productName:
        candidate.productName.trim(),

      price:
        candidate.price,

      reviewCount:
        reviewCount !== undefined
          ? Math.max(
              0,
              reviewCount,
            )
          : undefined,

      rating:
        rating !== undefined
          ? Math.max(
              0,
              rating,
            )
          : undefined,

      marketRank:
        marketRank !== undefined &&
        marketRank > 0
          ? marketRank
          : undefined,

      priceVerified:
        typeof candidate.priceVerified ===
        "boolean"
          ? candidate.priceVerified
          : undefined,
    });
  }

  return result.sort(
    (a, b) =>
      a.price - b.price ||
      a.productName.localeCompare(
        b.productName,
        "ko",
      ) ||
      a.dbProductId.localeCompare(
        b.dbProductId,
      ),
  );
}

function splitBands(
  sorted:
    RecommendationPoolCandidate[],
) {
  const count =
    sorted.length;

  if (count === 0) {
    return {
      low: [],
      mid: [],
      high: [],
    };
  }

  const lowEnd =
    Math.ceil(
      count / 3,
    );

  const midEnd =
    Math.ceil(
      (count * 2) / 3,
    );

  return {
    low:
      sorted.slice(
        0,
        lowEnd,
      ),

    mid:
      sorted.slice(
        lowEnd,
        midEnd,
      ),

    high:
      sorted.slice(
        midEnd,
      ),
  };
}

function quotaForTarget(
  targetCount: number,
) {
  const base =
    Math.floor(
      targetCount / 3,
    );

  const remainder =
    targetCount % 3;

  return {
    low:
      base +
      (
        remainder > 0
          ? 1
          : 0
      ),

    mid:
      base +
      (
        remainder > 1
          ? 1
          : 0
      ),

    high:
      base,
  };
}

function evenlySpaced(
  rows:
    RecommendationPoolCandidate[],
  count: number,
): RecommendationPoolCandidate[] {
  if (
    count <= 0 ||
    rows.length === 0
  ) {
    return [];
  }

  if (
    rows.length <= count
  ) {
    return [
      ...rows,
    ];
  }

  if (count === 1) {
    return [
      rows[
        Math.floor(
          (rows.length - 1) /
            2,
        )
      ],
    ];
  }

  const selected:
    RecommendationPoolCandidate[] =
    [];

  const used =
    new Set<number>();

  for (
    let index = 0;
    index < count;
    index++
  ) {
    const raw =
      Math.round(
        (
          index *
          (
            rows.length -
            1
          )
        ) /
          (
            count -
            1
          ),
      );

    let position =
      raw;

    while (
      used.has(position) &&
      position <
        rows.length - 1
    ) {
      position++;
    }

    while (
      used.has(position) &&
      position > 0
    ) {
      position--;
    }

    used.add(position);

    selected.push(
      rows[position],
    );
  }

  return selected;
}

function hasFitnessSignal(
  candidate:
    RecommendationPoolCandidate,
) {
  return (
    (
      Number(
        candidate.reviewCount ??
        0
      ) >
      0
    ) ||
    (
      Number(
        candidate.rating ??
        0
      ) >
      0
    ) ||
    (
      Number(
        candidate.marketRank ??
        0
      ) >
      0
    ) ||
    typeof candidate.priceVerified ===
      "boolean"
  );
}

function modelKey(
  productName: string,
) {
  const tokens =
    productName
      .toLowerCase()
      .replace(
        /[^a-z0-9\uac00-\ud7a3]+/g,
        " ",
      )
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const modelToken =
    tokens.find(
      token =>
        /\d/.test(
          token,
        ),
    );

  if (modelToken) {
    return modelToken;
  }

  return tokens
    .slice(
      0,
      3,
    )
    .join("|") ||
    productName
      .toLowerCase();
}

type FitnessContext = {
  maxReviewCount: number;
  maxMarketRank: number;
};

function buildFitnessContext(
  rows:
    RecommendationPoolCandidate[],
): FitnessContext {
  return {
    maxReviewCount:
      Math.max(
        0,
        ...rows.map(
          row =>
            Number(
              row.reviewCount ??
              0,
            ),
        ),
      ),

    maxMarketRank:
      Math.max(
        0,
        ...rows.map(
          row =>
            Number(
              row.marketRank ??
              0,
            ),
        ),
      ),
  };
}

function clamp01(
  value: number,
) {
  return Math.max(
    0,
    Math.min(
      1,
      value,
    ),
  );
}

function fitnessScore(
  candidate:
    RecommendationPoolCandidate,
  context:
    FitnessContext,
) {
  let weighted =
    0;

  let weight =
    0;

  const reviewCount =
    Number(
      candidate.reviewCount ??
      0,
    );

  if (
    reviewCount > 0 &&
    context.maxReviewCount >
      0
  ) {
    weighted +=
      (
        Math.log1p(
          reviewCount,
        ) /
        Math.log1p(
          context.maxReviewCount,
        )
      ) *
      0.45;

    weight +=
      0.45;
  }

  const rating =
    Number(
      candidate.rating ??
      0,
    );

  if (
    rating > 0
  ) {
    weighted +=
      clamp01(
        rating / 5,
      ) *
      0.30;

    weight +=
      0.30;
  }

  const marketRank =
    Number(
      candidate.marketRank ??
      0,
    );

  if (
    marketRank > 0
  ) {
    const marketScore =
      context.maxMarketRank >
        1
        ? clamp01(
            1 -
              (
                marketRank -
                1
              ) /
                (
                  context.maxMarketRank -
                  1
                ),
          )
        : 1;

    weighted +=
      marketScore *
      0.15;

    weight +=
      0.15;
  }

  if (
    typeof candidate.priceVerified ===
    "boolean"
  ) {
    weighted +=
      (
        candidate.priceVerified
          ? 1
          : 0
      ) *
      0.10;

    weight +=
      0.10;
  }

  if (
    weight === 0
  ) {
    return 0.5;
  }

  return (
    weighted /
    weight
  );
}

function fitnessComparator(
  context:
    FitnessContext,
) {
  return (
    a:
      RecommendationPoolCandidate,
    b:
      RecommendationPoolCandidate,
  ) => {
    const scoreDiff =
      fitnessScore(
        b,
        context,
      ) -
      fitnessScore(
        a,
        context,
      );

    if (
      Math.abs(
        scoreDiff,
      ) >
      1e-9
    ) {
      return scoreDiff;
    }

    const reviewDiff =
      Number(
        b.reviewCount ??
        0,
      ) -
      Number(
        a.reviewCount ??
        0,
      );

    if (
      reviewDiff !== 0
    ) {
      return reviewDiff;
    }

    const ratingDiff =
      Number(
        b.rating ??
        0,
      ) -
      Number(
        a.rating ??
        0,
      );

    if (
      ratingDiff !== 0
    ) {
      return ratingDiff;
    }

    const aRank =
      Number(
        a.marketRank ??
        Number.MAX_SAFE_INTEGER,
      );

    const bRank =
      Number(
        b.marketRank ??
        Number.MAX_SAFE_INTEGER,
      );

    return (
      aRank -
        bRank ||
      a.price -
        b.price ||
      a.productName.localeCompare(
        b.productName,
        "ko",
      )
    );
  };
}

function chooseBand(
  rows:
    RecommendationPoolCandidate[],
  quota: number,
  context:
    FitnessContext,
): RecommendationPoolCandidate[] {
  if (
    quota <= 0
  ) {
    return [];
  }

  if (
    !rows.some(
      hasFitnessSignal,
    )
  ) {
    return evenlySpaced(
      rows,
      quota,
    );
  }

  const ranked =
    [
      ...rows,
    ].sort(
      fitnessComparator(
        context,
      ),
    );

  const picked:
    RecommendationPoolCandidate[] =
      [];

  const pickedIds =
    new Set(
      picked.map(
        row =>
          row.dbProductId
            .toLowerCase(),
      ),
    );

  const usedModels =
    new Set(
      picked.map(
        row =>
          modelKey(
            row.productName,
          ),
      ),
    );

  for (
    const row of ranked
  ) {
    if (
      picked.length >=
      quota
    ) {
      break;
    }

    const key =
      modelKey(
        row.productName,
      );

    if (
      usedModels.has(
        key,
      )
    ) {
      continue;
    }

    picked.push(row);

    pickedIds.add(
      row.dbProductId
        .toLowerCase(),
    );

    usedModels.add(
      key,
    );
  }

  for (
    const row of ranked
  ) {
    if (
      picked.length >=
      quota
    ) {
      break;
    }

    const id =
      row.dbProductId
        .toLowerCase();

    if (
      pickedIds.has(id)
    ) {
      continue;
    }

    picked.push(row);

    pickedIds.add(id);
  }

  return picked;
}

export function planRecommendationPool(
  candidates:
    RecommendationPoolCandidate[],
  options?: {
    targetCount?: number;
  },
): RecommendationPoolPlan {
  const sorted =
    uniqueValidCandidates(
      candidates,
    );

  const requestedTarget =
    Number.isSafeInteger(
      options?.targetCount,
    )
      ? Number(
          options?.targetCount,
        )
      : RECOMMENDATION_POOL_TARGET;

  const targetCount =
    Math.min(
      sorted.length,
      Math.max(
        RECOMMENDATION_POOL_MIN,
        Math.min(
          RECOMMENDATION_POOL_TARGET,
          requestedTarget,
        ),
      ),
    );

  const bands =
    splitBands(
      sorted,
    );

  const quota =
    quotaForTarget(
      targetCount,
    );

  const context =
    buildFitnessContext(
      sorted,
    );

  const chosen = [
    ...chooseBand(
      bands.low,
      Math.min(
        quota.low,
        bands.low.length,
      ),
      context,
    ).map(
      row => ({
        ...row,
        priceBand:
          "low" as const,
      }),
    ),

    ...chooseBand(
      bands.mid,
      Math.min(
        quota.mid,
        bands.mid.length,
      ),
      context,
    ).map(
      row => ({
        ...row,
        priceBand:
          "mid" as const,
      }),
    ),

    ...chooseBand(
      bands.high,
      Math.min(
        quota.high,
        bands.high.length,
      ),
      context,
    ).map(
      row => ({
        ...row,
        priceBand:
          "high" as const,
      }),
    ),
  ];

  const chosenIds =
    new Set(
      chosen.map(
        row =>
          row.dbProductId
            .toLowerCase(),
      ),
    );

  if (
    chosen.length <
    targetCount
  ) {
    const leftovers =
      sorted.filter(
        row =>
          !chosenIds.has(
            row.dbProductId
              .toLowerCase(),
          ),
      );

    const fill =
      leftovers.some(
        hasFitnessSignal,
      )
        ? chooseBand(
            leftovers,
            targetCount -
              chosen.length,
            context,
          )
        : evenlySpaced(
            leftovers,
            targetCount -
              chosen.length,
          );

    for (
      const row of
        fill
    ) {
      const index =
        sorted.findIndex(
          candidate =>
            candidate.dbProductId ===
            row.dbProductId,
        );

      const lowEnd =
        bands.low.length;

      const midEnd =
        lowEnd +
        bands.mid.length;

      chosen.push({
        ...row,

        priceBand:
          index < lowEnd
            ? "low"
            : index < midEnd
              ? "mid"
              : "high",
      });

      chosenIds.add(
        row.dbProductId
          .toLowerCase(),
      );
    }
  }

  const products =
    chosen
      .slice(
        0,
        targetCount,
      )
      .sort(
        (a, b) =>
          a.price -
            b.price ||
          a.productName.localeCompare(
            b.productName,
            "ko",
          ),
      );

  return {
    sourceCount:
      sorted.length,

    targetCount,

    selectedCount:
      products.length,

    lowCount:
      products.filter(
        row =>
          row.priceBand ===
          "low",
      ).length,

    midCount:
      products.filter(
        row =>
          row.priceBand ===
          "mid",
      ).length,

    highCount:
      products.filter(
        row =>
          row.priceBand ===
          "high",
      ).length,

    minPrice:
      products.length > 0
        ? products[0].price
        : null,

    maxPrice:
      products.length > 0
        ? products[
            products.length -
              1
          ].price
        : null,

    products,
  };
}
