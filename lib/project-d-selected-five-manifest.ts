export const SELECTED_FIVE_KEY = "projectDSelectedFiveManifest";
export const CURRENT_RUN_KEY = "projectDCurrentSelectionRun";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SelectionRun = { runId: string; category: string };
export type SelectedProduct = {
  dbProductId: string; originProductNo: number; productName: string;
  readiness: { runId: string; reviewCount: number; reviewAnalysisSaved: true;
    analysisFingerprint: string; rawCorpusPersisted: boolean };
};
export type RecommendationPoolProduct = {
  dbProductId: string;
  originProductNo: number;
  productName: string;
};
export type SelectedFiveManifest = SelectionRun & {
  schemaVersion: 1;
  profileRevision: string;
  products: SelectedProduct[];
  recommendationPool?: RecommendationPoolProduct[];
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("선택 manifest 형식이 잘못되었습니다.");
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}
export function normalizeCategoryKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, "").toLowerCase();
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return "{" + Object.keys(row).sort().map(key => JSON.stringify(key) + ":" + canonical(row[key])).join(",") + "}";
  }
  return JSON.stringify(value ?? null);
}
// Exact canonical content identity, not a lossy hash or timestamp-only revision.
export function categoryProfileRevision(value: unknown): string {
  const row = object(value);
  if (!text(row.id) || !text(row.category) || !text(row.updated_at) ||
      !Array.isArray(row.criteria) || row.criteria.length !== 5) throw new Error("유효한 카테고리 프로필 revision이 없습니다.");
  return canonical(Object.fromEntries(["id", "category", "updated_at", "title", "introduction", "criteria",
    "personalization_questions", "use_cases", "candidate_limit"].map(key => [key, row[key]])));
}
export function validateSelectedFive(
  value: unknown,
  run: SelectionRun,
  revision?: string,
): SelectedFiveManifest {
  const row = object(value);

  if (
    row.schemaVersion !== 1 ||
    !UUID_PATTERN.test(String(row.runId)) ||
    row.runId !== run.runId ||
    !text(row.category) ||
    row.category !== run.category ||
    !text(row.profileRevision) ||
    (
      revision !== undefined &&
      row.profileRevision !== revision
    ) ||
    !Array.isArray(row.products)
  ) {
    throw new Error(
      "Published Recommendation Pool manifest is invalid.",
    );
  }

  if (row.products.length > 15) {
    throw new Error(
      "Recommendation Pool cannot contain more than 15 ready products.",
    );
  }

  const readyIds =
    new Set<string>();

  const readyOrigins =
    new Set<number>();

  for (const item of row.products) {
    const p =
      object(item);

    const ready =
      object(p.readiness);

    if (
      typeof p.dbProductId !== "string" ||
      !UUID_PATTERN.test(p.dbProductId) ||
      readyIds.has(
        p.dbProductId.toLowerCase(),
      ) ||
      typeof p.originProductNo !== "number" ||
      !Number.isSafeInteger(
        p.originProductNo,
      ) ||
      p.originProductNo <= 0 ||
      readyOrigins.has(
        p.originProductNo,
      ) ||
      !text(p.productName) ||
      ready.runId !== run.runId ||
      ready.reviewAnalysisSaved !== true ||
      typeof ready.rawCorpusPersisted !== "boolean" ||
      !Number.isSafeInteger(
        ready.reviewCount,
      ) ||
      Number(ready.reviewCount) < 30 ||
      Number(ready.reviewCount) > 1000 ||
      typeof ready.analysisFingerprint !==
        "string" ||
      !/^[a-f0-9]{64}$/.test(
        ready.analysisFingerprint,
      )
    ) {
      throw new Error(
        "Recommendation Pool ready-product identity is invalid.",
      );
    }

    readyIds.add(
      p.dbProductId.toLowerCase(),
    );

    readyOrigins.add(
      p.originProductNo,
    );
  }

  if (
    row.recommendationPool !== undefined
  ) {
    if (
      !Array.isArray(
        row.recommendationPool,
      ) ||
      row.recommendationPool.length < 5 ||
      row.recommendationPool.length > 15
    ) {
      throw new Error(
        "Recommendation Pool must contain 5 to 15 unique products.",
      );
    }

    const poolIds =
      new Set<string>();

    const poolOrigins =
      new Set<number>();

    for (
      const item of
        row.recommendationPool
    ) {
      const p =
        object(item);

      if (
        typeof p.dbProductId !==
          "string" ||
        !UUID_PATTERN.test(
          p.dbProductId,
        ) ||
        poolIds.has(
          p.dbProductId.toLowerCase(),
        ) ||
        typeof p.originProductNo !==
          "number" ||
        !Number.isSafeInteger(
          p.originProductNo,
        ) ||
        p.originProductNo <= 0 ||
        poolOrigins.has(
          p.originProductNo,
        ) ||
        !text(p.productName)
      ) {
        throw new Error(
          "Recommendation Pool product identity is invalid.",
        );
      }

      poolIds.add(
        p.dbProductId.toLowerCase(),
      );

      poolOrigins.add(
        p.originProductNo,
      );
    }

    for (const readyId of readyIds) {
      if (!poolIds.has(readyId)) {
        throw new Error(
          "Ready products must belong to the Recommendation Pool.",
        );
      }
    }
  } else if (
    row.products.length < 5
  ) {
    throw new Error(
      "Recommendation Pool must contain at least 5 products.",
    );
  }

  return row as SelectedFiveManifest;
}
export function beginSelectionRun(storage: Store, category: string): SelectionRun {
  if (!text(category)) throw new Error("카테고리가 필요합니다.");
  const run = { runId: crypto.randomUUID(), category };
  for (const key of [SELECTED_FIVE_KEY, "projectDAutomationProductNames", "projectDAdvisorAnswers",
    "projectDPersonalPreferenceCache"]) storage.removeItem(key);
  storage.setItem(CURRENT_RUN_KEY, JSON.stringify(run));
  return run;
}
export function assertSelectionRun(storage: Store, run: SelectionRun) {
  const current = object(JSON.parse(storage.getItem(CURRENT_RUN_KEY) ?? "null"));
  if (current.runId !== run.runId || current.category !== run.category) throw new Error("실행이 변경되었습니다. 현재 작업을 중단합니다.");
}
export function readSelectedFive(storage: Store, category?: string) {
  const run = object(JSON.parse(storage.getItem(CURRENT_RUN_KEY) ?? "null"));
  if (!text(run.runId) || !text(run.category) || (category && normalizeCategoryKey(run.category) !== normalizeCategoryKey(category))) throw new Error("현재 선택 실행이 없습니다.");
  return validateSelectedFive(JSON.parse(storage.getItem(SELECTED_FIVE_KEY) ?? "null"), run as SelectionRun);
}
export function selectedFiveIdentity(
  manifest: SelectedFiveManifest,
) {
  return canonical(manifest);
}

export function recommendationPoolProducts(
  manifest: SelectedFiveManifest,
): RecommendationPoolProduct[] {
  const legacyPool =
    Array.isArray(
      manifest.recommendationPool,
    )
      ? manifest.recommendationPool
      : [];

  if (
    legacyPool.length >= 5 &&
    legacyPool.length <= 15
  ) {
    return legacyPool;
  }

  return manifest.products.map(
    (product) => ({
      dbProductId:
        product.dbProductId,
      originProductNo:
        product.originProductNo,
      productName:
        product.productName,
    }),
  );
}

export function recommendationPoolIds(
  manifest: SelectedFiveManifest,
) {
  return recommendationPoolProducts(
    manifest,
  ).map(
    (product) =>
      product.dbProductId,
  );
}

/*
 * Temporary compatibility aliases.
 * They no longer mean "top five".
 */
export function selectedFiveIds(
  manifest: SelectedFiveManifest,
) {
  return recommendationPoolIds(
    manifest,
  );
}

export function assertSameRecommendationPoolIds(
  ids: readonly string[] | undefined,
  manifest: SelectedFiveManifest,
) {
  if (
    !ids ||
    canonical(ids) !==
      canonical(
        recommendationPoolIds(
          manifest,
        ),
      )
  ) {
    throw new Error(
      "Approved Recommendation Pool IDs do not match the request.",
    );
  }
}

export function assertSameSelectedIds(
  ids: readonly string[] | undefined,
  manifest: SelectedFiveManifest,
) {
  assertSameRecommendationPoolIds(
    ids,
    manifest,
  );
}

export function publishSelectedFive(
  storage: Store,
  manifest: SelectedFiveManifest,
) {
  assertSelectionRun(
    storage,
    manifest,
  );

  validateSelectedFive(
    manifest,
    manifest,
  );

  storage.setItem(
    SELECTED_FIVE_KEY,
    JSON.stringify(manifest),
  );
}

export async function fetchCategoryProfile(category: string): Promise<Record<string, unknown>> {
  const response = await fetch("/api/category-profile?category=" + encodeURIComponent(category), { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || data.success !== true || data.profile?.category !== category) throw new Error(data.message ?? "프로필을 확인하지 못했습니다.");
  categoryProfileRevision(data.profile);
  return data.profile;
}
export type PublishedSelectedFive = {
  manifest: SelectedFiveManifest;
  profile: Record<string, unknown>;
};

function selectionRunFromManifest(
  value: unknown,
): SelectionRun {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("공개된 최종 5개 manifest 형식이 올바르지 않습니다.");
  }

  const row =
    value as Record<
      string,
      unknown
    >;

  return {
    runId:
      typeof row.runId === "string"
        ? row.runId
        : "",
    category:
      typeof row.category === "string"
        ? row.category
        : "",
  };
}

export async function fetchPublishedSelectedFive(
  category: string,
): Promise<PublishedSelectedFive> {
  const response =
    await fetch(
      "/api/selected-five-manifest?category=" +
        encodeURIComponent(
          category,
        ),
      {
        cache: "no-store",
      },
    );

  const data =
    (await response.json()) as {
      success?: unknown;
      message?: unknown;
      manifest?: unknown;
      profile?: unknown;
    };

  if (
    !response.ok ||
    data.success !== true
  ) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : "공개된 최종 5개를 불러오지 못했습니다.",
    );
  }

  const manifest =
    validateSelectedFive(
      data.manifest,
      selectionRunFromManifest(
        data.manifest,
      ),
    );

  if (
    normalizeCategoryKey(
      manifest.category,
    ) !==
    normalizeCategoryKey(
      category,
    )
  ) {
    throw new Error(
      "공개된 최종 5개의 카테고리가 요청과 일치하지 않습니다.",
    );
  }

  if (
    !data.profile ||
    typeof data.profile !== "object" ||
    Array.isArray(
      data.profile,
    )
  ) {
    throw new Error(
      "공개된 카테고리 프로필 형식이 올바르지 않습니다.",
    );
  }

  const profile =
    data.profile as Record<
      string,
      unknown
    >;

  if (
    categoryProfileRevision(
      profile,
    ) !==
    manifest.profileRevision
  ) {
    throw new Error(
      "공개된 최종 5개의 프로필 revision이 현재 프로필과 다릅니다.",
    );
  }

  return {
    manifest,
    profile,
  };
}

export async function persistPublishedSelectedFive(
  manifest: SelectedFiveManifest,
): Promise<SelectedFiveManifest> {
  validateSelectedFive(
    manifest,
    manifest,
  );

  const response =
    await fetch(
      "/api/selected-five-manifest",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          manifest,
        }),
      },
    );

  const data =
    (await response.json()) as {
      success?: unknown;
      message?: unknown;
      manifest?: unknown;
    };

  if (
    !response.ok ||
    data.success !== true
  ) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : "최종 5개 공개 저장에 실패했습니다.",
    );
  }

  const saved =
    validateSelectedFive(
      data.manifest,
      selectionRunFromManifest(
        data.manifest,
      ),
    );

  if (
    selectedFiveIdentity(
      saved,
    ) !==
    selectedFiveIdentity(
      manifest,
    )
  ) {
    throw new Error(
      "서버에 저장된 최종 5개 manifest가 발행한 내용과 정확히 일치하지 않습니다.",
    );
  }

  return saved;
}
export type SelectedCatalogProduct = {
  id: string; originProductNo: number; category: string; productName: string;
  sourceUrl: string; price: string; representativeImageUrl: string; analyzed: boolean;
};
export async function loadSelectedFiveContext(
  storage: Store,
  category?: string,
  expectedIdentity?: string,
) {
  let manifest:
    SelectedFiveManifest | null =
      null;

  let publishedProfile:
    Record<string, unknown> | null =
      null;

  try {
    manifest =
      readSelectedFive(
        storage,
        category,
      );
  } catch (localError) {
    if (!category) {
      throw localError;
    }
  }

  if (category) {
    let published:
      PublishedSelectedFive | null =
        null;

    try {
      published =
        await fetchPublishedSelectedFive(
          category,
        );
    } catch (publishedError) {
      if (!manifest) {
        throw publishedError;
      }
    }

    if (published) {
      publishedProfile =
        published.profile;

      if (
        !manifest ||
        selectedFiveIdentity(
          manifest,
        ) !==
          selectedFiveIdentity(
            published.manifest,
          )
      ) {
        storage.setItem(
          CURRENT_RUN_KEY,
          JSON.stringify({
            runId:
              published.manifest.runId,
            category:
              published.manifest.category,
          }),
        );

        storage.setItem(
          SELECTED_FIVE_KEY,
          JSON.stringify(
            published.manifest,
          ),
        );

        manifest =
          readSelectedFive(
            storage,
            published.manifest.category,
          );
      }
    }
  }

  if (!manifest) {
    throw new Error(
      "No current Recommendation Pool exists.",
    );
  }

  const identity =
    selectedFiveIdentity(
      manifest,
    );

  if (
    expectedIdentity !== undefined &&
    identity !== expectedIdentity
  ) {
    throw new Error(
      "Recommendation Pool changed. Start again.",
    );
  }

  const profile =
    publishedProfile ??
    await fetchCategoryProfile(
      manifest.category,
    );

  validateSelectedFive(
    manifest,
    manifest,
    categoryProfileRevision(
      profile,
    ),
  );

  const poolProducts =
    recommendationPoolProducts(
      manifest,
    );

  const params =
    new URLSearchParams({
      category:
        manifest.category,
      analyzedOnly:
        "true",
      productIds:
        poolProducts
          .map(
            (product) =>
              product.dbProductId,
          )
          .join(","),
    });

  const response =
    await fetch(
      "/api/catalog-products?" +
        params,
      {
        cache:
          "no-store",
      },
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    data.success !== true ||
    !Array.isArray(
      data.products,
    ) ||
    data.products.length !==
      poolProducts.length
  ) {
    throw new Error(
      data.message ??
      "Recommendation Pool products could not be verified.",
    );
  }

  const rows =
    data.products as
      SelectedCatalogProduct[];

  const products =
    poolProducts.map(
      (product) => {
        const matches =
          rows.filter(
            (row) =>
              row.id ===
              product.dbProductId,
          );

        if (
          matches.length !== 1 ||
          matches[0].category !==
            manifest.category ||
          matches[0].originProductNo !==
            product.originProductNo ||
          matches[0].productName !==
            product.productName ||
          matches[0].analyzed !== true
        ) {
          throw new Error(
            "Recommendation Pool DB identity or analysis state changed.",
          );
        }

        return matches[0];
      },
    );

  if (
    selectedFiveIdentity(
      readSelectedFive(
        storage,
        manifest.category,
      ),
    ) !== identity
  ) {
    throw new Error(
      "Recommendation Pool changed during verification.",
    );
  }

  return {
    manifest,
    identity,
    profile,
    products,
  };
}
