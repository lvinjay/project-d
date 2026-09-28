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
};

export type RecommendationPoolSelection =
  RecommendationPoolCandidate & {
    priceBand:
      RecommendationPoolBand;
    selectedFiveAnchor:
      boolean;
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

  for (const candidate of candidates) {
    if (!validCandidate(candidate)) {
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

    result.push({
      dbProductId:
        candidate.dbProductId.trim(),
      originProductNo:
        candidate.originProductNo,
      productName:
        candidate.productName.trim(),
      price:
        candidate.price,
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
      (remainder > 0
        ? 1
        : 0),
    mid:
      base +
      (remainder > 1
        ? 1
        : 0),
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
    return [...rows];
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
        (index *
          (rows.length - 1)) /
          (count - 1),
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

function chooseBand(
  rows:
    RecommendationPoolCandidate[],
  quota: number,
  anchorIds:
    Set<string>,
): RecommendationPoolCandidate[] {
  if (quota <= 0) {
    return [];
  }

  const anchors =
    rows.filter(
      (row) =>
        anchorIds.has(
          row.dbProductId
            .toLowerCase(),
        ),
    );

  const anchorSlice =
    anchors.slice(
      0,
      quota,
    );

  const remaining =
    quota -
    anchorSlice.length;

  if (remaining <= 0) {
    return anchorSlice;
  }

  const anchorSet =
    new Set(
      anchorSlice.map(
        (row) =>
          row.dbProductId
            .toLowerCase(),
      ),
    );

  const others =
    rows.filter(
      (row) =>
        !anchorSet.has(
          row.dbProductId
            .toLowerCase(),
        ),
    );

  return [
    ...anchorSlice,
    ...evenlySpaced(
      others,
      remaining,
    ),
  ];
}

export function planRecommendationPool(
  candidates:
    RecommendationPoolCandidate[],
  options?: {
    targetCount?: number;
    selectedFiveIds?:
      readonly string[];
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

  const anchorIds =
    new Set(
      (
        options
          ?.selectedFiveIds ??
        []
      )
        .map(
          (id) =>
            cleanText(id)
              .toLowerCase(),
        )
        .filter(Boolean),
    );

  const bands =
    splitBands(sorted);

  const quota =
    quotaForTarget(
      targetCount,
    );

  const chosen = [
    ...chooseBand(
      bands.low,
      Math.min(
        quota.low,
        bands.low.length,
      ),
      anchorIds,
    ).map((row) => ({
      ...row,
      priceBand:
        "low" as const,
    })),
    ...chooseBand(
      bands.mid,
      Math.min(
        quota.mid,
        bands.mid.length,
      ),
      anchorIds,
    ).map((row) => ({
      ...row,
      priceBand:
        "mid" as const,
    })),
    ...chooseBand(
      bands.high,
      Math.min(
        quota.high,
        bands.high.length,
      ),
      anchorIds,
    ).map((row) => ({
      ...row,
      priceBand:
        "high" as const,
    })),
  ];

  const chosenIds =
    new Set(
      chosen.map(
        (row) =>
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
        (row) =>
          !chosenIds.has(
            row.dbProductId
              .toLowerCase(),
          ),
      );

    const fill =
      evenlySpaced(
        leftovers,
        targetCount -
          chosen.length,
      );

    for (const row of fill) {
      const index =
        sorted.findIndex(
          (candidate) =>
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
      .map(
        (row) => ({
          ...row,
          selectedFiveAnchor:
            anchorIds.has(
              row.dbProductId
                .toLowerCase(),
            ),
        }),
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
        (row) =>
          row.priceBand ===
          "low",
      ).length,
    midCount:
      products.filter(
        (row) =>
          row.priceBand ===
          "mid",
      ).length,
    highCount:
      products.filter(
        (row) =>
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
