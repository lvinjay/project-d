import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type CapturedProduct = {
  name: string;
  text: string;
  seller: string;
  url: string;
  imageUrl: string;
  price: number;
  reviewCount: number;
  rating: number;
};

type CapturedReview = {
  rating: number;
  date: string;
  text: string;
  helpfulCount: number;
};

type BrowserReviewCapture = {
  browserReviews: CapturedReview[];
  browserReviewSourceUrl: string;
  browserReviewTotalCount: number;
  browserSpecs: Record<string, string>;
  browserCatalogTitle: string;
  browserEvidenceSourceType: string;
  browserProductTitle: string;
  browserProductUrl: string;
  browserChannelProductNo: string;
  browserOriginProductNo: string;
};

type CaptureDiagnostics = {
  captureCounts?: { receivedCount: number; normalizedCount: number };
  collectorDiagnostics?: Record<string, number | string | boolean | undefined>;
  observedProductCardCount?: number;
  priceEvidenceDiagnostics?: { rejectedCount: number; samples: Array<{
    name: string; reason: string; detectedAmounts: number[]; snippet: string; cardType: string;
  }> };
  probeFailureCount?: number;
  deadlineReached?: boolean;
  probeFailures?: Array<{ position?: number; index?: number; productName: string;
    reason: string; lastObservedUrl: string; stage: string }>;
};

function captureDiagnostics(value: unknown): CaptureDiagnostics | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const safeSnippet = (value: unknown, limit: number) => text(value)
    .replace(/\S*(?:https?:\/\/|www\.|\?|[&=])\S*/gi, " ").replace(/\s+/g, " ").trim().slice(0, limit);
  const price = row.priceEvidenceDiagnostics && typeof row.priceEvidenceDiagnostics === "object" && !Array.isArray(row.priceEvidenceDiagnostics)
    ? row.priceEvidenceDiagnostics as Record<string, unknown> : undefined;
  const allowedReasons = new Set(["no-money-token", "excluded-prefix", "excluded-tail", "no-sale-context", "multiple-sale-values", "ambiguous", "verified-sale-label", "verified-single-price"]);
  const collector = row.collectorDiagnostics && typeof row.collectorDiagnostics === "object" && !Array.isArray(row.collectorDiagnostics)
    ? row.collectorDiagnostics as Record<string, unknown> : undefined;
  const collectorCounts = collector ? Object.fromEntries([
    "rawCardCount", "cardWithNameCount", "cardWithPositivePriceCount", "cardWithUrlCount",
    "initialEligibleCardCount", "duplicateByNameCount", "duplicateByModelKeyCount",
    "finalCapturedCount", "scrollLoopCount",
    "targetCount", "maxScrollLoops", "actualScrollLoops", "minimumScrollLoops", "noGrowthThreshold",
    "maxCaptureMs", "elapsedCaptureMs", "lastRawCardGrowthLoop", "lastFinalCandidateGrowthLoop",
    "consecutiveNoGrowthAtStop", "rawGrowthCount",
  ].map(key => [key, count(collector[key])])) : undefined;
  return {
    collectorDiagnostics: collector ? { ...collectorCounts,
      stopReason: ["max-scroll-steps", "target-count", "stable-after-minimum", "target-reached", "market-saturated", "max-scroll", "timeout"].includes(String(collector.stopReason))
        ? String(collector.stopReason) : "unknown",
      saturationDetected: typeof collector.saturationDetected === "boolean" ? collector.saturationDetected : undefined } : undefined,
    observedProductCardCount: count(row.observedProductCardCount),
    priceEvidenceDiagnostics: price ? {
      rejectedCount: count(price.rejectedCount) ?? 0,
      samples: Array.isArray(price.samples) ? price.samples.slice(0, 20).flatMap(item => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const sample = item as Record<string, unknown>;
        return [{ name: safeSnippet(sample.name, 160),
          reason: allowedReasons.has(String(sample.reason)) ? String(sample.reason) : "ambiguous",
          detectedAmounts: Array.isArray(sample.detectedAmounts) ? sample.detectedAmounts.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0).slice(0, 10) : [],
          snippet: safeSnippet(sample.snippet, 250), cardType: sample.cardType === "ad" ? "ad" : sample.cardType === "normal" ? "normal" : "unknown" }];
      }) : [],
    } : undefined,
    probeFailureCount: count(row.probeFailureCount),
    deadlineReached: typeof row.deadlineReached === "boolean" ? row.deadlineReached : undefined,
    probeFailures: Array.isArray(row.probeFailures) ? row.probeFailures.flatMap(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const failure = item as Record<string, unknown>;
      return [{ position: count(failure.position), index: count(failure.index),
        productName: text(failure.productName) || text(failure.name),
        reason: text(failure.reason), lastObservedUrl: text(failure.lastObservedUrl) || text(failure.finalUrl),
        stage: text(failure.stage) }];
    }) : undefined,
  };
}

type CaptureData = {
  category: string;
  minBudget: number;
  maxBudget: number;
  products: CapturedProduct[];
  createdAt: number;
};

type IncomingProduct = {
  name?: unknown;
  text?: unknown;
  seller?: unknown;
  url?: unknown;
  imageUrl?: unknown;
  price?: unknown;
  priceVerified?: unknown;
  priceSource?: unknown;
  priceRawText?: unknown;
  reviewCount?: unknown;
  rating?: unknown;
  browserReviews?: unknown;
  browserReviewSourceUrl?: unknown;
  browserReviewTotalCount?: unknown;
  browserSpecs?: unknown;
  browserCatalogTitle?: unknown;
  browserEvidenceSourceType?: unknown;
  browserProductTitle?: unknown;
  browserProductUrl?: unknown;
  browserChannelProductNo?: unknown;
  browserOriginProductNo?: unknown;
};

declare global {
  var projectDNaverCaptureDiagnostics: Map<string, CaptureDiagnostics> | undefined;
  var projectDNaverCaptures:
    Map<string, CaptureData>
    | undefined;

  var projectDNaverBrowserReviewCaptures:
    Map<string, BrowserReviewCapture[]>
    | undefined;
}

function getDiagnosticsStore() {
  return globalThis.projectDNaverCaptureDiagnostics ??= new Map<string, CaptureDiagnostics>();
}

function getStore() {
  if (
    !globalThis.projectDNaverCaptures
  ) {
    globalThis.projectDNaverCaptures =
      new Map();
  }

  return globalThis
    .projectDNaverCaptures;
}

function getBrowserReviewStore() {
  if (
    !globalThis
      .projectDNaverBrowserReviewCaptures
  ) {
    globalThis
      .projectDNaverBrowserReviewCaptures =
      new Map();
  }

  return globalThis
    .projectDNaverBrowserReviewCaptures;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":
      "*",
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type",
  };
}

function text(
  value: unknown,
) {
  return String(
    value ?? "",
  )
    .replace(/\s+/g, " ")
    .trim();
}

function number(
  value: unknown,
) {
  const result =
    Number(value ?? 0);

  return Number.isFinite(
    result,
  )
    ? result
    : 0;
}

function reviewList(
  value: unknown,
): CapturedReview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const reviews:
    CapturedReview[] = [];

  const seen =
    new Set<string>();

  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const raw =
      item as Record<
        string,
        unknown
      >;

    const reviewText =
      text(
        raw.text ??
        raw.reviewContent,
      );

    if (!reviewText) {
      continue;
    }

    const rating =
      number(
        raw.rating ??
        raw.score ??
        raw.reviewScore,
      );

    const date =
      text(
        raw.date ??
        raw.createDate ??
        raw.reviewDate,
      );

    const helpfulCount =
      number(
        raw.helpfulCount,
      );

    const key =
      `${rating}|${date}|${reviewText.slice(
        0,
        1000,
      )}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    reviews.push({
      rating,
      date,
      text: reviewText,
      helpfulCount,
    });

    if (reviews.length >= 20) {
      break;
    }
  }

  return reviews;
}

function specMap(
  value: unknown,
): Record<string, string> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  const result:
    Record<string, string> = {};

  for (
    const [rawKey, rawValue]
    of Object.entries(
      value as Record<string, unknown>,
    )
  ) {
    const key = text(rawKey);
    const specValue = text(rawValue);

    if (!key || !specValue) {
      continue;
    }

    result[key] = specValue;
  }

  return result;
}

export async function OPTIONS() {
  return new Response(
    null,
    {
      status: 204,
      headers:
        corsHeaders(),
    },
  );
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json();

    const incoming =
      Array.isArray(
        body.products,
      )
        ? body.products
        : [];

    const products:
      CapturedProduct[] =
      incoming
        .slice(0, 100)
        .map(
          (
            raw:
              IncomingProduct,
          ) => ({
            name:
              text(
                raw.name,
              ),

            text:
              text(
                raw.text,
              ),

            seller:
              text(
                raw.seller,
              ),

            url:
              text(
                raw.url,
              ),

            imageUrl:
              text(
                raw.imageUrl,
              ),

            priceVerified: typeof raw.priceVerified === "boolean" ? raw.priceVerified : undefined,
            priceSource: text(raw.priceSource).slice(0, 100),
            priceRawText: text(raw.priceRawText).slice(0, 300),
            price:
              number(
                raw.price,
              ),

            reviewCount:
              number(
                raw.reviewCount,
              ),

            rating:
              number(
                raw.rating,
              ),
          }),
        )
        .filter(
          (
            product:
              CapturedProduct,
          ) =>
            Boolean(
              product.name,
            ) &&
            Boolean(
              product.url,
            ) &&
            product.price >
              0,
        );

    if (
      products.length ===
      0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "수집 상품이 없습니다.",
        },
        {
          status: 400,
          headers:
            corsHeaders(),
        },
      );
    }

    const browserReviewEntries:
      BrowserReviewCapture[] =
      products.map(
        (product) => {
          const source =
            incoming.find(
              (
                item:
                  IncomingProduct,
              ) =>
                text(item.name) ===
                  product.name &&
                text(item.url) ===
                  product.url,
            );

          return {
            browserReviews:
              reviewList(
                source
                  ?.browserReviews,
              ),

            browserReviewSourceUrl:
              text(
                source
                  ?.browserReviewSourceUrl,
              ),

            browserReviewTotalCount:
              number(
                source
                  ?.browserReviewTotalCount,
              ),

            browserSpecs:
              specMap(
                source?.browserSpecs,
              ),

            browserCatalogTitle:
              text(
                source?.browserCatalogTitle,
              ),

            browserEvidenceSourceType:
              text(
                source?.browserEvidenceSourceType,
              ),

            browserProductTitle:
              text(
                source?.browserProductTitle,
              ),

            browserProductUrl:
              text(
                source?.browserProductUrl,
              ),

            browserChannelProductNo:
              text(
                source?.browserChannelProductNo,
              ),

            browserOriginProductNo:
              text(
                source?.browserOriginProductNo,
              ),
          };
        },
      );

    const id =
      crypto.randomUUID();

    const diagnostics = { ...captureDiagnostics(body.diagnostics),
      captureCounts: { receivedCount: incoming.length, normalizedCount: products.length } };
    if (diagnostics) getDiagnosticsStore().set(id, diagnostics);

    getStore().set(
      id,
      {
        category:
          text(
            body.category,
          ),

        minBudget:
          number(
            body.minBudget,
          ),

        maxBudget:
          number(
            body.maxBudget,
          ),

        products,

        createdAt:
          Date.now(),
      },
    );

    getBrowserReviewStore().set(
      id,
      browserReviewEntries,
    );

    return NextResponse.json(
      {
        success: true,
        id,
        count:
          products.length,
      },
      {
        headers:
          corsHeaders(),
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "후보 저장 실패",
      },
      {
        status: 500,
        headers:
          corsHeaders(),
      },
    );
  }
}

export async function GET(
  request: Request,
) {
  const url =
    new URL(
      request.url,
    );

  const id =
    url.searchParams.get(
      "id",
    );

  if (!id) {
    return NextResponse.json(
      {
        success: false,
        message:
          "수집 ID가 없습니다.",
      },
      {
        status: 400,
      },
    );
  }

  const capture =
    getStore().get(id);

  if (!capture) {
    return NextResponse.json(
      {
        success: false,
        message:
          "수집 데이터를 찾을 수 없습니다.",
      },
      {
        status: 404,
      },
    );
  }

  const browserReviewEntries =
    getBrowserReviewStore()
      .get(id) ??
    [];

  const diagnostics = getDiagnosticsStore().get(id);
  return NextResponse.json({
    success: true,

    ...(diagnostics ? { diagnostics } : {}),
    category:
      capture.category,

    minBudget:
      capture.minBudget,

    maxBudget:
      capture.maxBudget,

    count:
      capture.products.length,
    captureCounts: getDiagnosticsStore().get(id)?.captureCounts,
    collectorDiagnostics: getDiagnosticsStore().get(id)?.collectorDiagnostics,

    products:
      capture.products.map(
        (product, index) => ({
          ...product,

          browserReviews:
            browserReviewEntries[
              index
            ]?.browserReviews ??
            [],

          browserReviewSourceUrl:
            browserReviewEntries[
              index
            ]?.browserReviewSourceUrl ??
            "",

          browserReviewTotalCount:
            browserReviewEntries[
              index
            ]?.browserReviewTotalCount ??
            0,

          browserSpecs:
            browserReviewEntries[
              index
            ]?.browserSpecs ??
            {},

          browserCatalogTitle:
            browserReviewEntries[
              index
            ]?.browserCatalogTitle ??
            "",

          browserEvidenceSourceType:
            browserReviewEntries[
              index
            ]?.browserEvidenceSourceType ??
            "",

          browserProductTitle:
            browserReviewEntries[
              index
            ]?.browserProductTitle ??
            "",

          browserProductUrl:
            browserReviewEntries[
              index
            ]?.browserProductUrl ??
            "",

          browserChannelProductNo:
            browserReviewEntries[
              index
            ]?.browserChannelProductNo ??
            "",

          browserOriginProductNo:
            browserReviewEntries[
              index
            ]?.browserOriginProductNo ??
            "",
        }),
      ),
  });
}
