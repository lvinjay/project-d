import {
  CanonicalProductSource,
} from "./canonicalProductSource";

function normalizeUrl(
  value: unknown,
) {
  const text =
    String(value ?? "").trim();

  if (!text) {
    return "";
  }

  try {
    const url =
      new URL(text);

    url.hash = "";

    return url.toString();
  } catch {
    return "";
  }
}

function getHostname(
  value: unknown,
) {
  const normalized =
    normalizeUrl(value);

  if (!normalized) {
    return "";
  }

  try {
    return new URL(
      normalized,
    ).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isLikelyManufacturerOfficialUrl(
  url: string,
  officialSite: string,
) {
  const urlHost =
    getHostname(url);

  const officialHost =
    getHostname(
      officialSite,
    );

  if (
    !urlHost ||
    !officialHost
  ) {
    return false;
  }

  return (
    urlHost ===
      officialHost ||
    urlHost.endsWith(
      `.${officialHost}`,
    )
  );
}

export function createManufacturerCanonicalSource(
  input: {
    url: string;
    officialSite: string;
    brandName?: string;
    title?: string;
  },
): CanonicalProductSource | null {
  const canonicalUrl =
    normalizeUrl(
      input.url,
    );

  const officialSite =
    normalizeUrl(
      input.officialSite,
    );

  if (
    !canonicalUrl ||
    !officialSite
  ) {
    return null;
  }

  if (
    !isLikelyManufacturerOfficialUrl(
      canonicalUrl,
      officialSite,
    )
  ) {
    return null;
  }

  return {
    sourceType:
      "manufacturer",

    canonicalUrl,

    officialSite,

    brandName:
      input.brandName ??
      "",

    title:
      input.title ??
      "",
  };
}
