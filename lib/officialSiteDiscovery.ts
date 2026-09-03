import { findOfficialSiteMapping, saveOfficialSiteMapping } from "./officialSiteMappingsDb";

type GoogleOrganicResult = { title?: string; link?: string; snippet?: string };
type GoogleResponse = { organic_results?: GoogleOrganicResult[]; error?: string };

export type OfficialSiteDiscoveryResult = {
  success: boolean;
  officialSite: string;
  brandName: string;
  source: "db" | "search" | "none";
  confidence: number;
  query?: string;
};

const BLOCKED = [
  "naver.com","coupang.com","11st.co.kr","gmarket.co.kr","auction.co.kr",
  "ssg.com","lotteon.com","danawa.com","enuri.com","youtube.com",
  "instagram.com","facebook.com","tiktok.com","wikipedia.org",
];

const text = (v: unknown) => String(v ?? "").trim().toLowerCase();
const compact = (v: unknown) =>
  text(v)
    .replace(/(공식몰|공식스토어|공식점|브랜드스토어|스토어|store|official)/gi, " ")
    .replace(/[^a-z0-9가-힣]+/gi, "");

function rootSite(value: unknown) {
  try {
    const u = new URL(String(value ?? "").trim());
    if (!/^https?:$/.test(u.protocol)) return "";
    u.hash = ""; u.search = ""; u.pathname = "/";
    return u.toString().replace(/\/+$/, "");
  } catch { return ""; }
}

function hostOf(site: string) {
  try { return new URL(site).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function blocked(host: string) {
  return BLOCKED.some((x) => host === x || host.endsWith("." + x));
}

function brandTokens(values: string[]) {
  return [...new Set(
    values.flatMap((v) => text(v).split(/\s+/).map(compact))
      .filter((v) => v.length >= 2),
  )].slice(0, 8);
}

function score(result: GoogleOrganicResult, tokens: string[]) {
  const site = rootSite(result.link);
  const host = hostOf(site);
  if (!site || !host || blocked(host)) return null;

  const h = compact(host);
  const title = compact(result.title);
  const snippet = compact(result.snippet);
  let points = 0;

  for (const token of tokens) {
    if (h.includes(token)) points += 60;
    if (title.includes(token)) points += 25;
    if (snippet.includes(token)) points += 10;
  }

  if (/(공식|official|manufacturer|브랜드)/i.test(
    `${result.title ?? ""} ${result.snippet ?? ""}`,
  )) points += 20;

  return points >= 35 ? { site, points } : null;
}

async function google(query: string): Promise<GoogleResponse> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("SERPAPI_API_KEY가 설정되지 않았습니다.");

  const params = new URLSearchParams({
    engine: "google", q: query, hl: "ko", gl: "kr", api_key: apiKey,
  });

  const response = await fetch(
    "https://serpapi.com/search?" + params.toString(),
    { cache: "no-store" },
  );
  const data = (await response.json()) as GoogleResponse;

  if (!response.ok || data.error) {
    throw new Error(data.error ?? `SerpApi Google 검색 실패 (${response.status})`);
  }
  return data;
}

export async function discoverOfficialSite(
  brandCandidates: string[],
  _productName = "",
): Promise<OfficialSiteDiscoveryResult> {
  const brands = [...new Set(
    brandCandidates.map((v) => String(v ?? "").trim()).filter(Boolean),
  )];

  if (!brands.length) {
    return { success: false, officialSite: "", brandName: "", source: "none", confidence: 0 };
  }

  // Learned mapping first: zero external-search cost.
  const learned = await findOfficialSiteMapping(brands);
  if (learned?.officialSite) {
    return {
      success: true,
      officialSite: learned.officialSite,
      brandName: learned.brandName || brands[0],
      source: "db",
      confidence: learned.confidence,
    };
  }

  // Only an unknown brand spends one Google SerpApi call.
  const primaryBrand = brands[0];
  const query = `"${primaryBrand}" 공식 홈페이지`;
  const data = await google(query);
  const tokens = brandTokens(brands);

  const ranked = (data.organic_results ?? [])
    .map((result) => ({ result, scored: score(result, tokens) }))
    .filter((x): x is { result: GoogleOrganicResult; scored: { site: string; points: number } } =>
      Boolean(x.scored))
    .sort((a, b) => b.scored.points - a.scored.points);

  const best = ranked[0];
  if (!best) {
    return { success: false, officialSite: "", brandName: primaryBrand, source: "none", confidence: 0, query };
  }

  const host = compact(hostOf(best.scored.site));
  const hostMatch = tokens.some((token) => host.includes(token));
  const confidence = Math.min(
    95,
    hostMatch ? Math.max(90, best.scored.points) : Math.max(75, Math.min(89, best.scored.points)),
  );

  // Do not persist weak guesses.
  if (confidence < 80) {
    return { success: false, officialSite: "", brandName: primaryBrand, source: "none", confidence, query };
  }

  await saveOfficialSiteMapping(brands, best.scored.site, {
    brandName: primaryBrand,
    source: "serpapi_google_official_site",
    confidence,
  });

  return {
    success: true,
    officialSite: best.scored.site,
    brandName: primaryBrand,
    source: "search",
    confidence,
    query,
  };
}
