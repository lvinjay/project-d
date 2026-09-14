import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/**
 * Retired legacy endpoint.
 *
 * This route previously persisted review_analysis and review_raw_data
 * together using ambiguous product identity resolution.
 *
 * Production review persistence is now deliberately split:
 * - /api/save-review-analysis-only
 * - /api/save-review-raw-batch
 *
 * The raw-corpus endpoint requires exact product identity and the
 * production analysis fingerprint. This legacy combined writer must
 * never regain a DB write path.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      retired: true,
      dbWrites: 0,
      message:
        "Legacy combined review persistence is retired. Use the exact-identity analysis and raw-corpus persistence endpoints.",
      replacementEndpoints: [
        "/api/save-review-analysis-only",
        "/api/save-review-raw-batch",
      ],
    },
    {
      status: 410,
    },
  );
}
