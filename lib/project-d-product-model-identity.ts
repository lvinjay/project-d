type ModelDetail = { brand?: string; manufacturer?: string; modelName?: string; productName?: string };
const normalize = (value: string | undefined) => (value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

// Listing IDs are not model IDs. Missing evidence never proves equivalence.
export function strictProductModelIdentity(detail: ModelDetail): string | null {
  const brand = normalize(detail.brand);
  const manufacturer = normalize(detail.manufacturer);
  const model = normalize(detail.modelName);
  const title = normalize(detail.productName);
  if ((!brand && !manufacturer) || !model || !title) return null;
  const tokens = (value: string) => [...new Set(value.match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/g) || [])]
    .filter(token => /[a-z]/.test(token) && /\d/.test(token)).sort();
  const modelTokens = tokens(model), titleTokens = tokens(title);
  if (!modelTokens.length || modelTokens.join("|") !== titleTokens.join("|")) return null;
  const text = `${model} ${title}`;
  const variants = [...new Set(text.match(/\b(?:pro|plus|mini|max|ultra|lite|air|se|fe|slim|master)\b/g) || [])].sort();
  // Preserve every numeric designation, including capacity and generation. Extra
  // marketing numbers can prevent a merge, but can never merge distinct variants.
  const numbers = [...new Set(text.match(/\d+(?:\.\d+)?\s*(?:세대|gen|gb|tb|ml|kg|kw|w|v|l|평|㎡)?/g) || [])]
    .map(value => value.replace(/\s/g, "")).sort();
  return JSON.stringify([brand, manufacturer, model, modelTokens, variants, numbers]);
}

type ModelCandidate = { detail: ModelDetail & { reviewCount?: number }; market: { priceVerified?: boolean }; canonicalSource: { url: string } };
export function preferModelRepresentative(a: ModelCandidate, b: ModelCandidate): boolean {
  const verified = Number(a.market.priceVerified === true) - Number(b.market.priceVerified === true);
  if (verified) return verified > 0;
  const reviews = (a.detail.reviewCount || 0) - (b.detail.reviewCount || 0);
  if (reviews) return reviews > 0;
  return a.canonicalSource.url < b.canonicalSource.url;
}
