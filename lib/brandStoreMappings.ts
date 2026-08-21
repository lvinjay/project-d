import {
  supabaseAdmin,
} from "./supabaseAdmin";

export type BrandStoreMapping = {
  brandKey: string;
  brandName: string;
  brandSlug: string;
  brandSite: string;
  source: string;
  confidence: number;
};

export function normalizeBrandKey(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9가-힣]+/g,
      "",
    )
    .trim();
}

export function extractBrandSlug(
  brandSite: string,
) {
  const match =
    brandSite.match(
      /https?:\/\/brand\.naver\.com\/([a-zA-Z0-9_-]+)/i,
    );

  return (
    match?.[1]?.toLowerCase() ??
    ""
  );
}

export async function findBrandStoreMapping(
  candidates: string[],
): Promise<BrandStoreMapping | null> {
  const keys =
    [
      ...new Set(
        candidates
          .map(
            (candidate) =>
              normalizeBrandKey(
                candidate,
              ),
          )
          .filter(Boolean),
      ),
    ];

  if (
    keys.length === 0
  ) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "brand_store_mappings",
      )
      .select(
        "brand_key, brand_name, brand_slug, brand_site, source, confidence",
      )
      .in(
        "brand_key",
        keys,
      )
      .order(
        "confidence",
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    brandKey:
      String(
        data.brand_key ??
          "",
      ),

    brandName:
      String(
        data.brand_name ??
          "",
      ),

    brandSlug:
      String(
        data.brand_slug ??
          "",
      ),

    brandSite:
      String(
        data.brand_site ??
          "",
      ),

    source:
      String(
        data.source ??
          "",
      ),

    confidence:
      Number(
        data.confidence ??
          0,
      ),
  };
}

export async function saveBrandStoreMapping(
  brandNames: string[],
  brandSite: string,
  options?: {
    source?: string;
    confidence?: number;
  },
) {
  const brandSlug =
    extractBrandSlug(
      brandSite,
    );

  if (!brandSlug) {
    return;
  }

  const names =
    [
      ...new Set(
        brandNames
          .map(
            (name) =>
              name.trim(),
          )
          .filter(Boolean),
      ),
    ];

  if (
    names.length === 0
  ) {
    return;
  }

  const source =
    options?.source ??
    "auto";

  const confidence =
    options?.confidence ??
    100;

  for (
    const brandName of
    names
  ) {
    const brandKey =
      normalizeBrandKey(
        brandName,
      );

    if (!brandKey) {
      continue;
    }

    const {
      error,
    } =
      await supabaseAdmin
        .from(
          "brand_store_mappings",
        )
        .upsert(
          {
            brand_key:
              brandKey,

            brand_name:
              brandName,

            brand_slug:
              brandSlug,

            brand_site:
              brandSite,

            source,

            confidence,

            updated_at:
              new Date()
                .toISOString(),
          },
          {
            onConflict:
              "brand_key",
          },
        );

    if (error) {
      throw error;
    }
  }
}
