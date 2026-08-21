import {
  createManufacturerCanonicalSource,
} from "./manufacturerCanonicalSource";

type SearchResultLike = {
  link?: string;
  url?: string;
  title?: string;
};

export function extractManufacturerCanonicalCandidates(
  input: {
    results: SearchResultLike[];
    officialSite: string;
    brandName?: string;
  },
) {
  const found =
    new Map<
      string,
      ReturnType<
        typeof createManufacturerCanonicalSource
      >
    >();

  for (
    const result of
    input.results ?? []
  ) {
    const url =
      String(
        result.link ??
        result.url ??
        "",
      ).trim();

    if (!url) {
      continue;
    }

    const source =
      createManufacturerCanonicalSource({
        url,
        officialSite:
          input.officialSite,
        brandName:
          input.brandName,
        title:
          String(
            result.title ??
            "",
          ),
      });

    if (!source) {
      continue;
    }

    if (
      !found.has(
        source.canonicalUrl,
      )
    ) {
      found.set(
        source.canonicalUrl,
        source,
      );
    }
  }

  return [
    ...found.values(),
  ].filter(Boolean);
}
