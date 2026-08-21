export type OfficialSiteMapping = {
  brandKey: string;
  brandName: string;
  officialSite: string;
  source:
    | "manual"
    | "search"
    | "verified";
  confidence: number;
};

export function normalizeOfficialSite(
  value: unknown,
) {
  const text =
    String(value ?? "")
      .trim();

  if (!text) {
    return "";
  }

  try {
    const url =
      new URL(text);

    url.hash = "";
    url.search = "";
    url.pathname = "/";

    return url
      .toString()
      .replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function normalizeBrandKey(
  value: unknown,
) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}
