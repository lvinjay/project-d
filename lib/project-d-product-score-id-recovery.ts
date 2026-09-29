const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductIdRow = {
  productId: string;
  [key: string]: unknown;
};

export type ProductIdRepairAudit = {
  repaired: boolean;
  missingProductId: string | null;
  extraProductId: string | null;
  donorProductId: string | null;
  reason: string;
};

function parts(
  value: string,
) {
  const normalized =
    value
      .trim()
      .toLowerCase();

  const segments =
    normalized.split("-");

  return {
    normalized,
    head:
      segments[0] ?? "",
    suffix:
      segments
        .slice(1)
        .join("-"),
  };
}

export function repairSingleSplicedProductId(
  results: unknown,
  expectedProductIds: string[],
): {
  results: unknown;
  audit: ProductIdRepairAudit;
} {
  const unchanged = (
    reason: string,
  ) => ({
    results,
    audit: {
      repaired: false,
      missingProductId: null,
      extraProductId: null,
      donorProductId: null,
      reason,
    },
  });

  if (
    !Array.isArray(results) ||
    results.length !==
      expectedProductIds.length
  ) {
    return unchanged(
      "shape-or-count-mismatch",
    );
  }

  const expected =
    expectedProductIds.map(
      (value) =>
        value
          .trim()
          .toLowerCase(),
    );

  if (
    expected.some(
      (value) =>
        !UUID_RE.test(value),
    ) ||
    new Set(expected).size !==
      expected.length
  ) {
    return unchanged(
      "invalid-expected-membership",
    );
  }

  const rows:
    ProductIdRow[] = [];

  for (const item of results) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      return unchanged(
        "invalid-result-row",
      );
    }

    const row =
      item as Record<
        string,
        unknown
      >;

    if (
      typeof row.productId !==
        "string" ||
      !UUID_RE.test(
        row.productId.trim(),
      )
    ) {
      return unchanged(
        "invalid-result-product-id",
      );
    }

    rows.push(
      row as ProductIdRow,
    );
  }

  const actualIds =
    rows.map(
      (row) =>
        row.productId
          .trim()
          .toLowerCase(),
    );

  if (
    new Set(actualIds).size !==
      actualIds.length
  ) {
    return unchanged(
      "duplicate-result-product-id",
    );
  }

  const expectedSet =
    new Set(expected);

  const actualSet =
    new Set(actualIds);

  const missing =
    expected.filter(
      (value) =>
        !actualSet.has(value),
    );

  const extra =
    actualIds.filter(
      (value) =>
        !expectedSet.has(value),
    );

  if (
    missing.length === 0 &&
    extra.length === 0
  ) {
    return unchanged(
      "exact-membership",
    );
  }

  if (
    missing.length !== 1 ||
    extra.length !== 1
  ) {
    return unchanged(
      "not-single-missing-extra",
    );
  }

  const missingId =
    missing[0];

  const extraId =
    extra[0];

  const missingParts =
    parts(missingId);

  const extraParts =
    parts(extraId);

  if (
    missingParts.head !==
      extraParts.head
  ) {
    return unchanged(
      "missing-head-does-not-match-extra",
    );
  }

  const donors =
    expected.filter(
      (candidate) => {
        if (
          candidate ===
            missingId ||
          !actualSet.has(
            candidate,
          )
        ) {
          return false;
        }

        return (
          parts(candidate)
            .suffix ===
          extraParts.suffix
        );
      },
    );

  if (
    donors.length !== 1
  ) {
    return unchanged(
      "splice-donor-not-unique",
    );
  }

  const donorId =
    donors[0];

  const repairedResults =
    rows.map(
      (row) => {
        const current =
          row.productId
            .trim()
            .toLowerCase();

        if (
          current !== extraId
        ) {
          return row;
        }

        return {
          ...row,
          productId:
            missingId,
        };
      },
    );

  return {
    results:
      repairedResults,
    audit: {
      repaired: true,
      missingProductId:
        missingId,
      extraProductId:
        extraId,
      donorProductId:
        donorId,
      reason:
        "single-proven-head-suffix-splice",
    },
  };
}
