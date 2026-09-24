import { NextResponse } from "next/server";

import {
  categoryProfileRevision,
  normalizeCategoryKey,
  validateSelectedFive,
  type SelectedFiveManifest,
  type SelectionRun,
} from "../../../lib/project-d-selected-five-manifest";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function runFromManifest(value: unknown): SelectionRun {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("Selected-five manifest must be an object.");
  }

  const row = value as Record<string, unknown>;

  return {
    runId:
      typeof row.runId === "string"
        ? row.runId
        : "",
    category:
      typeof row.category === "string"
        ? row.category
        : "",
  };
}

function validatedManifest(
  value: unknown,
): SelectedFiveManifest {
  const run = runFromManifest(value);
  return validateSelectedFive(
    value,
    run,
  );
}

async function assertCurrentProfileRevision(
  manifest: SelectedFiveManifest,
) {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("category_profiles")
    .select(
      "id, category, title, introduction, criteria, personalization_questions, use_cases, candidate_limit, updated_at",
    )
    .eq(
      "category",
      manifest.category,
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      "The category profile no longer exists.",
    );
  }

  const currentRevision =
    categoryProfileRevision(data);

  if (
    currentRevision !==
    manifest.profileRevision
  ) {
    throw new Error(
      "The published selected-five manifest is stale because the category profile changed.",
    );
  }

  return data;
}

export async function GET(
  request: Request,
) {
  try {
    const {
      searchParams,
    } = new URL(request.url);

    const requestedCategory =
      (
        searchParams.get(
          "category",
        ) ?? ""
      ).trim();

    if (!requestedCategory) {
      const {
        data: publications,
        error: publicationsError,
      } = await supabaseAdmin
        .from(
          "project_d_selected_five_publications",
        )
        .select(
          "category",
        );

      if (publicationsError) {
        throw publicationsError;
      }

      const categories = [
        ...new Set(
          (publications ?? [])
            .map((row) =>
              typeof row.category === "string"
                ? row.category.trim()
                : "",
            )
            .filter(Boolean),
        ),
      ].sort((left, right) =>
        left.localeCompare(right, "ko"),
      );

      return NextResponse.json({
        success: true,
        categories,
      });
    }

    const categoryKey =
      normalizeCategoryKey(
        requestedCategory,
      );

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "project_d_selected_five_publications",
      )
      .select(
        "manifest",
      )
      .eq(
        "category_key",
        categoryKey,
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No published selected-five manifest exists for this category yet.",
        },
        {
          status: 404,
        },
      );
    }

    const manifest =
      validatedManifest(
        data.manifest,
      );

    if (
      normalizeCategoryKey(
        manifest.category,
      ) !== categoryKey
    ) {
      throw new Error(
        "Published category identity is inconsistent.",
      );
    }

    const profile =
      await assertCurrentProfileRevision(
        manifest,
      );

    return NextResponse.json({
      success: true,
      manifest,
      profile,
    });
  } catch (error) {
    console.error(
      "Selected-five publication GET error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not load the published selected-five manifest.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    /*
      Temporary safety boundary:
      publishing is enabled only in local development
      until Project D admin authentication is added.
      Public GET remains available.
    */
    if (
      process.env.NODE_ENV ===
      "production"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Selected-five publishing is disabled in production until admin authentication is added.",
        },
        {
          status: 403,
        },
      );
    }

    const body =
      (await request.json()) as {
        manifest?: unknown;
      };

    const manifest =
      validatedManifest(
        body.manifest,
      );

    await assertCurrentProfileRevision(
      manifest,
    );

    const categoryKey =
      normalizeCategoryKey(
        manifest.category,
      );

    const now =
      new Date().toISOString();

    const {
      error,
    } = await supabaseAdmin
      .from(
        "project_d_selected_five_publications",
      )
      .upsert(
        {
          category_key:
            categoryKey,
          category:
            manifest.category,
          manifest,
          updated_at:
            now,
        },
        {
          onConflict:
            "category_key",
        },
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      manifest,
    });
  } catch (error) {
    console.error(
      "Selected-five publication POST error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not publish the selected-five manifest.",
      },
      {
        status: 500,
      },
    );
  }
}
