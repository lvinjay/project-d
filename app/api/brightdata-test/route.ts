import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATASET_ID =
  "gd_m9qqjxxr1hab7okefj";

const CATEGORY_URL =
  "https://search.shopping.naver.com/ns/category/10007182";

function sleep(ms: number) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms),
  );
}

export async function GET() {
  try {
    const apiKey =
      process.env.BRIGHTDATA_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            "BRIGHTDATA_API_KEY가 설정되지 않았습니다.",
        },
        {
          status: 500,
        },
      );
    }

    const triggerUrl =
      new URL(
        "https://api.brightdata.com/datasets/v3/trigger",
      );

    triggerUrl.searchParams.set(
      "dataset_id",
      DATASET_ID,
    );

    triggerUrl.searchParams.set(
      "include_errors",
      "true",
    );

    triggerUrl.searchParams.set(
      "type",
      "discover_new",
    );

    triggerUrl.searchParams.set(
      "discover_by",
      "category",
    );

    triggerUrl.searchParams.set(
      "limit_per_input",
      "10",
    );

    const triggerResponse =
      await fetch(
        triggerUrl.toString(),
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify([
            {
              url: CATEGORY_URL,
            },
          ]),
          cache: "no-store",
        },
      );

    const triggerText =
      await triggerResponse.text();

    if (!triggerResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          stage: "trigger",
          status:
            triggerResponse.status,
          response:
            triggerText,
        },
        {
          status: 500,
        },
      );
    }

    const trigger =
      JSON.parse(
        triggerText,
      ) as {
        snapshot_id?: string;
      };

    const snapshotId =
      trigger.snapshot_id;

    if (!snapshotId) {
      return NextResponse.json(
        {
          success: false,
          stage:
            "snapshot_id",
          response:
            trigger,
        },
        {
          status: 500,
        },
      );
    }

    for (
      let attempt = 1;
      attempt <= 30;
      attempt++
    ) {
      const progressResponse =
        await fetch(
          `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
          {
            headers: {
              Authorization:
                `Bearer ${apiKey}`,
            },
            cache:
              "no-store",
          },
        );

      const progress =
        (await progressResponse.json()) as {
          status?: string;
          [key: string]:
            unknown;
        };

      if (
        progress.status ===
        "ready"
      ) {
        const resultResponse =
          await fetch(
            `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
            {
              headers: {
                Authorization:
                  `Bearer ${apiKey}`,
              },
              cache:
                "no-store",
            },
          );

        const result =
          await resultResponse.json();

        return NextResponse.json({
          success: true,
          snapshotId,
          result,
        });
      }

      if (
        progress.status ===
        "failed"
      ) {
        return NextResponse.json(
          {
            success: false,
            stage:
              "collection",
            snapshotId,
            progress,
          },
          {
            status: 500,
          },
        );
      }

      await sleep(5000);
    }

    return NextResponse.json(
      {
        success: false,
        stage:
          "timeout",
        snapshotId,
        message:
          "150초 안에 수집이 완료되지 않았습니다.",
      },
      {
        status: 504,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Bright Data 테스트 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}
