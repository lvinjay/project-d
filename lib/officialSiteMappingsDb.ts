import {
  supabaseAdmin,
} from "./supabaseAdmin";

import {
  normalizeBrandKey,
  normalizeOfficialSite,
} from "./officialSiteMappings";

export type StoredOfficialSiteMapping = {
  brandKey: string;
  brandName: string;
  officialSite: string;
  source: string;
  confidence: number;
};

type OfficialSiteRow = {
  brand_key?: string;
  brand_name?: string;
  official_site?: string;
  source?: string;
  confidence?: number;
};

function rowToMapping(
  row: OfficialSiteRow,
): StoredOfficialSiteMapping | null {
  const officialSite =
    normalizeOfficialSite(
      row.official_site,
    );

  if (!officialSite) {
    return null;
  }

  return {
    brandKey:
      String(
        row.brand_key ?? "",
      ),

    brandName:
      String(
        row.brand_name ?? "",
      ),

    officialSite,

    source:
      String(
        row.source ?? "",
      ),

    confidence:
      Number(
        row.confidence ?? 0,
      ),
  };
}

export async function findOfficialSiteMapping(
  brandCandidates: string[],
): Promise<StoredOfficialSiteMapping | null> {
  const keys =
    [
      ...new Set(
        brandCandidates
          .map(
            normalizeBrandKey,
          )
          .filter(Boolean),
      ),
    ];

  if (keys.length === 0) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "official_site_mappings",
      )
      .select(
        "brand_key, brand_name, official_site, source, confidence",
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
      .limit(1);

  if (error) {
    /*
      아직 테이블 생성 전이거나 DB 조회에 실패해도
      Resolver 전체를 죽이지 않는다.
    */
    console.warn(
      "Official site mapping lookup warning:",
      error.message,
    );

    return null;
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : null;

  return row
    ? rowToMapping(row)
    : null;
}

export async function saveOfficialSiteMapping(
  brandCandidates: string[],
  officialSite: string,
  options?: {
    brandName?: string;
    source?: string;
    confidence?: number;
  },
) {
  const normalizedSite =
    normalizeOfficialSite(
      officialSite,
    );

  if (!normalizedSite) {
    return;
  }

  const keys =
    [
      ...new Set(
        brandCandidates
          .map(
            normalizeBrandKey,
          )
          .filter(Boolean),
      ),
    ];

  if (keys.length === 0) {
    return;
  }

  const brandName =
    String(
      options?.brandName ??
      brandCandidates[0] ??
      "",
    ).trim();

  const source =
    String(
      options?.source ??
      "search",
    );

  const confidence =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          options?.confidence ??
          80,
        ),
      ),
    );

  const rows =
    keys.map(
      (brandKey) => ({
        brand_key:
          brandKey,

        brand_name:
          brandName,

        official_site:
          normalizedSite,

        source,

        confidence,

        updated_at:
          new Date()
            .toISOString(),
      }),
    );

  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "official_site_mappings",
      )
      .upsert(
        rows,
        {
          onConflict:
            "brand_key",
        },
      );

  if (error) {
    console.warn(
      "Official site mapping save warning:",
      error.message,
    );
  }
}
