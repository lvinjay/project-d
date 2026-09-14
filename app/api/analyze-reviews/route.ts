import {
  createHash,
} from "node:crypto";

import OpenAI from "openai";
import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  supabase,
} from "../../../lib/supabase";

import {
  PRODUCTION_REVIEW_PIPELINE_VERSION, PRODUCTION_REVIEW_QUALITY_SOURCE,
  ProductionPipelineError, auditProductionReviewNumbering,
  createProductionBatchDryRun, runProductionReviewBatch,
  createProductionPipelineFingerprint, replayProductionReviewBatch,
  productionReviewPipelineVersionForCriteria,
  type SavedProductionStageArtifact,
} from "../../../lib/project-d-review-production-pipeline";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type ReviewCollectionStats = {
  total: number;
  ranking: number;
  latest: number;
  lowScore: number;
};

type ReviewAnalysisRequest = {
  productName?: string;
  category?: string;
  reviews?: string[];
  collectionStats?: unknown;
  originProductNo?: string | number;
  useStoredReviews?: boolean;
  dryRun?: boolean;
  executionMode?: string;
  batchIndex?: number;
  batchResults?: unknown;
  inputFingerprint?: string;
  rawModelAnalysis?: unknown; // Legacy request field retained but never used by production replay.
  replayArtifacts?: {
    stage0: SavedProductionStageArtifact;
    criteria: SavedProductionStageArtifact | null;
  };
};

type DynamicCriterion = {
  key?: string;
  label?: string;
  shortDescription?: string;
  helpText?: string;
  sourceType?: string;
};

type CriterionEvidence = {
  reviewEvidenceCount: number;
  evidenceReviewNumbers: number[];
  summary: string;
  positiveReviewNumbers?: number[];
  negativeReviewNumbers?: number[];
  mixedReviewNumbers?: number[];
  neutralReviewNumbers?: number[];
  evidenceExcerpts?: Array<{
    reviewNumber: number;
    polarity: "+" | "-" | "0";
    quote: string;
  }>;
};

function cleanText(
  value: unknown,
) {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function asRecord(
  value: unknown,
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  )
    ? value as
        Record<
          string,
          unknown
        >
    : null;
}

function getServiceSupabase() {
  const url =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.",
    );
  }

  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function extractJson(
  text: string,
) {
  const cleaned =
    text
      .replace(
        /^```json\s*/i,
        "",
      )
      .replace(
        /^```\s*/i,
        "",
      )
      .replace(
        /\s*```$/i,
        "",
      )
      .trim();

  return JSON.parse(
    cleaned,
  ) as Record<
    string,
    unknown
  >;
}

function normalizeScore(
  value: unknown,
) {
  if (value === null) {
    return null;
  }

  const numberValue =
    Number(value);

  if (
    !Number.isFinite(
      numberValue,
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        numberValue,
      ),
    ),
  );
}

function normalizeCollectionStats(
  value: unknown,
  fallbackTotal: number,
): ReviewCollectionStats {
  const row =
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
      ? (
          value as Record<
            string,
            unknown
          >
        )
      : {};

  const safeCount = (
    raw: unknown,
  ) => {
    const parsed =
      Number(raw);

    return (
      Number.isFinite(
        parsed,
      ) &&
      parsed >= 0
    )
      ? Math.floor(
          parsed,
        )
      : 0;
  };

  const ranking =
    safeCount(
      row.ranking,
    );

  const latest =
    safeCount(
      row.latest,
    );

  const lowScore =
    safeCount(
      row.lowScore,
    );

  const reportedTotal =
    safeCount(
      row.total,
    );

  return {
    total:
      reportedTotal > 0
        ? reportedTotal
        : fallbackTotal,

    ranking,
    latest,
    lowScore,
  };
}

function normalizeEvidenceReviewNumbers(
  raw: unknown,
  minimumReviewNumber: number,
  maximumReviewNumber: number,
) {
  if (
    !Array.isArray(
      raw,
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .map(
          (value) =>
            Number(value),
        )
        .filter(
          (value) =>
            Number.isSafeInteger(
              value,
            ) &&
            value >=
              minimumReviewNumber &&
            value <=
              maximumReviewNumber,
        ),
    ),
  ).sort(
    (left, right) =>
      left - right,
  );
}

function minimumCriterionEvidence(
  reviewCount: number,
) {
  return Math.max(
    3,
    Math.ceil(
      reviewCount *
        0.01,
    ),
  );
}

function collectCriterionEvidenceNumbers(
  batchResults:
    BatchAnalysisResult[],
  criterionKeys:
    string[],
) {
  const result:
    Record<
      string,
      number[]
    > = {};

  for (
    const key of
    criterionKeys
  ) {
    const numbers =
      new Set<number>();

    for (
      const batch of
      batchResults
    ) {
      const analysisRow =
        batch.analysis &&
        typeof batch.analysis ===
          "object" &&
        !Array.isArray(
          batch.analysis,
        )
          ? batch.analysis
          : {};

      const criterionEvidenceRow =
        analysisRow
          .criterionEvidence &&
        typeof analysisRow
          .criterionEvidence ===
          "object" &&
        !Array.isArray(
          analysisRow
            .criterionEvidence,
        )
          ? (
              analysisRow
                .criterionEvidence as
                Record<
                  string,
                  unknown
                >
            )
          : {};

      const item =
        criterionEvidenceRow[
          key
        ] &&
        typeof criterionEvidenceRow[
          key
        ] ===
          "object" &&
        !Array.isArray(
          criterionEvidenceRow[
            key
          ],
        )
          ? (
              criterionEvidenceRow[
                key
              ] as
                Record<
                  string,
                  unknown
                >
            )
          : {};

      const batchNumbers =
        normalizeEvidenceReviewNumbers(
          item
            .evidenceReviewNumbers,
          batch.reviewStart,
          batch.reviewEnd,
        );

      for (
        const reviewNumber of
        batchNumbers
      ) {
        numbers.add(
          reviewNumber,
        );
      }
    }

    result[key] =
      Array.from(
        numbers,
      ).sort(
        (left, right) =>
          left - right,
      );
  }

  return result;
}

function normalizeCriterionEvidence(
  raw: unknown,
  criterionKeys: string[],
  reviewCount: number,
  evidenceNumbersByCriterion?:
    Record<
      string,
      number[]
    >,
) {
  const row =
    raw &&
    typeof raw ===
      "object" &&
    !Array.isArray(raw)
      ? (
          raw as Record<
            string,
            unknown
          >
        )
      : {};

  const result:
    Record<
      string,
      CriterionEvidence
    > = {};

  for (
    const key of
    criterionKeys
  ) {
    const item =
      row[key] &&
      typeof row[key] ===
        "object" &&
      !Array.isArray(
        row[key],
      )
        ? (
            row[key] as Record<
              string,
              unknown
            >
          )
        : {};

    const modelEvidenceNumbers =
      normalizeEvidenceReviewNumbers(
        item
          .evidenceReviewNumbers,
        1,
        reviewCount,
      );

    const batchEvidenceNumbers =
      evidenceNumbersByCriterion &&
      Array.isArray(
        evidenceNumbersByCriterion[
          key
        ],
      )
        ? normalizeEvidenceReviewNumbers(
            evidenceNumbersByCriterion[
              key
            ],
            1,
            reviewCount,
          )
        : [];

    const hasBatchAuthority =
      Boolean(
        evidenceNumbersByCriterion,
      ) &&
      Object.prototype.hasOwnProperty.call(
        evidenceNumbersByCriterion,
        key,
      );

    const evidenceReviewNumbers =
      hasBatchAuthority
        ? batchEvidenceNumbers
        : modelEvidenceNumbers;

    const reviewEvidenceCount =
      evidenceReviewNumbers.length;

    const summary =
      typeof item.summary ===
        "string"
        ? item.summary.trim()
        : "";

    result[key] = {
      reviewEvidenceCount,

      evidenceReviewNumbers,

      summary:
        summary ||
        (
          reviewEvidenceCount >
          0
            ? "관련 구매기준에 대한 실제 사용 리뷰 근거가 확인되었습니다."
            : "현재 수집된 리뷰만으로는 이 구매기준을 직접 판단할 근거가 부족합니다."
        ),
    };
  }

  return result;
}

function normalizeAnalysis(
  raw: Record<
    string,
    unknown
  >,
  criterionKeys:
    string[],
) {
  const rawScores =
    raw.criterionScores &&
    typeof raw.criterionScores ===
      "object" &&
    !Array.isArray(
      raw.criterionScores,
    )
      ? (
          raw.criterionScores as Record<
            string,
            unknown
          >
        )
      : {};

  const rawReasons =
    raw.criterionReasons &&
    typeof raw.criterionReasons ===
      "object" &&
    !Array.isArray(
      raw.criterionReasons,
    )
      ? (
          raw.criterionReasons as Record<
            string,
            unknown
          >
        )
      : {};

  const criterionScores:
    Record<
      string,
      number | null
    > = {};

  const criterionReasons:
    Record<
      string,
      string
    > = {};

  for (
    const key of
    criterionKeys
  ) {
    criterionScores[key] =
      normalizeScore(
        rawScores[key],
      );

    criterionReasons[key] =
      typeof rawReasons[key] ===
        "string" &&
      rawReasons[
        key
      ].trim()
        ? (
            rawReasons[
              key
            ] as string
          ).trim()
        : "현재 수집된 리뷰만으로는 충분한 평가 근거가 없습니다.";
  }

  return {
    ...raw,
    criterionScores,
    criterionReasons,
  };
}

function normalizeBatchPointEvidence(
  raw: unknown,
  minimumReviewNumber: number,
  maximumReviewNumber: number,
) {
  if (
    !Array.isArray(
      raw,
    )
  ) {
    return [];
  }

  return raw
    .filter(
      (item) =>
        item &&
        typeof item ===
          "object" &&
        !Array.isArray(
          item,
        ),
    )
    .map(
      (item) => {
        const row =
          item as
            Record<
              string,
              unknown
            >;

        const evidenceReviewNumbers =
          normalizeEvidenceReviewNumbers(
            row
              .evidenceReviewNumbers,
            minimumReviewNumber,
            maximumReviewNumber,
          );

        return {
          ...row,

          evidenceReviewNumbers,

          evidenceCount:
            evidenceReviewNumbers
              .length,
        };
      },
    );
}

type BatchReviewEvidence = {
  criterionAlias: string;
  polarity: "+" | "-" | "0";
  quote: string;
  segmentId: number;
};

type BatchCriterionAssessment = {
  criterionAlias: string;
  positiveSegmentIds: number[];
  negativeSegmentIds: number[];
  neutralSegmentIds: number[];
  rejectedCandidateSegmentIds: number[];
};

type ReviewEligibility =
  | "direct"
  | "indirect"
  | "spec_only"
  | "product_mismatch"
  | "uncertain"
  | "legacy_direct";

type BatchReviewClassification = {
  n: number;
  q: "h" | "l" | "p";
  eligibility:
    ReviewEligibility;
  tags: string[];
  evidence: BatchReviewEvidence[];
  criterionAssessments:
    BatchCriterionAssessment[];
};

type ReviewEvidenceSegment = {
  id: number;
  text: string;
};

function criterionAlias(
  index: number,
) {
  return `c${index + 1}`;
}

function cleanEvidenceSegmentText(
  value: string,
) {
  return value
    .replace(
      /<br\s*\/?>/gi,
      "\n",
    )
    .replace(
      /&nbsp;/gi,
      " ",
    )
    .replace(
      /&amp;/gi,
      "&",
    )
    .replace(
      /&#39;/gi,
      "'",
    )
    .replace(
      /&quot;/gi,
      '"',
    )
    .replace(
      /<[^>]+>/g,
      " ",
    )
    .replace(
      /\r/g,
      "",
    )
    .replace(
      /[ \t]+/g,
      " ",
    )
    .replace(
      /\n{2,}/g,
      "\n",
    )
    .trim();
}

function splitLongEvidenceSegment(
  value: string,
) {
  const result:
    string[] =
    [];

  let remaining =
    value.trim();

  while (
    remaining.length >
      180
  ) {
    let cut =
      remaining.lastIndexOf(
        " ",
        180,
      );

    if (
      cut <
        90
    ) {
      const commaCut =
        Math.max(
          remaining.lastIndexOf(
            ",",
            180,
          ),
          remaining.lastIndexOf(
            "，",
            180,
          ),
          remaining.lastIndexOf(
            ";",
            180,
          ),
          remaining.lastIndexOf(
            "；",
            180,
          ),
        );

      cut =
        commaCut >=
          90
          ? commaCut + 1
          : 180;
    }

    const part =
      remaining
        .slice(
          0,
          cut,
        )
        .trim();

    if (part) {
      result.push(
        part,
      );
    }

    remaining =
      remaining
        .slice(
          cut,
        )
        .trim();
  }

  if (remaining) {
    result.push(
      remaining,
    );
  }

  return result;
}

function splitReviewIntoEvidenceSegments(
  review: string,
) {
  const cleaned =
    cleanEvidenceSegmentText(
      review,
    );

  const roughSegments =
    cleaned
      .split(
        /(?<=[.!?。！？])\s+|\n+|(?=\s*[■●◆◇▶▷✔✅☑★☆⭐①②③④⑤⑥⑦⑧⑨⑩]\s*)/,
      )
      .map(
        (value) =>
          value.trim(),
      )
      .filter(
        Boolean,
      );

  const texts:
    string[] =
    [];

  for (
    const roughSegment of
    roughSegments
  ) {
    texts.push(
      ...splitLongEvidenceSegment(
        roughSegment,
      ),
    );
  }

  if (
    texts.length ===
      0 &&
    cleaned
  ) {
    texts.push(
      cleaned,
    );
  }

  return texts.map(
    (
      text,
      index,
    ) => ({
      id:
        index + 1,
      text,
    }),
  );
}

function normalizeSegmentForGuard(
  value: string,
) {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .toLowerCase();
}

function isLikelyPureVacuumSpec(
  text: string,
) {
  const hasPaSpec =
    /\b\d{3,6}\s*pa\b/i.test(
      text,
    );

  const hasUseOutcome =
    /(실제로|써보|사용|체감|느낌|인상|깨끗|깔끔|사라|안 보|안보|엉키|모였|모여|빨아들|흡입해|흡입되|좋아|좋음|강력해|강해|유지|장난 아니|차원이 다르)/.test(
      text,
    );

  return (
    hasPaSpec &&
    !hasUseOutcome
  );
}

function hasStandaloneMapWord(
  text: string,
) {
  return /(?<![가-힣])지도(?:를|가|에|에서|상|로|의|는|도)?(?=$|[\s,.!?~"'()])/u.test(
    text,
  );
}

function isCriterionEvidenceSegmentPlausible(
  criterionKey: string,
  segmentText: string,
) {
  const text =
    normalizeSegmentForGuard(
      segmentText,
    );

  if (
    text.length <
      4
  ) {
    return false;
  }

  if (
    criterionKey ===
    "mopping_quality_and_coverage"
  ) {
    const explicitMoppingAnchor =
      /(물걸레|물청소|걸레질|닦아|닦여|닦임|닦는|닦고|닦았|닦으|닦지|닦질)/.test(
        text,
      );

    const explicitMoppingOutcome =
      /(얼룩|자국|오염|깨끗|깔끔|말끔|뽀송|뽀득|꼼꼼|모서리|가장자리|구석|밀착|압력|진동|발자국|찌든|기름때|지워|남지 않|생겨|떨어|안 닦|안닦|닦질 않)/.test(
        text,
      );

    const floorMoppingResult =
      /(바닥|얼룩|오염|때|자국|모서리|가장자리|구석).{0,120}(닦아냈|닦였|닦임|닦아주|지워|말끔|깨끗|뽀송|물 자국|물자국|안 닦|닦질 않)/.test(
        text,
      ) ||
      /(닦아냈|닦였|닦임|지워|말끔|깨끗|뽀송|물 자국|물자국|안 닦|닦질 않).{0,120}(바닥|얼룩|오염|때|자국|모서리|가장자리|구석)/.test(
        text,
      );

    const waterMarkFailure =
      /(물\s*자국|물자국|물\s*방울|물방울|물.*떨어).{0,90}(남|생|방치|닦지|닦질|안 닦|안닦|자국|문제|아쉽)/.test(
        text,
      );

    return (
      (
        explicitMoppingAnchor &&
        explicitMoppingOutcome
      ) ||
      floorMoppingResult ||
      waterMarkFailure
    );
  }

  if (
    criterionKey ===
    "vacuum_pickup_and_hair_handling"
  ) {
    if (
      /(오류|에러|메인바퀴|바퀴).{0,70}이물질.{0,30}제거/.test(
        text,
      ) ||
      /이물질.{0,30}제거하라/.test(
        text,
      )
    ) {
      return false;
    }

    if (
      /(걸레|물걸레).{0,35}(빨아|빨아주|빨고|빤|빨기|닦아|닦였|닦임|닦아냈)/.test(
        text,
      ) &&
      !/(흡입|먼지|머리카락|반려동물 털|고양이 털|강아지 털|개털|모래|부스러기|카펫|카페트|러그|브러시)/.test(
        text,
      )
    ) {
      return false;
    }

    if (
      isLikelyPureVacuumSpec(
        text,
      )
    ) {
      return false;
    }

    const directSuctionExperience =
      /흡입력.{0,60}(좋|강|유지|만족|차고 넘|인상적|확실|뛰어나|괜찮|미쳤|충분|장난 아니|차원이 다|압도|나쁘지)/.test(
        text,
      ) ||
      /(좋|강|유지|만족|차고 넘|인상적|확실|뛰어나|괜찮|미쳤|충분|장난 아니|차원이 다|압도|나쁘지).{0,45}흡입력/.test(
        text,
      );

    const carpetPickup =
      /(카펫|카페트|러그).{0,70}(흡입|빨아들|먼지|머리카락|털|부스러기|깔끔|깨끗)/.test(
        text,
      ) ||
      /(흡입|빨아들).{0,70}(카펫|카페트|러그)/.test(
        text,
      );

    const pickupTarget =
      /(먼지|머리카락|반려동물 털|고양이 털|강아지 털|개털|털뭉치|고양이 모래|모래|부스러기)/;

    const pickupOutcome =
      /(흡입|빨아들|사라|안 보|안보|안 남|안남|모였|모여|줄었|줄어들|제거|깔끔|깨끗|싹쓸이|싹 빨)/;

    const targetThenOutcome =
      new RegExp(
        `${pickupTarget.source}.{0,80}${pickupOutcome.source}`,
      ).test(
        text,
      );

    const outcomeThenTarget =
      new RegExp(
        `${pickupOutcome.source}.{0,80}${pickupTarget.source}`,
      ).test(
        text,
      );

    const brushHandling =
      /(머리카락|털).{0,65}(브러시|엉키|안 엉|안엉|꼬임)/.test(
        text,
      ) ||
      /(브러시|엉키|안 엉|안엉|꼬임).{0,65}(머리카락|털)/.test(
        text,
      );

    return (
      directSuctionExperience ||
      carpetPickup ||
      targetThenOutcome ||
      outcomeThenTarget ||
      brushHandling
    );
  }

  if (
    criterionKey ===
    "obstacle_avoidance_and_navigation_reliability"
  ) {
    const voiceRoomNamingOnly =
      /(음성|헬로.?로키|목소리)/.test(
        text,
      ) &&
      /(지도|맵).{0,30}방 이름|방 이름.{0,30}(지도|맵)/.test(
        text,
      ) &&
      !/(장애물|회피|위치 인식|위치인식|충돌|부딪|문턱|매트|러그|경로|동선|진입|주행)/.test(
        text,
      );

    if (
      voiceRoomNamingOnly
    ) {
      return false;
    }

    /*
      정책 경계:
      지도/맵 "설정"이나 Wi-Fi 연결 난이도 자체는 앱 경험(c5)이다.
      실제 자율주행/회피/맵 생성·정확도 결과가 함께 있을 때만 c3로 본다.
    */
    const appConfigurationOnly =
      (
        /(지도|맵).{0,35}(설정|편집)/.test(
          text,
        ) ||
        /(와이파이|wifi).{0,45}(연결|설정)/i.test(
          text,
        )
      ) &&
      !/(맵핑|매핑|맵 스캔).{0,70}(빠르|정확|잘|생성|구분|효율)/.test(
        text,
      ) &&
      !/(장애물|회피|사물 인식|장애물 인식|피하|피해|문턱|턱|매트|러그|주행|경로|동선|멈|걸려|걸림|헤매|헤맸|충돌|부딪|진입)/.test(
        text,
      );

    if (
      appConfigurationOnly
    ) {
      return false;
    }

    const mapAnchor =
      /(맵핑|매핑|맵 스캔|맵을|맵이|맵에서|맵상|맵 생성|맵 설정|맵 편집)/.test(
        text,
      ) ||
      hasStandaloneMapWord(
        text,
      );

    const explicitNavigation =
      /(경로|동선|주행|장애물|회피|사물 인식|장애물 인식|위치 인식|위치인식|충돌|부딪|피하|피해 다|피해 가|갇혀|길을 헤매|헤맸|가상 벽|가상벽|진입 금지|진입금지|인식이 제대로 되지|인식.*실패)/.test(
        text,
      );

    const traversal =
      /(문턱|턱|매트|러그).{0,70}(넘|오르|올라|걸|통과|접히|진입|빠지|멈|못)/.test(
        text,
      ) ||
      /(넘|오르|올라|걸|통과|접히|진입|빠지|멈|못).{0,70}(문턱|턱|매트|러그)/.test(
        text,
      );

    const navigationFailure =
      /(진입|이동|주행|청소).{0,60}(멈|오작동|헤매|갇혀)/.test(
        text,
      ) ||
      /(위치 인식|위치인식).{0,60}(안|못|실패|오류)/.test(
        text,
      ) ||
      /(도크|스테이션).{0,50}(돌아가지 못|못 돌아|복귀.*실패|복귀.*못)/.test(
        text,
      );

    return (
      mapAnchor ||
      explicitNavigation ||
      traversal ||
      navigationFailure
    );
  }

  if (
    criterionKey ===
    "maintenance_automation_and_station_quality"
  ) {
    const wastewaterCleaningInferenceOnly =
      /(오수통|오수).{0,45}(물 색깔|물색|물이.*더러|더러운 물|더러워)/.test(
        text,
      ) &&
      !/(비우|세척|씻|관리|뚜껑|채우|입구|용량|눈금|편리|편하|불편|번거|냄새|위생)/.test(
        text,
      );

    if (
      wastewaterCleaningInferenceOnly
    ) {
      return false;
    }

    const explicitMaintenance =
      /(먼지 비움|먼지비움|집진|걸레 세척|자동 세척|자동세척|온수 세척|고온 세척|스팀 세척|열풍 건조|온풍 건조|고온 건조|고온건조|자동 건조|자동건조|오수통|정수통|직배수|직수형|직배수형|더스트백|세제통|소모품|세정제|전용 세제|전용세제)/.test(
        text,
      );

    const colloquialMopWash =
      /(걸레|물걸레).{0,35}(빨아|빨아주|빨고|빤|빨기|말려|말리|건조|세척|살균)/.test(
        text,
      );

    const stationContext =
      /(도크|스테이션)/.test(
        text,
      ) &&
      /(비우|세척|건조|물통|오수|정수|세제|소모품|소음|시끄|설치|공간|크기|관리|냄새|위생|편리|불편|먼지|걸레|물 채|물채)/.test(
        text,
      );

    const tankManagement =
      /(물통|정수통|오수통).{0,70}(비우|채우|세척|씻|입구|뚜껑|열|닫|관리|편|불편|용량|눈금|max)/i.test(
        text,
      ) ||
      /(비우|채우|세척|씻|입구|뚜껑|열|닫|관리|편|불편|용량|눈금|max).{0,70}(물통|정수통|오수통)/i.test(
        text,
      );

    const waterTankMark =
      /(정수|물통|급수).{0,70}(max|눈금|표시)/i.test(
        text,
      ) ||
      /(max|눈금|표시).{0,70}(정수|물통|급수)/i.test(
        text,
      );

    return (
      explicitMaintenance ||
      colloquialMopWash ||
      stationContext ||
      tankManagement ||
      waterTankMark
    );
  }

  if (
    criterionKey ===
    "app_experience_and_reliability"
  ) {
    const hasAppAnchor =
      /(앱|어플|ui|와이파이|wifi)/.test(
        text,
      );

    if (
      !hasAppAnchor
    ) {
      return false;
    }

    const voiceInsteadOfApp =
      /(음성|헬로.?로키|목소리)/.test(
        text,
      ) &&
      /(앱|어플).{0,35}(사용하지 않아도|안 써도|없이|대신)/.test(
        text,
      );

    if (
      voiceInsteadOfApp
    ) {
      return false;
    }

    return true;
  }

  return true;
}

function classifyUnaccountedCandidateFallback(
  criterionKey: string,
  segmentText: string,
):
  Array<
    "+" |
    "-" |
    "0"
  > {
  const text =
    normalizeSegmentForGuard(
      segmentText,
    );

  if (
    criterionKey ===
    "mopping_quality_and_coverage"
  ) {
    const negative =
      /(물\s*자국|물자국).{0,70}(생|남|방치)/.test(
        text,
      ) ||
      /(물\s*방울|물방울|물.*떨어).{0,80}(닦지|닦질|안 닦|안닦|자국|방치)/.test(
        text,
      ) ||
      /(닦지 않|닦질 않|안 닦|안닦|잘 안 닦|잘안닦)/.test(
        text,
      );

    const positive =
      /(물걸레|걸레질|바닥|얼룩|오염|찌든|기름때|모서리|구석).{0,100}(잘 닦|잘닦|깨끗|깔끔|말끔|지워|뽀송|뽀득|꼼꼼)/.test(
        text,
      ) ||
      /(잘 닦|잘닦|깨끗|깔끔|말끔|지워|뽀송|뽀득|꼼꼼).{0,100}(물걸레|걸레질|바닥|얼룩|오염|찌든|기름때|모서리|구석)/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return [];
  }

  if (
    criterionKey ===
    "vacuum_pickup_and_hair_handling"
  ) {
    const negative =
      /(흡입력|흡입).{0,55}(약|아쉽|별로|안 좋|안좋|못|부족)/.test(
        text,
      ) ||
      /(머리카락|털).{0,55}(엉키|꼬임|감겨)/.test(
        text,
      ) ||
      /(먼지|머리카락|털|모래|부스러기).{0,55}(안 빨|못 빨|남아|그대로)/.test(
        text,
      );

    const positive =
      /(흡입력|흡입).{0,55}(좋|강|유지|만족|충분|장난 아니|차원이 다|압도|미쳤)/.test(
        text,
      ) ||
      /(먼지|머리카락|털|모래|부스러기).{0,70}(사라|줄어|모여|모였|잘 빨|깨끗|깔끔|안 남|안남)/.test(
        text,
      ) ||
      /(잘 빨|깨끗|깔끔|사라|줄어|안 남|안남).{0,70}(먼지|머리카락|털|모래|부스러기)/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return [];
  }

  if (
    criterionKey ===
    "obstacle_avoidance_and_navigation_reliability"
  ) {
    const vagueMapReaction =
      /(맵핑|매핑|맵 스캔).{0,45}(놀랐|신기|기대)/.test(
        text,
      ) &&
      !/(빠르|빠른|정확|잘|깔끔|효율|회피|피해|넘|통과|인식|구분|생성|설정|경로|동선|멈|걸|오작동|부딪|실패)/.test(
        text,
      );

    if (
      vagueMapReaction
    ) {
      return [];
    }

    const previousBadCurrentGood =
      /(s5|s7|s8|s9|예전 모델|이전 모델|기존 모델|다른 로봇청소기|예전 로봇청소기).{0,180}(걸려|걸리|멈|부딪|충돌|헤매|헤맸|못|실패).{0,200}(s10|이번 모델|이번|현재|이 친구|로보락).{0,130}(잘|회피|피해|정확|깔끔|효율|드뭄|드물|적|없)/i.test(
        text,
      );

    if (
      previousBadCurrentGood
    ) {
      return [
        "+",
      ];
    }

    const negative =
      /(위치 인식|위치인식).{0,55}(실패|안 됨|안됨|안 되|안되|못|오류)/.test(
        text,
      ) ||
      /(오작동|걸려|걸림|멈추|못.?올라|부딪히|충돌|접히|빠지|헤매|헤맸|진입.*멈)/.test(
        text,
      );

    const positive =
      /(맵핑|매핑|맵 스캔).{0,60}(빠르|빠른|정확|잘|깔끔|효율|편)/.test(
        text,
      ) ||
      /(빠르|빠른|정확|깔끔|효율).{0,60}(맵핑|매핑|맵 스캔)/.test(
        text,
      ) ||
      /(사물 인식|장애물 인식).{0,65}(정확|좋|뛰어나|잘|예민)/.test(
        text,
      ) ||
      /(정확|좋|뛰어나|잘|예민).{0,65}(사물 인식|장애물 인식)/.test(
        text,
      ) ||
      /(잘 피해|잘 피하|피해 다|피해 가|회피.*잘|회피.*좋|거뜬히 넘|잘 넘|잘 올라|알아서.*올라|자연스럽게 넘|정확하게 인식|정확히 인식|동선.*깔끔|동선.*효율|문턱.*통과|턱.*올라|설정.*해결|지정.*잘)/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return [];
  }

  if (
    criterionKey ===
    "maintenance_automation_and_station_quality"
  ) {
    const homeConstraint =
      /(직배수|직수형|직배수형)/.test(
        text,
      ) &&
      /(저희집|우리집|전세|여건상|설치.?장소|공간|구조|불가|못해|못 하|안 돼|안되|일반형)/.test(
        text,
      );

    if (
      homeConstraint
    ) {
      return [
        "0",
      ];
    }

    const negative =
      /(물통|정수통|오수통|뚜껑|세제|건조|세척|더스트백|도크|스테이션).{0,90}(불편|아쉽|번거|수고스럽|수고스러|오래 걸|시간.*긴|시간.*길|별도.?구매|기본.?포함.*아니|미포함|하나만|하나.?구성|눈금.*없)/.test(
        text,
      ) ||
      /(불편|아쉽|번거|수고스럽|수고스러|오래 걸|시간.*긴|시간.*길|별도.?구매|기본.?포함.*아니|미포함|하나만|하나.?구성|눈금.*없).{0,90}(물통|정수통|오수통|뚜껑|세제|건조|세척|더스트백|도크|스테이션)/.test(
        text,
      );

    const positive =
      /(먼지 비움|먼지비움|집진|걸레 세척|자동 세척|자동세척|온수 세척|고온 세척|스팀 세척|열풍 건조|온풍 건조|고온 건조|고온건조|자동 건조|자동건조|물통|정수통|오수통|세제통|도크|스테이션).{0,120}(편리|편하|수월|자동|알아서|위생|냄새.*(없|안 나|걱정 없이)|뽀송|깨끗.*관리|물건|세척.*잘|건조.*잘|관리.*편|입구.*넓|세척.*용이|장점)/.test(
        text,
      ) ||
      /(편리|편하|수월|자동|알아서|위생|냄새.*(없|안 나|걱정 없이)|뽀송|깨끗.*관리|물건|세척.*잘|건조.*잘|관리.*편|입구.*넓|세척.*용이|장점).{0,120}(먼지 비움|먼지비움|집진|걸레 세척|자동 세척|자동세척|온수 세척|고온 세척|스팀 세척|열풍 건조|온풍 건조|고온 건조|고온건조|자동 건조|자동건조|물통|정수통|오수통|세제통|도크|스테이션)/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return [];
  }

  if (
    criterionKey ===
    "app_experience_and_reliability"
  ) {
    const negative =
      /(앱|어플|ui|와이파이|wifi).{0,90}(직관적이지|낯설|어렵|시간.*걸|연결.*안|연동.*안|오류|실패|공부.*해야|익숙.*시간)/.test(
        text,
      ) ||
      /(직관적이지|낯설|어렵|시간.*걸|연결.*안|연동.*안|오류|실패|공부.*해야|익숙.*시간).{0,90}(앱|어플|ui|와이파이|wifi)/.test(
        text,
      );

    const positive =
      /(앱|어플|ui|와이파이|wifi).{0,90}(편리|편하|쉽|금방|잘 되어|잘되어|직관적|원격|예약|설정.*해결|금지 구역.*해결)/.test(
        text,
      ) &&
      !/직관적이지/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return [];
  }

  return [];
}

function buildCriterionCandidateHints(
  review: string,
  criterionKeys:
    string[],
) {
  const segments =
    splitReviewIntoEvidenceSegments(
      review,
    );

  const candidates:
    Record<
      string,
      number[]
    > = {};

  for (
    let criterionIndex =
      0;
    criterionIndex <
      criterionKeys.length;
    criterionIndex++
  ) {
    const alias =
      criterionAlias(
        criterionIndex,
      );

    const criterionKey =
      criterionKeys[
        criterionIndex
      ];

    candidates[
      alias
    ] =
      segments
        .filter(
          (segment) =>
            isCriterionEvidenceSegmentPlausible(
              criterionKey,
              segment.text,
            ),
        )
        .map(
          (segment) =>
            segment.id,
        );
  }

  return {
    segments,
    candidates,
  };
}

function deriveCriterionTagsFromEvidence(
  evidence:
    BatchReviewEvidence[],
  criterionKeys:
    string[],
) {
  const tags:
    string[] =
    [];

  for (
    let criterionIndex =
      0;
    criterionIndex <
      criterionKeys.length;
    criterionIndex++
  ) {
    const alias =
      criterionAlias(
        criterionIndex,
      );

    const polarities =
      new Set(
        evidence
          .filter(
            (item) =>
              item.criterionAlias ===
              alias,
          )
          .map(
            (item) =>
              item.polarity,
          ),
      );

    if (
      polarities.has(
        "+",
      ) &&
      polarities.has(
        "-",
      )
    ) {
      tags.push(
        `${alias}m`,
      );

      continue;
    }

    if (
      polarities.has(
        "+",
      )
    ) {
      tags.push(
        `${alias}+`,
      );

      continue;
    }

    if (
      polarities.has(
        "-",
      )
    ) {
      tags.push(
        `${alias}-`,
      );

      continue;
    }

    if (
      polarities.has(
        "0",
      )
    ) {
      tags.push(
        `${alias}0`,
      );
    }
  }

  return tags;
}

function normalizeUniqueSegmentIds(
  value: unknown,
) {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(
          Number,
        )
        .filter(
          (number) =>
            Number.isSafeInteger(
              number,
            ),
        ),
    ),
  ).sort(
    (
      left,
      right,
    ) =>
      left -
      right,
  );
}

function samePolaritySet(
  left:
    Array<
      "+" |
      "-" |
      "0"
    >,
  right:
    Array<
      "+" |
      "-" |
      "0"
    >,
) {
  const leftSet =
    new Set(
      left,
    );

  const rightSet =
    new Set(
      right,
    );

  if (
    leftSet.size !==
      rightSet.size
  ) {
    return false;
  }

  for (
    const value of
    leftSet
  ) {
    if (
      !rightSet.has(
        value,
      )
    ) {
      return false;
    }
  }

  return true;
}

function resolveCanonicalEvidencePolarities(
  criterionKey: string,
  segmentText: string,
  observed:
    Array<
      "+" |
      "-" |
      "0"
    >,
):
  Array<
    "+" |
    "-" |
    "0"
  > {
  const text =
    normalizeSegmentForGuard(
      segmentText,
    );

  if (
    criterionKey ===
    "mopping_quality_and_coverage"
  ) {
    const negative =
      /(물\s*자국|물자국).{0,70}(생겨|생김|남아|남음|방치)/.test(
        text,
      ) ||
      /(물\s*방울|물방울|물.*떨어).{0,80}(닦지|닦질|안 닦|안닦|자국|방치)/.test(
        text,
      ) ||
      /(잘 안 닦|잘안닦|닦지 않|닦질 않|안 닦|안닦)/.test(
        text,
      );

    const positive =
      /(물\s*자국|물자국).{0,30}(없|안 남|남지 않)/.test(
        text,
      ) ||
      /(잘 닦|잘닦|깨끗하게 닦|깔끔하게 닦|말끔히 닦|얼룩.*지워|자국.*지워|찌든.*지워|뽀송|보송)/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return observed;
  }

  if (
    criterionKey ===
    "vacuum_pickup_and_hair_handling"
  ) {
    const previousBadCurrentGood =
      /(예전|이전|과거|보통|다른).{0,120}(흡입력|흡입|머리카락|털).{0,100}(안 좋|안좋|약|엉키|꼬임|감겨|별로).{0,170}(이번|현재|s10|이 친구|로보락).{0,100}(좋|강|유지|안 엉키|안엉키|꼬임 방지|인상|만족)/i.test(
        text,
      );

    if (
      previousBadCurrentGood
    ) {
      return [
        "+",
      ];
    }

    const negativeText =
      text
        .replace(
          /(머리카락|털).{0,55}(잘 )?(엉키지 않|안 엉키|안엉키|감기지 않)/g,
          "",
        )
        .replace(
          /(머리카락|털).{0,55}(꼬임 방지|엉킴 방지)/g,
          "",
        )
        .replace(
          /(꼬임 방지|엉킴 방지).{0,55}(머리카락|털)/g,
          "",
        );

    const negative =
      /(흡입력|흡입).{0,60}(약|아쉽|별로|안 좋|안좋|못|부족)/.test(
        negativeText,
      ) ||
      /(머리카락|털).{0,60}(엉키|꼬임|감겨)/.test(
        negativeText,
      ) ||
      /(먼지|머리카락|털|모래|부스러기).{0,60}(안 빨|못 빨|남아|그대로)/.test(
        negativeText,
      );

    const positive =
      /(흡입력|흡입).{0,65}(좋|강|유지|만족|충분|장난 아니|차원이 다르|미쳤)/.test(
        text,
      ) ||
      /(먼지|머리카락|털|모래|부스러기).{0,75}(사라|줄어|모여|모였|잘 빨|깨끗|깔끔|안 보|안보)/.test(
        text,
      ) ||
      /(머리카락|털).{0,70}(엉키지 않|안 엉키|안엉키|꼬임 방지|엉킴 방지|한 번도 안 엉)/.test(
        text,
      ) ||
      /(꼬임 방지|엉킴 방지).{0,70}(머리카락|털)/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return observed;
  }

  if (
    criterionKey ===
    "obstacle_avoidance_and_navigation_reliability"
  ) {
    const previousBadCurrentGood =
      (
        /(s5|s7|s8|s9|예전 모델|이전 모델|기존 모델|다른 로봇청소기|예전 로봇청소기|이전 로봇청소기).{0,170}(걸려|걸리|멈|부딪|충돌|헤매|헤맸|못|실패).{0,190}(이번|현재|s10|이 친구|로보락).{0,120}(피해|회피|잘|깔끔|효율|드뭄|드물|적|없)/i.test(
          text,
        ) ||
        /(원래|보통).{0,100}(부딪|충돌|걸려|멈).{0,130}(s10|이번 모델|이번|현재).{0,100}(드뭄|드물|적|없|잘|회피)/i.test(
          text,
        )
      );

    if (
      previousBadCurrentGood
    ) {
      return [
        "+",
      ];
    }

    const negativeText =
      text
        .replace(
          /부딪히지 않[^,.!?]*/g,
          "",
        )
        .replace(
          /충돌하지 않[^,.!?]*/g,
          "",
        )
        .replace(
          /부딪힘이 적[^,.!?]*/g,
          "",
        )
        .replace(
          /부딪히는 경우가?[^,.!?]{0,35}(극히 )?(드뭄|드물|적)/g,
          "",
        )
        .replace(
          /멈추는 일이 거의 없[^,.!?]*/g,
          "",
        )
        .replace(
          /걸리지 않[^,.!?]*/g,
          "",
        );

    const negative =
      /(위치 인식|위치인식).{0,55}(실패|안|못|오류)/.test(
        negativeText,
      ) ||
      /(오작동|걸려|걸림|멈추|못.?올라|부딪히|충돌|접히|빠지|헤매|헤맸|진입.*멈)/.test(
        negativeText,
      );

    const positive =
      /(잘 피해|잘 피하|피해 다|회피.*잘|회피.*좋|거뜬히 넘|잘 넘|자연스럽게 넘|문제없이 넘|막힘없이|정확하게 인식|정확히 인식|맵핑.*빠|매핑.*빠|동선.*깔끔|동선.*효율|문턱.*통과|설정.*해결|지정.*잘|충돌하지 않|부딪히지 않|부딪힘이 적|부딪히는 경우.{0,30}(드뭄|드물|적))/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return observed;
  }

  if (
    criterionKey ===
    "maintenance_automation_and_station_quality"
  ) {
    const homeConstraint =
      /(직배수|직수형|직배수형)/.test(
        text,
      ) &&
      /(저희집|우리집|전세|여건상|설치.?장소|공간|구조|불가|못해|못 하|안 돼|안되|일반형)/.test(
        text,
      );

    if (
      homeConstraint
    ) {
      return [
        "0",
      ];
    }

    /*
      비교문의 단점 주체를 현재 제품과 과거 제품으로 분리한다.
      과거 제품이 불편했고 현재 제품이 수월해졌다면 현재 제품은 +.
      반대로 현재 제품이 불편하고 과거 제품이 더 편했다면 -.
    */
    const currentWorseThanPrevious =
      /(다만|아쉽|불편).{0,150}(s10|이번|현재).{0,130}(불편|어렵|번거|아쉽)|(?:s8|s9|이전|예전).{0,80}(오히려 )?더 편/.test(
        text,
      );

    if (
      currentWorseThanPrevious
    ) {
      return [
        "-",
      ];
    }

    const previousBadCurrentGood =
      /(s5|s7|s8|s9|예전|이전|과거|기존).{0,160}(불편|번거|직접|귀찮|수고).{0,190}(s10|이번|현재|이제|지금).{0,140}(수월|편|자동|신경.*없|알아서|스스로|개선)/i.test(
        text,
      );

    if (
      previousBadCurrentGood
    ) {
      return [
        "+",
      ];
    }

    const detergentStillFine =
      /(세제|세정제).{0,50}(없이도|없어도).{0,90}(나쁘지 않|세척|냄새.*안|깨끗|잘)/.test(
        text,
      ) ||
      /(세제|세정제).{0,45}(구매를 안|아직 구매.*안).{0,100}(나쁘지 않|잘|문제.*없)/.test(
        text,
      );

    if (
      detergentStillFine
    ) {
      const hasStationBenefit =
        /(자동|도크|스테이션|세척|건조|집진|먼지.?비움|걸레.*빨|냄새.*안|편|수월|알아서|스스로)/.test(
          text,
        );

      return hasStationBenefit
        ? [
            "+",
          ]
        : [
            "0",
          ];
    }

    /*
      "번거로움 없이", "냄새 걱정 없이"는 부정 단어가 들어 있어도
      현재 제품의 장점이므로 음극 탐지에서 제거한다.
    */
    const negativeText =
      text
        .replace(
          /번거로움 없이[^,.!?]*/g,
          "",
        )
        .replace(
          /번거롭지 않[^,.!?]*/g,
          "",
        )
        .replace(
          /냄새[^,.!?]{0,40}(안 나|안나|없|걱정 없이)[^,.!?]*/g,
          "",
        )
        .replace(
          /걱정 없이[^,.!?]*/g,
          "",
        );

    const negative =
      /(다만|아쉽|아쉬|불편|번거|수고스럽|수고스러|오래 걸|시간.*긴|시간.*길|별도.?구매|별도로.*구매|기본.?포함.*아니|미포함|하나만|하나.?구성|뚜껑.*불편|눈금.*없|공간.*차지|위치.*잘 잡|소음.*크|큰 ?소리|시끄)/.test(
        negativeText,
      ) ||
      /(세제|세정제).{0,40}(미포함|별도.?구매|없어서|없음|안 들어|포함.*아니)/.test(
        negativeText,
      );

    const positive =
      /(자동|알아서|스스로|편리|편하|수월|위생|냄새.*없|냄새.*안 ?나|냄새.*걱정 없이|뽀송|보송|깨끗.*관리|세척.*잘|건조.*잘|관리.*편|입구.*넓|세척.*용이|손댈.*없|신경.*없|번거로움 없이)/.test(
        text,
      ) &&
      /(도크|스테이션|먼지.?비움|집진|걸레|세척|건조|온수|고온|스팀|물통|정수통|오수통|세제통|관리|세제|세정제)/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return observed;
  }

  if (
    criterionKey ===
    "app_experience_and_reliability"
  ) {
    const negative =
      /(직관적이지|낯설|어렵|공부.*해야|공부를 더|이것 저것 클릭|이것저것 클릭|익숙.*시간|오류|실패)/.test(
        text,
      ) ||
      /(연결|연동).{0,45}(안 됨|안됨|안 되|안되|못|실패|오류|끊)/.test(
        text,
      );

    const positive =
      /(앱|어플|ui).{0,120}(편리|편하|쉽|금방|잘 되어|잘되어|직관적|원격|예약|연결|설정|작동|청소 시작|알림|확인)/.test(
        text,
      ) ||
      /(앱|어플).{0,90}(통해|에서).{0,120}(연결|작동|예약|설정|청소|시작|확인)/.test(
        text,
      );

    if (
      positive &&
      negative
    ) {
      return [
        "+",
        "-",
      ];
    }

    if (negative) {
      return [
        "-",
      ];
    }

    if (positive) {
      return [
        "+",
      ];
    }

    return observed;
  }

  return observed;
}

function canonicalizeReviewEvidence(
  evidence:
    BatchReviewEvidence[],
  criterionKeys:
    string[],
) {
  const groups =
    new Map<
      string,
      BatchReviewEvidence[]
    >();

  for (
    const item of
    evidence
  ) {
    const key =
      `${item.criterionAlias}|${item.segmentId}`;

    const group =
      groups.get(
        key,
      ) ??
      [];

    group.push(
      item,
    );

    groups.set(
      key,
      group,
    );
  }

  const canonical:
    BatchReviewEvidence[] =
    [];

  let changedSegmentCount =
    0;

  let conflictResolvedCount =
    0;

  for (
    const group of
    groups.values()
  ) {
    const first =
      group[
        0
      ];

    const criterionIndex =
      Number(
        first
          .criterionAlias
          .slice(
            1,
          ),
      ) -
      1;

    const criterionKey =
      criterionKeys[
        criterionIndex
      ];

    if (!criterionKey) {
      continue;
    }

    const observed =
      Array.from(
        new Set(
          group.map(
            (item) =>
              item.polarity,
          ),
        ),
      );

    const resolved =
      Array.from(
        new Set(
          resolveCanonicalEvidencePolarities(
            criterionKey,
            first.quote,
            observed,
          ),
        ),
      );

    if (
      !samePolaritySet(
        observed,
        resolved,
      )
    ) {
      changedSegmentCount +=
        1;
    }

    if (
      observed.length >
        1 &&
      resolved.length <
        observed.length
    ) {
      conflictResolvedCount +=
        1;
    }

    for (
      const polarity of
      resolved
    ) {
      canonical.push({
        criterionAlias:
          first
            .criterionAlias,
        polarity,
        quote:
          first.quote,
        segmentId:
          first.segmentId,
      });
    }
  }

  const polarityOrder:
    Record<
      "+" |
      "-" |
      "0",
      number
    > = {
    "+":
      0,
    "-":
      1,
    "0":
      2,
  };

  canonical.sort(
    (
      left,
      right,
    ) => {
      const aliasDelta =
        Number(
          left
            .criterionAlias
            .slice(
              1,
            ),
        ) -
        Number(
          right
            .criterionAlias
            .slice(
              1,
            ),
        );

      if (aliasDelta) {
        return aliasDelta;
      }

      const segmentDelta =
        left.segmentId -
        right.segmentId;

      if (segmentDelta) {
        return segmentDelta;
      }

      return (
        polarityOrder[
          left.polarity
        ] -
        polarityOrder[
          right.polarity
        ]
      );
    },
  );

  return {
    evidence:
      canonical,
    changedSegmentCount,
    conflictResolvedCount,
  };
}

function rebuildCriterionAssessmentsFromEvidence(
  evidence:
    BatchReviewEvidence[],
  original:
    BatchCriterionAssessment[],
) {
  return original.map(
    (assessment) => {
      const criterionEvidence =
        evidence.filter(
          (item) =>
            item.criterionAlias ===
            assessment
              .criterionAlias,
        );

      const positiveSegmentIds =
        Array.from(
          new Set(
            criterionEvidence
              .filter(
                (item) =>
                  item.polarity ===
                  "+",
              )
              .map(
                (item) =>
                  item.segmentId,
              ),
          ),
        ).sort(
          (
            left,
            right,
          ) =>
            left -
            right,
        );

      const negativeSegmentIds =
        Array.from(
          new Set(
            criterionEvidence
              .filter(
                (item) =>
                  item.polarity ===
                  "-",
              )
              .map(
                (item) =>
                  item.segmentId,
              ),
          ),
        ).sort(
          (
            left,
            right,
          ) =>
            left -
            right,
        );

      const neutralSegmentIds =
        Array.from(
          new Set(
            criterionEvidence
              .filter(
                (item) =>
                  item.polarity ===
                  "0",
              )
              .map(
                (item) =>
                  item.segmentId,
              ),
          ),
        ).sort(
          (
            left,
            right,
          ) =>
            left -
            right,
        );

      return {
        ...assessment,
        positiveSegmentIds,
        negativeSegmentIds,
        neutralSegmentIds,
      };
    },
  );
}

function normalizeBatchReviewClassifications(
  raw: unknown,
  criterionKeys:
    string[],
  reviews:
    string[],
  reviewStart: number,
  reviewEnd: number,
) {
  const rawRows =
    Array.isArray(
      raw,
    )
      ? raw
      : [];

  const seenReviewNumbers =
    new Set<number>();

  const duplicateReviewNumbers =
    new Set<number>();

  const invalidReviewNumbers:
    number[] =
    [];

  const invalidQualityReviewNumbers:
    number[] =
    [];

  const missingCriterionSlots:
    string[] =
    [];

  const duplicateCriterionSlots:
    string[] =
    [];

  const unaccountedCandidateRefs:
    string[] =
    [];

  const invalidSegmentReferenceRefs:
    string[] =
    [];

  const invalidRejectedCandidateRefs:
    string[] =
    [];

  let rawCriterionSlotCount =
    0;

  let normalizedCriterionSlotCount =
    0;

  let invalidCriterionAliasCount =
    0;

  let invalidSegmentReferenceCount =
    0;

  let invalidRejectedCandidateCount =
    0;

  let criterionGuardRejectedCount =
    0;

  let acceptedEvidenceCount =
    0;

  let candidateHintCount =
    0;

  let candidateSelectedCount =
    0;

  let candidateRejectedCount =
    0;

  let candidateUnaccountedCount =
    0;

  let fallbackSelectedCandidateCount =
    0;

  let fallbackRejectedCandidateCount =
    0;

  const fallbackSelectedCandidateRefs:
    string[] =
    [];

  const fallbackRejectedCandidateRefs:
    string[] =
    [];

  let polarityNormalizedCount =
    0;

  let canonicalPolarityChangedSegmentCount =
    0;

  let canonicalConflictResolvedCount =
    0;

  let canonicalEvidenceCount =
    0;

  let reviewEligibilityMissingCount =
    0;

  let scoringEligibleReviewCount =
    0;

  let scoringExcludedReviewCount =
    0;

  const reviewEligibilityCounts:
    Record<
      ReviewEligibility,
      number
    > = {
    direct:
      0,
    indirect:
      0,
    spec_only:
      0,
    product_mismatch:
      0,
    uncertain:
      0,
    legacy_direct:
      0,
  };

  const rows:
    BatchReviewClassification[] =
    [];

  const normalizePolarities = (
    criterionKey: string,
    segmentText: string,
    polarity:
      "+" |
      "-" |
      "0",
  ) => {
    const text =
      normalizeSegmentForGuard(
        segmentText,
      );

    const original = [
      polarity,
    ] as Array<
      "+" |
      "-" |
      "0"
    >;

    const changed = (
      next:
        Array<
          "+" |
          "-" |
          "0"
        >,
    ) => {
      const same =
        next.length ===
          original.length &&
        next.every(
          (
            value,
            index,
          ) =>
            value ===
            original[
              index
            ],
        );

      if (!same) {
        polarityNormalizedCount +=
          1;
      }

      return next;
    };

    if (
      criterionKey ===
      "maintenance_automation_and_station_quality"
    ) {
      const homeConstraint =
        /(직배수|직수형|직배수형)/.test(
          text,
        ) &&
        /(저희집|우리집|전세|여건상|설치.?장소|공간|구조|불가|못해|못 하|안 돼|안되|일반형)/.test(
          text,
        );

      if (
        homeConstraint
      ) {
        return changed(
          [
            "0",
          ],
        );
      }
    }

    /*
      비교문에서 "예전 제품은 실패했지만 현재 S10은 잘한다"는
      과거의 부정 표현을 현재 제품의 음극으로 가져오지 않는다.
    */
    const previousToCurrentPositive =
      (
        /(s5|s7|s8|s9|이전 모델|기존 모델|전작|예전 모델|예전 로봇청소기|이전 로봇청소기|다른 로봇청소기).{0,180}(불편|걸려|걸리|멈|부딪|못|아쉽|약했|별로|헤매|안 좋|안좋).{0,200}(s10|이번 모델|이번 s10|신형|현재 모델|이 친구|로보락).{0,140}(수월|개선|잘|회피|편|좋|줄|없|거뜬|정확|깔끔|효율|드뭄|적)/i.test(
          text,
        ) ||
        /(예전|이전|과거).{0,150}(번거|불편|직접|걸려|멈|헤매|부딪|못).{0,170}(이제|지금|현재|이번|s10).{0,120}(없|자동|편|잘|좋|해결|스스로|알아서)/i.test(
          text,
        ) ||
        /(원래|보통).{0,100}(부딪|충돌|걸려|멈).{0,130}(s10|이번 모델|이번|현재).{0,100}(드뭄|적|없|잘|회피)/i.test(
          text,
        )
      );

    if (
      previousToCurrentPositive
    ) {
      return changed(
        [
          "+",
        ],
      );
    }

    if (
      criterionKey ===
      "mopping_quality_and_coverage"
    ) {
      const scrubbed =
        text
          .replace(
            /(물\s*자국|물자국).{0,30}(남지 않을까|생기지 않을까)/g,
            "",
          )
          .replace(
            /(물\s*자국|물자국).{0,25}(없|안 남|남지 않)/g,
            "",
          );

      const negative =
        /(물\s*자국|물자국).{0,70}(생겨|생김|남아|남음|방치)/.test(
          scrubbed,
        ) ||
        /(물\s*방울|물방울|물.*떨어).{0,80}(닦지|닦질|안 닦|안닦|자국|방치)/.test(
          scrubbed,
        ) ||
        /(닦지 않|닦질 않|안 닦|안닦|잘 안 닦|잘안닦)/.test(
          scrubbed,
        );

      const positive =
        /(잘 닦|잘닦|깨끗하게 닦|말끔히 닦|깔끔하게 닦|얼룩.*지워|자국.*지워|찌든.*지워|뽀송|물걸레 자국.*남지 않|물\s*자국.*없|물자국.*없)/.test(
          text,
        );

      if (
        negative &&
        positive
      ) {
        return changed(
          [
            "+",
            "-",
          ],
        );
      }

      if (negative) {
        return changed(
          [
            "-",
          ],
        );
      }

      if (positive) {
        return changed(
          [
            "+",
          ],
        );
      }

      return original;
    }

    if (
      criterionKey ===
      "vacuum_pickup_and_hair_handling"
    ) {
      const currentContrastPositive =
        /(흡입력|흡입).{0,80}(안 좋|안좋|약하|별로).{0,120}(이번 모델|이번|s10|현재).{0,100}(좋|강|인상|만족|유지)/i.test(
          text,
        );

      if (
        currentContrastPositive
      ) {
        return changed(
          [
            "+",
          ],
        );
      }

      const scrubbed =
        text
          .replace(
            /(머리카락|털).{0,50}(잘 )?(엉키지 않|안 엉키|안엉키|감기지 않)/g,
            "",
          )
          .replace(
            /(머리카락|털).{0,50}(꼬임 방지|엉킴 방지)/g,
            "",
          )
          .replace(
            /(꼬임 방지|엉킴 방지).{0,50}(머리카락|털)/g,
            "",
          );

      const negative =
        /(흡입력|흡입).{0,55}(약|아쉽|별로|안 좋|안좋|못|부족)/.test(
          scrubbed,
        ) ||
        /(머리카락|털).{0,55}(엉키|꼬임|감겨)/.test(
          scrubbed,
        ) ||
        /(먼지|머리카락|털|모래|부스러기).{0,55}(안 빨|못 빨|남아|그대로)/.test(
          scrubbed,
        );

      const positive =
        /(흡입력|흡입).{0,55}(좋|강|유지|만족|충분|장난 아니|차원이 다르)/.test(
          text,
        ) ||
        /(먼지|머리카락|털|모래|부스러기).{0,65}(사라|줄어|모여|모였|잘 빨|깨끗|깔끔|안 보|안보)/.test(
          text,
        ) ||
        /(머리카락|털).{0,65}(엉키지 않|안 엉키|안엉키|꼬임 방지|엉킴 방지)/.test(
          text,
        ) ||
        /(꼬임 방지|엉킴 방지).{0,65}(머리카락|털)/.test(
          text,
        );

      if (
        negative &&
        positive
      ) {
        return changed(
          [
            "+",
            "-",
          ],
        );
      }

      if (negative) {
        return changed(
          [
            "-",
          ],
        );
      }

      if (positive) {
        return changed(
          [
            "+",
          ],
        );
      }

      return original;
    }

    if (
      criterionKey ===
      "obstacle_avoidance_and_navigation_reliability"
    ) {
      const scrubbed =
        text
          .replace(
            /부딪히지 않[^,.!?]*/g,
            "",
          )
          .replace(
            /충돌하지 않[^,.!?]*/g,
            "",
          )
          .replace(
            /부딪힘이 적[^,.!?]*/g,
            "",
          )
          .replace(
            /부딪히는 경우가?[^,.!?]{0,35}(극히 )?(드뭄|드물|적)/g,
            "",
          )
          .replace(
            /멈추는 일이 거의 없[^,.!?]*/g,
            "",
          )
          .replace(
            /걸리지 않[^,.!?]*/g,
            "",
          )
          .replace(
            /문제없이 (넘|통과)[^,.!?]*/g,
            "",
          );

      const negative =
        /(위치 인식|위치인식).{0,55}(실패|안|못|오류)/.test(
          scrubbed,
        ) ||
        /(오작동|걸려|걸림|멈추|못.?올라|부딪히|충돌|접히|빠지|헤매|진입.*멈)/.test(
          scrubbed,
        );

      const positive =
        /(잘 피해|잘 피하|피해 다|회피.*잘|회피.*좋|거뜬히 넘|잘 넘|자연스럽게 넘|문제없이 넘|막힘없이|정확하게 인식|정확히 인식|맵핑.*빠|매핑.*빠|동선.*깔끔|동선.*효율|문턱.*통과|설정.*해결|지정.*잘|충돌하지 않|부딪히지 않|부딪힘이 적|부딪히는 경우.{0,30}(드뭄|드물|적))/.test(
          text,
        );

      if (
        negative &&
        positive
      ) {
        return changed(
          [
            "+",
            "-",
          ],
        );
      }

      if (negative) {
        return changed(
          [
            "-",
          ],
        );
      }

      if (positive) {
        return changed(
          [
            "+",
          ],
        );
      }

      return original;
    }

    if (
      criterionKey ===
      "maintenance_automation_and_station_quality"
    ) {
      const oldBurdenToAutomation =
        /(예전|이전|과거).{0,130}(직접|번거|불편).{0,160}(이제|지금|현재).{0,100}(없|자동|편|신경.*않|스스로|알아서)/.test(
          text,
        );

      if (
        oldBurdenToAutomation
      ) {
        return changed(
          [
            "+",
          ],
        );
      }

      const previousModelMoreConvenient =
        /(불편|아쉬).{0,100}(s8|s9|이전|예전).{0,80}(오히려 )?더 편/.test(
          text,
        );

      if (
        previousModelMoreConvenient
      ) {
        return changed(
          [
            "-",
          ],
        );
      }

      const scrubbed =
        text
          .replace(
            /번거로움 없이[^,.!?]*/g,
            "",
          )
          .replace(
            /냄새[^,.!?]{0,30}(안 나|안나|없|걱정 없)[^,.!?]*/g,
            "",
          )
          .replace(
            /걱정 없이[^,.!?]*/g,
            "");

      const negative =
        /(다만|아쉽|아쉬|불편|번거|수고스럽|수고스러|오래 걸|시간.*긴|시간.*길|별도.?구매|별도로.*구매|기본.?포함.*아니|미포함|하나만|하나.?구성|냄새.*나|세척.*불편|뚜껑.*불편|눈금.*없|세정제.*없|세제.*없)/.test(
          scrubbed,
        ) ||
        /(도크|스테이션|먼지.?비움|먼지흡입).{0,70}(소음.*크|큰 ?소리|시끄)/.test(
          scrubbed,
        );

      const positive =
        /(편리|편하|수월|자동|알아서|스스로|위생|냄새.*없|냄새.*안 ?나|뽀송|세척.*잘|건조.*잘|관리.*편|입구.*넓|세척.*용이|분리.*장점|손댈.*없|신경.*없)/.test(
          text,
        );

      if (
        negative &&
        positive
      ) {
        return changed(
          [
            "+",
            "-",
          ],
        );
      }

      if (negative) {
        return changed(
          [
            "-",
          ],
        );
      }

      if (positive) {
        return changed(
          [
            "+",
          ],
        );
      }

      return original;
    }

    if (
      criterionKey ===
      "app_experience_and_reliability"
    ) {
      const negative =
        /(직관적이지|낯설|어렵|시간.*걸|연결.*안|연동.*안|오류|실패|공부.*해야|익숙.*시간)/.test(
          text,
        );

      const positive =
        (
          /(편리|편하|쉽|금방|잘 되어|잘되어|직관적|원격|예약|설정.*해결|금지 구역.*해결)/.test(
            text,
          ) ||
          /(앱|어플).{0,70}(연결).{0,60}(작동|시작|사용)/.test(
            text,
          )
        ) &&
        !/직관적이지/.test(
          text,
        );

      if (
        negative &&
        positive
      ) {
        return changed(
          [
            "+",
            "-",
          ],
        );
      }

      if (negative) {
        return changed(
          [
            "-",
          ],
        );
      }

      if (positive) {
        return changed(
          [
            "+",
          ],
        );
      }

      return original;
    }

    return original;
  };

  for (
    const value of
    rawRows
  ) {
    const row =
      asRecord(
        value,
      );

    if (!row) {
      continue;
    }

    const reviewNumber =
      Number(
        row.n ??
        row.reviewNumber,
      );

    if (
      !Number.isSafeInteger(
        reviewNumber,
      ) ||
      reviewNumber <
        reviewStart ||
      reviewNumber >
        reviewEnd
    ) {
      if (
        Number.isFinite(
          reviewNumber,
        )
      ) {
        invalidReviewNumbers.push(
          reviewNumber,
        );
      }

      continue;
    }

    if (
      seenReviewNumbers.has(
        reviewNumber,
      )
    ) {
      duplicateReviewNumbers.add(
        reviewNumber,
      );

      continue;
    }

    seenReviewNumbers.add(
      reviewNumber,
    );

    const reviewOffset =
      reviewNumber -
      reviewStart;

    const review =
      reviews[
        reviewOffset
      ] ??
      "";

    const {
      segments,
      candidates,
    } =
      buildCriterionCandidateHints(
        review,
        criterionKeys,
      );

    for (
      const ids of
      Object.values(
        candidates,
      )
    ) {
      candidateHintCount +=
        ids.length;
    }

    const segmentById =
      new Map(
        segments.map(
          (segment) => [
            segment.id,
            segment,
          ],
        ),
      );

    const rawQuality =
      typeof row.q ===
        "string"
        ? row.q.trim()
            .toLowerCase()
        : "";

    if (
      rawQuality !==
        "h" &&
      rawQuality !==
        "l" &&
      rawQuality !==
        "p"
    ) {
      invalidQualityReviewNumbers.push(
        reviewNumber,
      );
    }

    const rawEligibility =
      typeof row.e ===
        "string"
        ? row.e.trim()
            .toLowerCase()
        : "";

    const eligibility:
      ReviewEligibility =
      rawEligibility ===
        "direct" ||
      rawEligibility ===
        "indirect" ||
      rawEligibility ===
        "spec_only" ||
      rawEligibility ===
        "product_mismatch" ||
      rawEligibility ===
        "uncertain"
        ? rawEligibility
        : "legacy_direct";

    if (
      eligibility ===
      "legacy_direct"
    ) {
      reviewEligibilityMissingCount +=
        1;
    }

    reviewEligibilityCounts[
      eligibility
    ] +=
      1;

    const scoreEligible =
      eligibility ===
        "direct" ||
      eligibility ===
        "legacy_direct";

    if (scoreEligible) {
      scoringEligibleReviewCount +=
        1;
    } else {
      scoringExcludedReviewCount +=
        1;
    }

    const rawAssessments =
      Array.isArray(
        row.a,
      )
        ? row.a
        : (
            Array.isArray(
              row.criterionAssessments,
            )
              ? row
                  .criterionAssessments
              : []
          );

    rawCriterionSlotCount +=
      rawAssessments.length;

    const seenAliases =
      new Set<string>();

    const criterionAssessments:
      BatchCriterionAssessment[] =
      [];

    const normalizedEvidence:
      BatchReviewEvidence[] =
      [];

    const evidenceDedup =
      new Set<string>();

    const acceptEvidenceIds = (
      alias: string,
      criterionKey: string,
      polarity:
        "+" |
        "-" |
        "0",
      rawIds: unknown,
    ) => {
      const ids =
        normalizeUniqueSegmentIds(
          rawIds,
        );

      const acceptedIds:
        number[] =
        [];

      for (
        const segmentId of
        ids
      ) {
        const segment =
          segmentById.get(
            segmentId,
          );

        if (!segment) {
          invalidSegmentReferenceCount +=
            1;

          invalidSegmentReferenceRefs.push(
            `${reviewNumber}:${alias}:${segmentId}:${polarity}`,
          );

          continue;
        }

        if (
          !isCriterionEvidenceSegmentPlausible(
            criterionKey,
            segment.text,
          )
        ) {
          criterionGuardRejectedCount +=
            1;

          continue;
        }

        const normalizedPolarities =
          normalizePolarities(
            criterionKey,
            segment.text,
            polarity,
          );

        let accepted =
          false;

        for (
          const normalizedPolarity of
          normalizedPolarities
        ) {
          const dedupKey =
            `${alias}|${normalizedPolarity}|${segmentId}`;

          if (
            evidenceDedup.has(
              dedupKey,
            )
          ) {
            continue;
          }

          evidenceDedup.add(
            dedupKey,
          );

          normalizedEvidence.push({
            criterionAlias:
              alias,
            polarity:
              normalizedPolarity,
            quote:
              segment.text,
            segmentId,
          });

          acceptedEvidenceCount +=
            1;

          accepted =
            true;
        }

        if (
          accepted
        ) {
          acceptedIds.push(
            segmentId,
          );
        }
      }

      return acceptedIds;
    };

    for (
      const rawAssessment of
      rawAssessments
    ) {
      const assessment =
        asRecord(
          rawAssessment,
        );

      if (!assessment) {
        invalidCriterionAliasCount +=
          1;

        continue;
      }

      const aliasRaw =
        typeof assessment.c ===
          "string"
          ? assessment.c
          : (
              typeof assessment
                .criterionAlias ===
                "string"
                ? assessment
                    .criterionAlias
                : ""
            );

      const alias =
        aliasRaw
          .trim()
          .toLowerCase();

      const aliasMatch =
        /^c(\d+)$/.exec(
          alias,
        );

      if (!aliasMatch) {
        invalidCriterionAliasCount +=
          1;

        continue;
      }

      const criterionIndex =
        Number(
          aliasMatch[1],
        ) -
        1;

      if (
        !Number.isSafeInteger(
          criterionIndex,
        ) ||
        criterionIndex <
          0 ||
        criterionIndex >=
          criterionKeys.length
      ) {
        invalidCriterionAliasCount +=
          1;

        continue;
      }

      if (
        seenAliases.has(
          alias,
        )
      ) {
        duplicateCriterionSlots.push(
          `${reviewNumber}:${alias}`,
        );

        continue;
      }

      seenAliases.add(
        alias,
      );

      const criterionKey =
        criterionKeys[
          criterionIndex
        ];

      const positiveSegmentIds =
        acceptEvidenceIds(
          alias,
          criterionKey,
          "+",
          assessment.p ??
            assessment
              .positiveSegmentIds,
        );

      const negativeSegmentIds =
        acceptEvidenceIds(
          alias,
          criterionKey,
          "-",
          assessment.n ??
            assessment
              .negativeSegmentIds,
        );

      const neutralSegmentIds =
        acceptEvidenceIds(
          alias,
          criterionKey,
          "0",
          assessment.u ??
            assessment
              .neutralSegmentIds,
        );

      const rawRejectedIds =
        normalizeUniqueSegmentIds(
          assessment.r ??
            assessment
              .rejectedCandidateSegmentIds,
        );

      const candidateSet =
        new Set(
          candidates[
            alias
          ] ??
          [],
        );

      const rejectedCandidateSegmentIds:
        number[] =
        [];

      for (
        const segmentId of
        rawRejectedIds
      ) {
        if (
          !segmentById.has(
            segmentId,
          ) ||
          !candidateSet.has(
            segmentId,
          )
        ) {
          invalidRejectedCandidateCount +=
            1;

          invalidRejectedCandidateRefs.push(
            `${reviewNumber}:${alias}:${segmentId}`,
          );

          continue;
        }

        rejectedCandidateSegmentIds.push(
          segmentId,
        );
      }

      const selectedIds =
        new Set(
          [
            ...positiveSegmentIds,
            ...negativeSegmentIds,
            ...neutralSegmentIds,
          ],
        );

      const rejectedSet =
        new Set(
          rejectedCandidateSegmentIds,
        );

      for (
        const candidateId of
        candidateSet
      ) {
        if (
          selectedIds.has(
            candidateId,
          )
        ) {
          candidateSelectedCount +=
            1;

          continue;
        }

        if (
          rejectedSet.has(
            candidateId,
          )
        ) {
          candidateRejectedCount +=
            1;

          continue;
        }

        const candidateSegment =
          segmentById.get(
            candidateId,
          );

        const fallbackPolarities =
          candidateSegment
            ? classifyUnaccountedCandidateFallback(
                criterionKey,
                candidateSegment.text,
              )
            : [];

        let fallbackAccepted =
          false;

        if (
          candidateSegment &&
          fallbackPolarities.length >
            0
        ) {
          for (
            const fallbackPolarity of
            fallbackPolarities
          ) {
            const normalizedPolarities =
              normalizePolarities(
                criterionKey,
                candidateSegment.text,
                fallbackPolarity,
              );

            for (
              const normalizedPolarity of
              normalizedPolarities
            ) {
              const dedupKey =
                `${alias}|${normalizedPolarity}|${candidateId}`;

              if (
                !evidenceDedup.has(
                  dedupKey,
                )
              ) {
                evidenceDedup.add(
                  dedupKey,
                );

                normalizedEvidence.push({
                  criterionAlias:
                    alias,
                  polarity:
                    normalizedPolarity,
                  quote:
                    candidateSegment.text,
                  segmentId:
                    candidateId,
                });

                acceptedEvidenceCount +=
                  1;
              }

              if (
                normalizedPolarity ===
                  "+" &&
                !positiveSegmentIds.includes(
                  candidateId,
                )
              ) {
                positiveSegmentIds.push(
                  candidateId,
                );
              }

              if (
                normalizedPolarity ===
                  "-" &&
                !negativeSegmentIds.includes(
                  candidateId,
                )
              ) {
                negativeSegmentIds.push(
                  candidateId,
                );
              }

              if (
                normalizedPolarity ===
                  "0" &&
                !neutralSegmentIds.includes(
                  candidateId,
                )
              ) {
                neutralSegmentIds.push(
                  candidateId,
                );
              }

              fallbackAccepted =
                true;
            }
          }
        }

        if (
          fallbackAccepted
        ) {
          selectedIds.add(
            candidateId,
          );

          candidateSelectedCount +=
            1;

          fallbackSelectedCandidateCount +=
            1;

          fallbackSelectedCandidateRefs.push(
            `${reviewNumber}:${alias}:${candidateId}`,
          );

          continue;
        }

        rejectedCandidateSegmentIds.push(
          candidateId,
        );

        rejectedSet.add(
          candidateId,
        );

        candidateRejectedCount +=
          1;

        fallbackRejectedCandidateCount +=
          1;

        fallbackRejectedCandidateRefs.push(
          `${reviewNumber}:${alias}:${candidateId}`,
        );
      }

      criterionAssessments.push({
        criterionAlias:
          alias,
        positiveSegmentIds,
        negativeSegmentIds,
        neutralSegmentIds,
        rejectedCandidateSegmentIds,
      });

      normalizedCriterionSlotCount +=
        1;
    }

    for (
      let criterionIndex =
        0;
      criterionIndex <
        criterionKeys.length;
      criterionIndex++
    ) {
      const alias =
        criterionAlias(
          criterionIndex,
        );

      if (
        !seenAliases.has(
          alias,
        )
      ) {
        missingCriterionSlots.push(
          `${reviewNumber}:${alias}`,
        );
      }
    }

    criterionAssessments.sort(
      (
        left,
        right,
      ) =>
        Number(
          left
            .criterionAlias
            .slice(
              1,
            ),
        ) -
        Number(
          right
            .criterionAlias
            .slice(
              1,
            ),
        ),
    );

    const canonicalized =
      canonicalizeReviewEvidence(
        normalizedEvidence,
        criterionKeys,
      );

    canonicalPolarityChangedSegmentCount +=
      canonicalized
        .changedSegmentCount;

    canonicalConflictResolvedCount +=
      canonicalized
        .conflictResolvedCount;

    const scoringEvidence =
      scoreEligible
        ? canonicalized
            .evidence
        : [];

    canonicalEvidenceCount +=
      scoringEvidence
        .length;

    const canonicalCriterionAssessments =
      rebuildCriterionAssessmentsFromEvidence(
        scoringEvidence,
        criterionAssessments,
      );

    const tags =
      deriveCriterionTagsFromEvidence(
        scoringEvidence,
        criterionKeys,
      );

    const quality:
      "h" |
      "l" |
      "p" =
      rawQuality ===
        "h" ||
      rawQuality ===
        "l" ||
      rawQuality ===
        "p"
        ? rawQuality
        : (
            canonicalized
              .evidence
              .length >
              0
              ? "h"
              : "l"
          );

    rows.push({
      n:
        reviewNumber,
      q:
        quality,
      eligibility,
      tags,
      evidence:
        scoringEvidence,
      criterionAssessments:
        canonicalCriterionAssessments,
    });
  }

  rows.sort(
    (
      left,
      right,
    ) =>
      left.n -
      right.n,
  );

  const missingReviewNumbers:
    number[] =
    [];

  for (
    let reviewNumber =
      reviewStart;
    reviewNumber <=
      reviewEnd;
    reviewNumber++
  ) {
    if (
      !seenReviewNumbers.has(
        reviewNumber,
      )
    ) {
      missingReviewNumbers.push(
        reviewNumber,
      );
    }
  }

  const expectedReviewCount =
    reviewEnd -
    reviewStart +
    1;

  const expectedCriterionSlotCount =
    expectedReviewCount *
    criterionKeys.length;

  const complete =
    rows.length ===
      expectedReviewCount &&
    missingReviewNumbers
      .length ===
      0 &&
    duplicateReviewNumbers
      .size ===
      0 &&
    invalidReviewNumbers
      .length ===
      0 &&
    invalidQualityReviewNumbers
      .length ===
      0 &&
    missingCriterionSlots
      .length ===
      0 &&
    duplicateCriterionSlots
      .length ===
      0 &&
    invalidCriterionAliasCount ===
      0 &&
    candidateUnaccountedCount ===
      0 &&
    normalizedCriterionSlotCount ===
      expectedCriterionSlotCount;

  return {
    rows,

    audit: {
      expectedReviewCount,

      rawRowCount:
        rawRows.length,

      normalizedRowCount:
        rows.length,

      missingReviewNumbers,

      duplicateReviewNumbers:
        Array.from(
          duplicateReviewNumbers,
        ).sort(
          (
            left,
            right,
          ) =>
            left -
            right,
        ),

      invalidReviewNumbers,

      invalidQualityReviewNumbers,

      expectedCriterionSlotCount,

      rawCriterionSlotCount,

      normalizedCriterionSlotCount,

      missingCriterionSlots,

      duplicateCriterionSlots,

      invalidCriterionAliasCount,

      invalidSegmentReferenceCount,

      invalidSegmentReferenceRefs,

      softWarningCount:
        invalidSegmentReferenceCount +
        invalidRejectedCandidateCount,

      hasSoftWarnings:
        (
          invalidSegmentReferenceCount +
          invalidRejectedCandidateCount
        ) >
        0,

      invalidRejectedCandidateCount,

      invalidRejectedCandidateRefs,

      acceptedEvidenceCount,

      filteredEvidenceCount:
        criterionGuardRejectedCount,

      criterionGuardRejectedCount,

      candidateHintCount,

      candidateSelectedCount,

      candidateRejectedCount,

      candidateUnaccountedCount,

      candidateUnselectedCount:
        candidateRejectedCount +
        candidateUnaccountedCount,

      unaccountedCandidateRefs,

      fallbackSelectedCandidateCount,

      fallbackRejectedCandidateCount,

      fallbackSelectedCandidateRefs,

      fallbackRejectedCandidateRefs,

      polarityNormalizedCount,

      canonicalPolarityChangedSegmentCount,

      canonicalConflictResolvedCount,

      canonicalEvidenceCount,

      reviewEligibilityMissingCount,

      scoringEligibleReviewCount,

      scoringExcludedReviewCount,

      reviewEligibilityCounts,

      complete,
    },
  };
}

function buildCriterionEvidenceFromClassifications(
  classifications:
    BatchReviewClassification[],
  criterionKeys:
    string[],
  _rawSummaries: unknown,
) {
  const result:
    Record<
      string,
      CriterionEvidence
    > = {};

  for (
    let criterionIndex =
      0;
    criterionIndex <
      criterionKeys.length;
    criterionIndex++
  ) {
    const key =
      criterionKeys[
        criterionIndex
      ];

    const alias =
      criterionAlias(
        criterionIndex,
      );

    const positive:
      number[] =
      [];

    const negative:
      number[] =
      [];

    const mixed:
      number[] =
      [];

    const neutral:
      number[] =
      [];

    const positiveExcerpts:
      Array<{
        reviewNumber: number;
        polarity: "+" | "-" | "0";
        quote: string;
      }> =
      [];

    const negativeExcerpts:
      typeof positiveExcerpts =
      [];

    const neutralExcerpts:
      typeof positiveExcerpts =
      [];

    for (
      const classification of
      classifications
    ) {
      const criterionEvidence =
        classification.evidence.filter(
          (item) =>
            item.criterionAlias ===
            alias,
        );

      const hasPositive =
        criterionEvidence.some(
          (item) =>
            item.polarity ===
            "+",
        );

      const hasNegative =
        criterionEvidence.some(
          (item) =>
            item.polarity ===
            "-",
        );

      const hasNeutral =
        criterionEvidence.some(
          (item) =>
            item.polarity ===
            "0",
        );

      if (
        hasPositive &&
        hasNegative
      ) {
        mixed.push(
          classification.n,
        );
      } else if (
        hasPositive
      ) {
        positive.push(
          classification.n,
        );
      } else if (
        hasNegative
      ) {
        negative.push(
          classification.n,
        );
      } else if (
        hasNeutral
      ) {
        neutral.push(
          classification.n,
        );
      }

      for (
        const item of
        criterionEvidence
      ) {
        const excerpt = {
          reviewNumber:
            classification.n,
          polarity:
            item.polarity,
          quote:
            item.quote,
        };

        if (
          item.polarity ===
            "+" &&
          positiveExcerpts.length <
            2
        ) {
          positiveExcerpts.push(
            excerpt,
          );
        } else if (
          item.polarity ===
            "-" &&
          negativeExcerpts.length <
            2
        ) {
          negativeExcerpts.push(
            excerpt,
          );
        } else if (
          item.polarity ===
            "0" &&
          neutralExcerpts.length <
            1
        ) {
          neutralExcerpts.push(
            excerpt,
          );
        }
      }
    }

    const positiveOnly =
      Array.from(
        new Set(
          positive,
        ),
      ).sort(
        (
          left,
          right,
        ) =>
          left -
          right,
      );

    const negativeOnly =
      Array.from(
        new Set(
          negative,
        ),
      ).sort(
        (
          left,
          right,
        ) =>
          left -
          right,
      );

    const mixedNumbers =
      Array.from(
        new Set(
          mixed,
        ),
      ).sort(
        (
          left,
          right,
        ) =>
          left -
          right,
      );

    const neutralNumbers =
      Array.from(
        new Set(
          neutral,
        ),
      ).sort(
        (
          left,
          right,
        ) =>
          left -
          right,
      );

    const evidenceReviewNumbers =
      Array.from(
        new Set(
          [
            ...positiveOnly,
            ...negativeOnly,
            ...mixedNumbers,
            ...neutralNumbers,
          ],
        ),
      ).sort(
        (
          left,
          right,
        ) =>
          left -
          right,
      );

    result[
      key
    ] = {
      evidenceReviewNumbers,

      reviewEvidenceCount:
        evidenceReviewNumbers
          .length,

      positiveReviewNumbers:
        positiveOnly,

      negativeReviewNumbers:
        negativeOnly,

      mixedReviewNumbers:
        mixedNumbers,

      neutralReviewNumbers:
        neutralNumbers,

      evidenceExcerpts: [
        ...positiveExcerpts,
        ...negativeExcerpts,
        ...neutralExcerpts,
      ],

      summary:
        `직접 근거 ${evidenceReviewNumbers.length}개: 긍정 ${positiveOnly.length}, 부정 ${negativeOnly.length}, 혼합 ${mixedNumbers.length}, 중립 ${neutralNumbers.length}.`,
    };
  }

  return result;
}

function buildReviewQualityFromClassifications(
  classifications:
    BatchReviewClassification[],
) {
  let highInformationReviews =
    0;

  let lowInformationReviews =
    0;

  let promotionalStyleReviews =
    0;

  for (
    const classification of
    classifications
  ) {
    if (
      classification.q ===
      "h"
    ) {
      highInformationReviews +=
        1;
    } else if (
      classification.q ===
      "p"
    ) {
      promotionalStyleReviews +=
        1;
    } else {
      lowInformationReviews +=
        1;
    }
  }

  return {
    highInformationReviews,
    lowInformationReviews,
    promotionalStyleReviews,
  };
}

function normalizeBatchEvidenceAnalysis(
  raw:
    Record<
      string,
      unknown
    >,
  criterionKeys:
    string[],
  reviews:
    string[],
  reviewStart: number,
  reviewEnd: number,
) {
  const {
    rows:
      reviewClassifications,
    audit:
      classificationAudit,
  } =
    normalizeBatchReviewClassifications(
      raw.reviewClassifications,
      criterionKeys,
      reviews,
      reviewStart,
      reviewEnd,
    );

  const criterionEvidence =
    buildCriterionEvidenceFromClassifications(
      reviewClassifications,
      criterionKeys,
      raw.criterionSummaries,
    );

  const reviewQuality =
    buildReviewQualityFromClassifications(
      reviewClassifications,
    );

  return {
    ...raw,

    positivePoints:
      normalizeBatchPointEvidence(
        raw.positivePoints,
        reviewStart,
        reviewEnd,
      ),

    negativePoints:
      normalizeBatchPointEvidence(
        raw.negativePoints,
        reviewStart,
        reviewEnd,
      ),

    reviewClassifications,

    classificationAudit,

    reviewQuality,

    reviewQualityAudit: {
      expectedReviewCount:
        reviewEnd -
        reviewStart +
        1,

      classifiedReviewCount:
        reviewClassifications
          .length,

      mutuallyExclusive:
        true,

      countValid:
        classificationAudit
          .complete,
    },

    criterionEvidence,
  };
}

function normalizePointEvidence(
  raw: unknown,
  reviewCount: number,
) {
  if (
    !Array.isArray(
      raw,
    )
  ) {
    return [];
  }

  return raw
    .filter(
      (item) =>
        item &&
        typeof item ===
          "object" &&
        !Array.isArray(
          item,
        ),
    )
    .map(
      (item) => {
        const row =
          item as
            Record<
              string,
              unknown
            >;

        const evidenceReviewNumbers =
          normalizeEvidenceReviewNumbers(
            row
              .evidenceReviewNumbers,
            1,
            reviewCount,
          );

        return {
          ...row,

          evidenceReviewNumbers,

          evidenceCount:
            evidenceReviewNumbers
              .length,
        };
      },
    );
}

function auditReviewQuality(
  raw: unknown,
  reviewCount: number,
) {
  const row =
    raw &&
    typeof raw ===
      "object" &&
    !Array.isArray(
      raw,
    )
      ? (
          raw as
            Record<
              string,
              unknown
            >
        )
      : {};

  const safeCount = (
    value: unknown,
  ) => {
    const parsed =
      Number(value);

    return (
      Number.isSafeInteger(
        parsed,
      ) &&
      parsed >=
        0
    )
      ? parsed
      : 0;
  };

  const highInformationReviews =
    safeCount(
      row.highInformationReviews,
    );

  const lowInformationReviews =
    safeCount(
      row.lowInformationReviews,
    );

  const promotionalStyleReviews =
    safeCount(
      row.promotionalStyleReviews,
    );

  const classifiedReviewCount =
    highInformationReviews +
    lowInformationReviews +
    promotionalStyleReviews;

  return {
    reviewQuality: {
      highInformationReviews,
      lowInformationReviews,
      promotionalStyleReviews,
    },

    reviewQualityAudit: {
      expectedReviewCount:
        reviewCount,

      classifiedReviewCount,

      mutuallyExclusive:
        true,

      countValid:
        classifiedReviewCount ===
        reviewCount,
    },
  };
}

function collectReviewQualityFromBatches(
  batchResults:
    BatchAnalysisResult[],
  reviewCount: number,
) {
  let highInformationReviews =
    0;

  let lowInformationReviews =
    0;

  let promotionalStyleReviews =
    0;

  let classificationAuditPass =
    true;

  for (
    const batch of
    batchResults
  ) {
    const analysisRow =
      asRecord(
        batch.analysis,
      ) ??
      {};

    const qualityRow =
      asRecord(
        analysisRow
          .reviewQuality,
      ) ??
      {};

    highInformationReviews +=
      Number(
        qualityRow
          .highInformationReviews,
      ) ||
      0;

    lowInformationReviews +=
      Number(
        qualityRow
          .lowInformationReviews,
      ) ||
      0;

    promotionalStyleReviews +=
      Number(
        qualityRow
          .promotionalStyleReviews,
      ) ||
      0;

    const classificationAudit =
      asRecord(
        analysisRow
          .classificationAudit,
      );

    if (
      classificationAudit
        ?.complete !==
      true
    ) {
      classificationAuditPass =
        false;
    }
  }

  const classifiedReviewCount =
    highInformationReviews +
    lowInformationReviews +
    promotionalStyleReviews;

  return {
    reviewQuality: {
      highInformationReviews,
      lowInformationReviews,
      promotionalStyleReviews,
    },

    reviewQualityAudit: {
      expectedReviewCount:
        reviewCount,

      classifiedReviewCount,

      mutuallyExclusive:
        true,

      countValid:
        classifiedReviewCount ===
          reviewCount &&
        classificationAuditPass,

      source:
        "server-derived-from-per-review-classification",
    },
  };
}

function applyCriterionEvidenceFloor(
  analysis:
    Record<
      string,
      unknown
    >,
  criterionEvidence:
    Record<
      string,
      CriterionEvidence
    >,
  criterionKeys:
    string[],
  reviewCount: number,
) {
  const minimumEvidence =
    minimumCriterionEvidence(
      reviewCount,
    );

  const scoreRow =
    analysis.criterionScores &&
    typeof analysis.criterionScores ===
      "object" &&
    !Array.isArray(
      analysis.criterionScores,
    )
      ? (
          analysis
            .criterionScores as
            Record<
              string,
              number | null
            >
        )
      : {};

  const reasonRow =
    analysis.criterionReasons &&
    typeof analysis.criterionReasons ===
      "object" &&
    !Array.isArray(
      analysis.criterionReasons,
    )
      ? (
          analysis
            .criterionReasons as
            Record<
              string,
              string
            >
        )
      : {};

  const criterionScores = {
    ...scoreRow,
  };

  const criterionReasons = {
    ...reasonRow,
  };

  for (
    const key of
    criterionKeys
  ) {
    const evidenceCount =
      criterionEvidence[
        key
      ]?.reviewEvidenceCount ??
      0;

    if (
      evidenceCount <
      minimumEvidence
    ) {
      criterionScores[key] =
        null;

      criterionReasons[key] =
        `직접 근거 ${evidenceCount}건으로 최소 기준 ${minimumEvidence}건에 미달하여 점수를 산정하지 않습니다.`;
    }
  }

  return {
    ...analysis,

    criterionScores,

    criterionReasons,

    criterionScoring: {
      minimumEvidenceForScore:
        minimumEvidence,

      minimumEvidenceRule:
        "max(3, ceil(reviewCount * 0.01))",
    },
  };
}

const MAX_REVIEW_COUNT = 1000;
const REVIEW_BATCH_SIZE = 50;
const REVIEW_TEXT_LIMIT = 2500;

type BatchAnalysisResult = {
  batchIndex: number;
  reviewStart: number;
  reviewEnd: number;
  reviewCount: number;
  analysis: Record<
    string,
    unknown
  >;
};

type ReviewAnalysisExecutionMode =
  | "full"
  | "batch"
  | "aggregate"
  | "replay";

type AnalysisUsage = {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

type AnalysisCallResult = {
  analysis: Record<
    string,
    unknown
  >;
  usage: AnalysisUsage;
  responseId: string;
  responseStatus: string;
  rawOutputText: string;
};

type AnalysisFailureDetails = {
  label: string;
  responseId: string;
  responseStatus: string;
  incompleteReason: string;
  rawOutputText: string;
  usage: AnalysisUsage;
};

class AnalysisResponseError
  extends Error {
  details:
    AnalysisFailureDetails;

  constructor(
    message: string,
    details:
      AnalysisFailureDetails,
  ) {
    super(
      message,
    );

    this.name =
      "AnalysisResponseError";

    this.details =
      details;
  }
}

const REVIEW_BATCH_MODEL =
  process.env
    .REVIEW_ANALYSIS_BATCH_MODEL
    ?.trim() ||
  "gpt-5-mini";

const REVIEW_AGGREGATE_MODEL =
  process.env
    .REVIEW_ANALYSIS_AGGREGATE_MODEL
    ?.trim() ||
  "gpt-5";

function safeUsageCount(
  value: unknown,
) {
  const parsed =
    Number(value);

  return (
    Number.isFinite(
      parsed,
    ) &&
    parsed >=
      0
  )
    ? Math.floor(
        parsed,
      )
    : 0;
}

function summarizeUsage(
  calls:
    AnalysisUsage[],
) {
  return {
    callCount:
      calls.length,

    inputTokens:
      calls.reduce(
        (
          total,
          call,
        ) =>
          total +
          call.inputTokens,
        0,
      ),

    cachedInputTokens:
      calls.reduce(
        (
          total,
          call,
        ) =>
          total +
          call.cachedInputTokens,
        0,
      ),

    outputTokens:
      calls.reduce(
        (
          total,
          call,
        ) =>
          total +
          call.outputTokens,
        0,
      ),

    reasoningTokens:
      calls.reduce(
        (
          total,
          call,
        ) =>
          total +
          call.reasoningTokens,
        0,
      ),

    totalTokens:
      calls.reduce(
        (
          total,
          call,
        ) =>
          total +
          call.totalTokens,
        0,
      ),

    calls,
  };
}

function normalizeExecutionMode(
  value: unknown,
):
  | ReviewAnalysisExecutionMode
  | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "full";
  }

  if (
    value === "full" ||
    value === "batch" ||
    value === "aggregate" ||
    value === "replay"
  ) {
    return value;
  }

  return null;
}

function createAnalysisInputFingerprint(
  category: string,
  productName: string,
  dbProductId: string | null,
  originProductNo: number | null,
  reviews: string[],
  collectionStats:
    ReviewCollectionStats,
  dynamicCriteria:
    DynamicCriterion[],
) {
  const payload = {
    version:
      "strict-direct-evidence-cost-v2-7-8",
    batchModel:
      REVIEW_BATCH_MODEL,
    aggregateModel:
      REVIEW_AGGREGATE_MODEL,
    category,
    productName,
    dbProductId,
    originProductNo,
    reviews,
    collectionStats,
    dynamicCriteria,
    reviewBatchSize:
      REVIEW_BATCH_SIZE,
    reviewTextLimit:
      REVIEW_TEXT_LIMIT,
  };

  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        payload,
      ),
      "utf8",
    )
    .digest(
      "hex",
    );
}

function normalizeResumeBatchResults(
  raw: unknown,
  batches: string[][],
) {
  if (
    !Array.isArray(
      raw,
    )
  ) {
    throw new Error(
      "aggregate 모드에는 batchResults 배열이 필요합니다.",
    );
  }

  if (
    raw.length !==
    batches.length
  ) {
    throw new Error(
      `batchResults 개수 ${raw.length}건이 현재 batch 수 ${batches.length}건과 다릅니다.`,
    );
  }

  const rows =
    raw.map(
      (value) =>
        asRecord(
          value,
        ),
    );

  if (
    rows.some(
      (row) =>
        !row,
    )
  ) {
    throw new Error(
      "batchResults에 올바르지 않은 항목이 있습니다.",
    );
  }

  const result:
    BatchAnalysisResult[] =
    [];

  for (
    let index = 0;
    index <
    batches.length;
    index++
  ) {
    const expectedBatchIndex =
      index + 1;

    const expectedReviewStart =
      index *
        REVIEW_BATCH_SIZE +
      1;

    const expectedReviewCount =
      batches[index].length;

    const expectedReviewEnd =
      expectedReviewStart +
      expectedReviewCount -
      1;

    const row =
      rows.find(
        (candidate) =>
          Number(
            candidate
              ?.batchIndex,
          ) ===
          expectedBatchIndex,
      );

    if (!row) {
      throw new Error(
        `batchResults에서 batch ${expectedBatchIndex}를 찾지 못했습니다.`,
      );
    }

    const analysis =
      asRecord(
        row.analysis,
      );

    if (!analysis) {
      throw new Error(
        `batch ${expectedBatchIndex}의 analysis가 올바르지 않습니다.`,
      );
    }

    const classificationAudit =
      asRecord(
        analysis
          .classificationAudit,
      );

    if (
      classificationAudit
        ?.complete !==
      true
    ) {
      throw new Error(
        `batch ${expectedBatchIndex}의 per-review classification audit가 PASS가 아닙니다.`,
      );
    }

    if (
      !Number.isFinite(
        Number(
          classificationAudit
            ?.acceptedEvidenceCount,
        ),
      ) ||
      Number(
        classificationAudit
          ?.acceptedEvidenceCount,
      ) <
        0
    ) {
      throw new Error(
        `batch ${expectedBatchIndex}의 grounded evidence audit 정보가 없습니다.`,
      );
    }

    if (
      Number(
        classificationAudit
          ?.candidateUnaccountedCount,
      ) !==
        0 ||
      Number(
        classificationAudit
          ?.invalidRejectedCandidateCount,
      ) !==
        0
    ) {
      throw new Error(
        `batch ${expectedBatchIndex}의 candidate accounting audit가 PASS가 아닙니다.`,
      );
    }

    if (
      Number(
        row.reviewStart,
      ) !==
        expectedReviewStart ||
      Number(
        row.reviewEnd,
      ) !==
        expectedReviewEnd ||
      Number(
        row.reviewCount,
      ) !==
        expectedReviewCount
    ) {
      throw new Error(
        `batch ${expectedBatchIndex}의 리뷰 범위 또는 개수가 현재 저장 리뷰와 일치하지 않습니다.`,
      );
    }

    result.push({
      batchIndex:
        expectedBatchIndex,
      reviewStart:
        expectedReviewStart,
      reviewEnd:
        expectedReviewEnd,
      reviewCount:
        expectedReviewCount,
      analysis,
    });
  }

  return result;
}

function cleanReview(
  review: string,
) {
  return review
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .slice(
      0,
      REVIEW_TEXT_LIMIT,
    );
}

function normalizeReviewCorpus(
  value: unknown,
) {
  return Array.isArray(
    value,
  )
    ? Array.from(
        new Set(
          value
            .filter(
              (
                review,
              ): review is string =>
                typeof review ===
                  "string" &&
                review.trim()
                  .length > 0,
            )
            .map(
              cleanReview,
            )
            .filter(
              Boolean,
            ),
        ),
      ).slice(
        0,
        MAX_REVIEW_COUNT,
      )
    : [];
}

function chunkReviews(
  reviews: string[],
) {
  const batches:
    string[][] = [];

  for (
    let start = 0;
    start <
    reviews.length;
    start +=
    REVIEW_BATCH_SIZE
  ) {
    batches.push(
      reviews.slice(
        start,
        start +
          REVIEW_BATCH_SIZE,
      ),
    );
  }

  return batches;
}

function buildBatchResponseJsonSchema(
  criterionKeys:
    string[],
  reviewCount: number,
) {
  const aliases =
    criterionKeys.map(
      (
        _criterionKey,
        index,
      ) =>
        criterionAlias(
          index,
        ),
    );

  return {
    type:
      "object",

    additionalProperties:
      false,

    properties: {
      batchIndex: {
        type:
          "integer",
      },

      reviewCount: {
        type:
          "integer",
      },

      reviewClassifications: {
        type:
          "array",

        minItems:
          reviewCount,

        maxItems:
          reviewCount,

        items: {
          type:
            "object",

          additionalProperties:
            false,

          properties: {
            n: {
              type:
                "integer",
            },

            q: {
              type:
                "string",

              enum: [
                "h",
                "l",
                "p",
              ],
            },

            e: {
              type:
                "string",

              enum: [
                "direct",
                "indirect",
                "spec_only",
                "product_mismatch",
                "uncertain",
              ],
            },

            a: {
              type:
                "array",

              minItems:
                criterionKeys.length,

              maxItems:
                criterionKeys.length,

              items: {
                type:
                  "object",

                additionalProperties:
                  false,

                properties: {
                  c: {
                    type:
                      "string",

                    enum:
                      aliases,
                  },

                  p: {
                    type:
                      "array",

                    items: {
                      type:
                        "integer",
                    },
                  },

                  n: {
                    type:
                      "array",

                    items: {
                      type:
                        "integer",
                    },
                  },

                  u: {
                    type:
                      "array",

                    items: {
                      type:
                        "integer",
                    },
                  },

                  r: {
                    type:
                      "array",

                    items: {
                      type:
                        "integer",
                    },
                  },
                },

                required: [
                  "c",
                  "p",
                  "n",
                  "u",
                  "r",
                ],
              },
            },
          },

          required: [
            "n",
            "q",
            "e",
            "a",
          ],
        },
      },
    },

    required: [
      "batchIndex",
      "reviewCount",
      "reviewClassifications",
    ],
  };
}

function readAnalysisUsage(
  response:
    Record<
      string,
      unknown
    >,
  model: string,
):
  AnalysisUsage {
  const usageRow =
    asRecord(
      response.usage,
    );

  const inputDetails =
    asRecord(
      usageRow
        ?.input_tokens_details,
    );

  const outputDetails =
    asRecord(
      usageRow
        ?.output_tokens_details,
    );

  return {
    model,

    inputTokens:
      safeUsageCount(
        usageRow
          ?.input_tokens,
      ),

    cachedInputTokens:
      safeUsageCount(
        inputDetails
          ?.cached_tokens,
      ),

    outputTokens:
      safeUsageCount(
        usageRow
          ?.output_tokens,
      ),

    reasoningTokens:
      safeUsageCount(
        outputDetails
          ?.reasoning_tokens,
      ),

    totalTokens:
      safeUsageCount(
        usageRow
          ?.total_tokens,
      ),
  };
}

async function requestJsonAnalysis(
  client: OpenAI,
  prompt: string,
  label: string,
  model: string,
  jsonSchema?:
    Record<
      string,
      unknown
    >,
): Promise<
  AnalysisCallResult
> {
  const response =
    await client.responses.create(
      {
        model,

        input:
          prompt,

        text: {
          format:
            jsonSchema
              ? {
                  type:
                    "json_schema",

                  name:
                    "project_d_review_batch",

                  strict:
                    true,

                  schema:
                    jsonSchema,
                }
              : {
                  type:
                    "json_object",
                },
        },
      },
    );

  const responseRecord =
    response as unknown as
      Record<
        string,
        unknown
      >;

  const outputText =
    typeof response.output_text ===
      "string"
      ? response
          .output_text
          .trim()
      : "";

  const responseId =
    cleanText(
      responseRecord.id,
    );

  const responseStatus =
    cleanText(
      responseRecord.status,
    );

  const incompleteDetails =
    asRecord(
      responseRecord
        .incomplete_details,
    );

  const incompleteReason =
    cleanText(
      incompleteDetails
        ?.reason,
    );

  const usage =
    readAnalysisUsage(
      responseRecord,
      model,
    );

  const failureDetails:
    AnalysisFailureDetails = {
    label,
    responseId,
    responseStatus,
    incompleteReason,
    rawOutputText:
      outputText,
    usage,
  };

  if (
    responseStatus ===
      "incomplete"
  ) {
    throw new AnalysisResponseError(
      `${label}: AI 응답이 완료되지 않았습니다.${
        incompleteReason
          ? ` (${incompleteReason})`
          : ""
      }`,
      failureDetails,
    );
  }

  if (!outputText) {
    throw new AnalysisResponseError(
      `${label}: AI가 분석 결과를 반환하지 않았습니다.`,
      failureDetails,
    );
  }

  let analysis:
    Record<
      string,
      unknown
    >;

  try {
    analysis =
      extractJson(
        outputText,
      );
  } catch {
    throw new AnalysisResponseError(
      `${label}: Structured Output을 JSON으로 해석하지 못했습니다.`,
      failureDetails,
    );
  }

  return {
    analysis,
    usage,
    responseId,
    responseStatus,
    rawOutputText:
      outputText,
  };
}


function buildBatchPrompt(
  category: string,
  productName: string,
  dynamicCriteria:
    DynamicCriterion[],
  criterionKeys:
    string[],
  reviews: string[],
  batchIndex: number,
  totalBatches: number,
  reviewStart: number,
  reviewEnd: number,
) {
  const aliasCriteria =
    dynamicCriteria.map(
      (
        criterion,
        index,
      ) => ({
        alias:
          criterionAlias(
            index,
          ),
        key:
          criterion.key,
        label:
          criterion.label,
        shortDescription:
          criterion.shortDescription,
        helpText:
          criterion.helpText,
      }),
    );

  const aliasByKey =
    new Map(
      aliasCriteria.map(
        (
          criterion,
        ) => [
          criterion.key,
          criterion.alias,
        ],
      ),
    );

  const boundaryRules:
    string[] =
    [];

  const addBoundaryRule = (
    key: string,
    rule: string,
  ) => {
    const alias =
      aliasByKey.get(
        key,
      );

    if (alias) {
      boundaryRules.push(
        `${alias}: ${rule}`,
      );
    }
  };

  addBoundaryRule(
    "mopping_quality_and_coverage",
    "제품이 실제로 바닥을 물걸레질한 결과만 해당합니다. 얼룩/발자국/물자국 제거, 닦임 품질, 가장자리·모서리 닦임, 물방울을 흘리거나 물자국을 남기는 실패처럼 바닥 결과가 있어야 합니다. 사용자가 과거에 직접 물걸레질하기 힘들었다는 구매동기, '물걸레 기능이 있다', 스테이션이 걸레를 세척·건조한다는 내용만으로는 c1이 아닙니다.",
  );

  addBoundaryRule(
    "vacuum_pickup_and_hair_handling",
    "실제 먼지·부스러기·모래·머리카락·반려동물 털 흡입 결과, 카펫/러그 흡입 결과, 브러시 엉킴 경험이 해당합니다. '걸레를 빨다/빨아주다'의 빨다는 진공 흡입이 아닙니다. 구매 전 먼지나 털 때문에 힘들었다는 배경만으로는 c2가 아닙니다. Pa 숫자만 반복하고 실제 결과가 없으면 제외합니다.",
  );

  addBoundaryRule(
    "obstacle_avoidance_and_navigation_reliability",
    "실제 맵핑, 경로·동선, 장애물 회피, 문턱·매트 통과, 걸림·충돌·정지·위치인식 실패 경험이 해당합니다. 러그/매트라는 단어만 있고 흡입 이야기뿐이면 c3가 아닙니다. 위치인식 실패 때문에 도크로 돌아오지 못한 문제는 c3이며, 스테이션 유지관리(c4) 문제가 아닙니다.",
  );

  addBoundaryRule(
    "maintenance_automation_and_station_quality",
    "도크/스테이션의 먼지비움, 걸레 세척·건조, 물통·오수통 관리, 직배수/일반형 설치·사용 제약, 더스트백·세제·소모품, 스테이션 소음·공간·설치·관리부담의 실제 경험이 해당합니다. 단순히 '도크로 돌아가지 못했다'는 내비게이션 오류만으로는 c4가 아닙니다. 집 구조·전세·설치 여건 때문에 직배수를 못한 경우는 제품 결함이 아니라 중립(u)로 분류하세요.",
  );

  addBoundaryRule(
    "app_experience_and_reliability",
    "스마트폰 앱/어플 자체의 연결, UI, 맵·구역·금지구역 설정, 예약·원격제어, 앱 오류·펌웨어·안정성 경험이 해당합니다. 앱으로 외출 중 청소를 실행해 편했다는 것도 직접 앱 경험입니다. 제품 자체 음성명령/음성인식만 언급하거나 '앱 없이 음성으로 된다'는 내용은 c5가 아닙니다.",
  );

  const boundaryText =
    boundaryRules.length >
    0
      ? boundaryRules.join(
          "\n",
        )
      : "각 구매기준의 label, shortDescription, helpText에 직접 해당하는 실제 사용 경험만 근거로 선택하세요.";

  const preparedReviews =
    reviews.map(
      (
        review,
        index,
      ) => {
        const reviewNumber =
          reviewStart +
          index;

        const {
          segments,
          candidates,
        } =
          buildCriterionCandidateHints(
            review,
            criterionKeys,
          );

        return {
          reviewNumber,
          segments,
          candidates,
        };
      },
    );

  const reviewText =
    preparedReviews
      .map(
        (
          review,
        ) => {
          const segmentLines =
            review.segments
              .map(
                (segment) =>
                  `${segment.id}: ${segment.text}`,
              )
              .join(
                "\n",
              );

          const candidateLines =
            criterionKeys
              .map(
                (
                  _criterionKey,
                  criterionIndex,
                ) => {
                  const alias =
                    criterionAlias(
                      criterionIndex,
                    );

                  return `${alias} candidates=[${(
                    review
                      .candidates[
                        alias
                      ] ??
                    []
                  ).join(",")}]`;
                },
              )
              .join(
                " ",
              );

          return [
            `REVIEW ${review.reviewNumber}`,
            segmentLines,
            `HINTS ${candidateLines}`,
          ].join(
            "\n",
          );
        },
      )
      .join(
        "\n\n",
      );

  return `
당신은 Project D의 리뷰별 구매기준 판정 엔진입니다.

이번 batch는 ${reviews.length}개 리뷰입니다.
각 리뷰마다 모든 구매기준을 하나씩 반드시 확인합니다.
일부 기준만 골라서 반환하면 안 됩니다.

카테고리:
${category}

상품명:
${productName}

현재 batch:
${batchIndex + 1}/${totalBatches}

리뷰 번호 범위:
${reviewStart}~${reviewEnd}

구매기준:
${JSON.stringify(
  aliasCriteria,
)}

구매기준 경계:
${boundaryText}

리뷰는 sentence/segment id와 함께 제공됩니다.
HINTS의 candidate id는 서버가 recall을 높이기 위해 넓게 찾은 "반드시 검토할 후보"입니다.
candidate는 정답이 아니며 일부는 의도적으로 애매하거나 다른 criterion일 수 있습니다.
후보를 그대로 승인하는 것이 목적이 아닙니다.
각 candidate id는 반드시 p/n/u 중 하나로 선택하거나 r에 넣어 명시적으로 기각하세요.
candidate가 없어도 실제 직접근거가 있으면 다른 segment를 p/n/u로 선택할 수 있습니다.

실제 리뷰:
${reviewText}

반드시 지킬 규칙:

1. reviewClassifications에는 ${reviewStart}~${reviewEnd} 모든 리뷰를 번호 순서대로 정확히 ${reviews.length}행 반환하세요.

2. 각 리뷰 행에는 a 배열을 넣고,
   a에는 c1부터 c${criterionKeys.length}까지 정확히 ${criterionKeys.length}개 criterion slot을 순서대로 모두 반환하세요.
   어떤 기준도 생략하면 안 됩니다.

3. 각 criterion slot 형식:
   {"c":"c1","p":[긍정 segment id],"n":[부정 segment id],"u":[중립 segment id],"r":[기각한 candidate segment id]}

4. 직접근거가 없다고 판단한 criterion도 반드시
   {"c":"cN","p":[],"n":[],"u":[],"r":[...]}
   형태로 반환하세요.

5. p/n/u에는 현재 리뷰에 제공된 segment id만 넣으세요.
   원문 quote를 출력하지 마세요.
   서버가 segment id에서 원문을 직접 복원합니다.

6. HINTS에 candidate id가 하나라도 있으면 각 id를 반드시 처리하세요.
   직접근거라면 p/n/u 중 하나에 넣고,
   구매동기·단순사양·다른 criterion·일반만족 등이라면 r에 넣으세요.
   candidate id를 p/n/u/r 어디에도 넣지 않고 남겨두면 응답 검증에 실패합니다.

7. r에는 HINTS에 실제로 제시된 candidate id만 넣으세요.
   candidate가 아닌 id를 r에 넣으면 안 됩니다.
   candidate가 아닌 id를 실수로 r에 추가하더라도 서버는 그 id를 무시하고
   soft warning으로 기록합니다. 하지만 HINTS에 실제 존재하는 candidate는
   p/n/u/r 중 하나로 전부 처리해야 하며, 누락 candidate는 여전히 hard fail입니다.

8. 한 criterion에 긍정과 부정 경험이 모두 있으면
   p와 n을 둘 다 채우세요.
   둘 중 하나를 생략하지 마세요.
   서버가 mixed를 계산합니다.

9. 각 polarity마다 가장 직접적인 segment 1개를 우선 선택하세요.
   서로 다른 핵심 근거가 꼭 필요할 때만 최대 2개까지 선택하세요.
   같은 뜻을 반복하는 segment를 여러 개 넣지 마세요.

10. 다음 오분류를 특히 피하세요.
    - "먼지도", "인지도", "비싸지도", "티나지도" 안의 글자 "지도"는 map/navigation이 아닙니다.
    - "메인바퀴에 이물질 제거" 같은 오류 메시지는 진공 흡입(c2) 근거가 아닙니다.
    - 바닥을 물걸레로 닦아 이물질을 제거한 문장은 c1이며 c2가 아닙니다.
    - "도크로 돌아가 걸레를 세척/건조"는 c4이며 그 사실만으로 c3가 아닙니다.
    - 현재 제품이 "불편/아쉽/오작동/걸림/물자국"을 보인 직접 경험은 부정(n)으로 판정하세요.
    - 이전 모델이 불편했고 현재 제품이 개선됐다는 비교 문장은 현재 제품 기준 긍정(p)입니다.
    - 집 구조/전세/설치 여건 때문에 직배수를 못 쓰는 내용은 제품 결함이 아니므로 중립(u)입니다.

11. 일반 만족, 추천, 삶의 질, 구매동기, 배송/포장, 단순 사양 나열은
    세부 구매기준의 직접근거가 아닙니다.

12. REVIEW마다 c1→c${criterionKeys.length}를 차례로 검토한 뒤 다음 REVIEW로 넘어가세요.
    한 리뷰의 정보를 다른 리뷰에 복사하거나 추론하면 안 됩니다.

13. e는 "이 리뷰를 제품 점수 계산에 넣어도 되는가"를 뜻하는 Stage 0 판정입니다.
    q와 별개로, c1~c${criterionKeys.length}를 판정하기 전에 리뷰 전체를 먼저 읽고 결정하세요.

    Stage 0 판단 순서는 아래와 같습니다.

    A. 먼저 "누가 실제 사용자이고 어떤 제품을 실제 사용했는지"를 확정하세요.
       위에 표시된 상품명 "${productName}"이 이번 분석의 기준 상품입니다.

    B. 리뷰 본문이 현재 사용/구매한 제품을 "${productName}"이 아닌
       다른 브랜드나 다른 제품이라고 명시하면 product_mismatch입니다.
       예: "A 제품을 선택했다/구매했다/사용 중이다"에서 A가 분석 상품과
       명백히 다른 제품이면 product_mismatch입니다.
       단, "예전에는 A를 썼다", "A와 비교했다"처럼 과거 제품이나
       비교 대상으로 다른 제품을 언급한 것만으로는 product_mismatch가 아닙니다.

    C. 제품이 일치하면 작성자가 직접 사용자/직접 관찰자인지 확인하세요.
       선물한 사람, 부모, 자녀, 배우자, 형제, 지인 등 "다른 수령자"가 실제 사용자이고
       작성자는 그 사람의 반응·말·경험을 전달하는 것이 중심이면 indirect입니다.
       리뷰 중간에 주어가 생략된 1인칭처럼 보이는 문장이 있어도,
       앞뒤 문맥에서 다른 수령자가 실제 사용자임이 분명하면 indirect를 유지하세요.
       "좋다고 해요/좋아했어요/그렇대요/같대요/반응이 좋다/선물한 보람이 있다" 같은
       전언 표현은 중요한 단서입니다.
       반대로 선물한 리뷰라도 작성자가 "내가 직접 설치하고 여러 번 작동시켜
       청소 결과를 확인했다"처럼 자신의 직접 사용·관찰을 명확히 말하면 direct가 될 수 있습니다.

    D. 작성자가 직접 사용자라면 실제 성능을 검증했는지 확인하세요.
       direct는 "써보니/사용해보니/돌려보니/확인했다/실제로 ~됐다/직접 보니"처럼
       현재 제품을 작동시켜 얻은 구체 결과가 있어야 합니다.
       단순히 제품을 개봉·설치했다거나 디자인이 마음에 든다는 것만으로는
       c1~c5 성능의 direct 근거가 아닙니다.

    E. 구매 이유, 제품 설명, 기능·사양 bullet, 광고/상세페이지식 문구,
       기대·추측·미래형 표현이 중심이고 성능을 실제로 확인한 결과가 없다면 spec_only입니다.
       특히 "잘 사용해보겠습니다", "기대됩니다", "좋을 것 같습니다",
       "걱정 없겠더라고요", "~할 수 있다고 합니다", "~기술이 마음에 듭니다"는
       그 기능을 실제로 검증했다는 뜻이 아닙니다.
       기능명이 구체적이거나 문장이 긍정적이어도 실제 사용 결과가 아니면 spec_only입니다.

    - direct:
      분석 대상 상품을 리뷰 작성자가 직접 사용했거나 직접 작동시켜 관찰했고,
      c1~c${criterionKeys.length} 중 하나 이상에 대해 구체적인 실제 결과가 있는 리뷰.

    - indirect:
      분석 대상 상품의 사용 경험이 있더라도 작성자 자신이 아닌
      다른 수령자/가족/지인 등의 경험을 전달하는 것이 중심인 리뷰.

    - spec_only:
      분석 대상 상품은 맞지만 실제 성능 검증 없이
      구매 이유·사양·기능 소개·기대·홍보성 설명이 중심인 리뷰.

    - product_mismatch:
      리뷰가 "현재 구매/사용 제품"을 분석 대상 "${productName}"과
      명백히 다른 제품으로 지칭하는 리뷰.

    - uncertain:
      직접 사용자 여부 또는 현재 사용 제품의 정체성을
      본문만으로 신뢰성 있게 결정할 수 없는 리뷰.
      direct라고 추정해서 점수에 넣기보다 uncertain을 선택하세요.

    중요한 보수 원칙:
    "직접 사용이 명확하지 않으면 direct로 추정하지 마세요."
    제품 점수에 잘못된 리뷰를 넣는 것보다 uncertain/indirect/spec_only로
    제외하는 편을 우선합니다. 다만 리뷰 작성자의 실제 사용이 명백한 정상 리뷰를
    단지 문체가 짧거나 홍보처럼 보인다는 이유만으로 제외하지 마세요.

    direct가 아닌 리뷰의 a 배열도 구조상 c1~c${criterionKeys.length}를 모두 반환하고
    HINTS candidate를 p/n/u/r 중 하나로 처리하세요.
    서버가 e를 최종 scoring gate로 사용하므로,
    e가 direct가 아니면 해당 리뷰의 evidence/tags는 점수 집계에서 제외됩니다.

14. q:
    - h: 하나 이상의 구체적인 직접 사용 근거가 있고 정보량이 충분함
    - l: 기대/구매동기/일반 만족 중심이거나 세부 직접근거가 부족함
    - p: 사양·홍보·추천 문구 반복이 강하고 실제 사용 근거의 신뢰도가 낮음

15. criterionEvidence, criterionSummaries, positivePoints, negativePoints,
    점수, 추천문장, summary는 만들지 마세요.
    서버와 최종 aggregate가 처리합니다.

16. JSON만 출력하세요.

출력 형식:

{
  "batchIndex": ${batchIndex + 1},
  "reviewCount": ${reviews.length},
  "reviewClassifications": [
    {
      "n": ${reviewStart},
      "q": "h",
      "e": "direct",
      "a": [
        {"c":"c1","p":[1],"n":[],"u":[],"r":[]},
        {"c":"c2","p":[],"n":[],"u":[],"r":[]},
        {"c":"c3","p":[],"n":[],"u":[],"r":[]},
        {"c":"c4","p":[],"n":[],"u":[],"r":[]},
        {"c":"c5","p":[],"n":[],"u":[],"r":[]}
      ]
    }
  ]
}

위 한 행은 형식 예시일 뿐입니다.
실제 응답에는 ${reviews.length}개 리뷰를 전부 반환하고,
각 리뷰마다 정확히 ${criterionKeys.length}개의 criterion slot을 넣으세요.

사용 가능한 alias:
${aliasCriteria
  .map(
    (
      criterion,
    ) =>
      `${criterion.alias}=${criterion.key}`,
  )
  .join(", ")}
`;
}

function buildAggregatePrompt(
  category: string,
  productName: string,
  dynamicCriteria:
    DynamicCriterion[],
  criterionKeys:
    string[],
  totalReviewCount: number,
  batchResults:
    BatchAnalysisResult[],
  collectionStats:
    ReviewCollectionStats,
  frozenCriteriaPipeline: boolean,
) {
  const compactBatchResults =
    batchResults.map(
      (batch) => {
        const analysisRow =
          asRecord(
            batch.analysis,
          ) ??
          {};

        const {
          reviewClassifications:
            _reviewClassifications,
          ...compactAnalysis
        } =
          analysisRow;

        return {
          batchIndex:
            batch.batchIndex,
          reviewStart:
            batch.reviewStart,
          reviewEnd:
            batch.reviewEnd,
          reviewCount:
            batch.reviewCount,
          analysis:
            compactAnalysis,
        };
      },
    );

  const criteriaPipelineDescription =
    frozenCriteriaPipeline
      ? [
          'Stage0 결과가 e === "direct"인 리뷰만 frozen V1.4 c1-c5 분석으로 진행합니다. 제외된 non-direct 리뷰는 V1.4 c1-c5 분류를 받지 않습니다.',
          "frozen V1.4는 서버 소유 sentence/segment ID와 semantic evidence event를 사용하며, 서버가 선택된 근거를 검증하고 해당 ID를 원문 근거로 복원합니다.",
          "aggregate에 전달된 criterionEvidence 번호/개수, polarity, evidenceExcerpts는 검증된 V1.4 출력으로부터 deterministic production adapter가 구성한 값입니다.",
        ].join("\n")
      : [
          'Stage0 결과가 e === "direct"인 리뷰만 dynamic c1-c5 분석으로 진행합니다. 제외된 non-direct 리뷰는 dynamic criterion 분류를 받지 않습니다.',
          "dynamic c1-c5 엔진은 현재 카테고리 profile의 key, label, shortDescription, helpText를 의미 경계로 사용하고 서버 소유 sentence/segment ID와 semantic evidence event를 사용합니다.",
          "aggregate에 전달된 criterionEvidence 번호/개수, polarity, evidenceExcerpts는 검증된 dynamic criterion 출력으로부터 deterministic production adapter가 구성한 값입니다.",
        ].join("\n");

  return `
당신은 Project D의 리뷰 batch 통합 엔진입니다.

아래 내용은 같은 제품의 실제 리뷰 ${totalReviewCount}개를
최대 ${REVIEW_BATCH_SIZE}개씩 나누어 처리한 production pipeline의 집계 결과입니다.

Stage0 v5는 모든 리뷰에 대해 서버 소유 evidence span을 바탕으로 사실을 추출하고, 서버가 eligibility를 결정합니다.
${criteriaPipelineDescription}
evidenceExcerpts는 서버가 검증된 원문 segment에서 복원한 직접근거입니다.

reviewQuality는 Stage0-derived reviewQuality compatibility mapping에 따른 호환성 메타데이터이며, 서버가 Stage0 eligibility에서 결정적으로 계산합니다.
- highInformationReviews = direct
- promotionalStyleReviews = spec_only
- lowInformationReviews = indirect + product_mismatch + uncertain
aggregate 모델은 이 reviewQuality를 과거 모델의 q=h/l/p 분류로 재해석하거나 새로 판정하지 마세요. promotionalStyleReviews라는 필드명은 spec_only의 호환성 매핑이며 별도의 홍보성 판단을 뜻하지 않습니다.
임의로 번호·기능·원인을 추가하거나 삭제하지 마세요.

1차 batch는 비용 절감을 위해 점수·추천문장·주의사항을 만들지 않았습니다.
이 최종 통합 단계에서만 전체 summary, 점수, 이유,
cautions, bestFor, notFor를 생성하세요.

원문 리뷰를 다시 추측하지 말고,
오직 제공된 batch 분석 결과를 통합해서
제품 전체의 재사용 가능한 리뷰 분석을 만드세요.

카테고리:
${category}

상품명:
${productName}

총 실제 리뷰 수:
${totalReviewCount}

최종 구매기준 점수의 최소 직접 근거 수:
${minimumCriterionEvidence(
  totalReviewCount,
)}

수집 통계:
${JSON.stringify(
  collectionStats,
  null,
  2,
)}

카테고리 핵심 구매기준:
${JSON.stringify(
  dynamicCriteria,
  null,
  2,
)}

batch 분석 결과:
${JSON.stringify(
  compactBatchResults,
  null,
  2,
)}

통합 원칙:

1. 서로 다른 batch에서 반복되는 장점과 단점을 가장 강하게 반영하세요.
2. 한 batch에서만 소수로 나온 문제를 제품 전체의 확정적 결함처럼 표현하지 마세요.
3. positivePoints와 negativePoints의 evidenceReviewNumbers는 batch 결과에 실제로 존재하는 리뷰 번호만 합치고 중복을 제거하세요.
4. evidenceCount는 evidenceReviewNumbers의 중복 제거 후 개수와 정확히 같아야 합니다.
5. 같은 의미의 주제가 여러 batch에 표현만 다르게 등장하면 하나로 합치세요.
6. criterionEvidence.evidenceReviewNumbers는 각 batch가 반환한 "전체 직접근거 번호"를 모두 합치고 중복을 제거하세요. 일부 대표 번호만 다시 추려내지 마세요.
7. criterionEvidence.reviewEvidenceCount는 evidenceReviewNumbers의 중복 제거 후 개수와 정확히 같아야 합니다.
8. criterionEvidence.summary와 criterionReasons에는 batch 근거에 없는 기능명, 사양, 원인, 음성명령, 센서/카메라 종류 같은 세부사항을 새로 추가하지 마세요. 긍정과 부정 근거가 함께 있으면 양쪽을 반영하세요.
10. criterionScores는 전체 batch의 긍정/부정 근거와 반복성을 종합한 0~100 점수입니다.
10. 해당 구매기준의 직접 근거가 ${minimumCriterionEvidence(
  totalReviewCount,
)}건보다 적으면 criterionScores는 반드시 null로 두세요.
11. 배송, 포장, 판매자 응대는 제품 평가에 약하게 반영하세요.
12. criterionEvidence에는 해당 구매기준을 직접 설명하는 리뷰 번호만 유지하세요. "청소를 잘한다", "꼼꼼하다", "성능이 좋다", "만족한다" 같은 범용 평가는 특정 세부 구매기준의 직접 근거로 승격하지 마세요.
13. 복합 구매기준은 리뷰가 실제로 언급한 하위 항목만 근거로 인정하세요. 중요한 하위 항목에 직접 근거가 없으면 criterionReasons에 그 공백을 명확히 적고 점수를 과대평가하지 마세요.
14. 특히 흡입력·머리카락 처리 같은 구체 기준은 먼지 흡입 결과, 머리카락/반려털 처리, 카펫 흡입 등 직접 언급이 없으면 일반적인 "청소가 잘 된다" 리뷰만으로 점수를 만들지 마세요.
15. 앱, 장애물 회피, 스테이션, 맵핑 등도 해당 기능의 직접 사용경험이 있는 리뷰만 근거로 세세요.
16. cautions, bestFor, notFor도 batch 근거에 직접 연결되는 범위만 표현하세요. 일반적인 제품 상식이나 사양을 새로 추론하지 마세요.
17. 한 리뷰의 좁은 불만을 더 넓은 기능 문제로 확장하지 마세요.
18. reviewQuality의 highInformationReviews, lowInformationReviews, promotionalStyleReviews는 서로 겹치지 않는 분류입니다. 전체 리뷰를 정확히 한 분류에만 포함하고 세 값의 합이 ${totalReviewCount}와 정확히 같아야 합니다.
19. confidenceScore는 총 리뷰 수, 정보량, batch 간 반복성, 긍정/부정 근거 균형을 반영한 0~100 정수입니다.
20. 제공되지 않은 사실을 추가하거나 추측하지 마세요.
21. 입력된 구매기준 key만 사용하세요.
22. JSON만 출력하세요. 마크다운은 사용하지 마세요.

반드시 아래 JSON 구조로 반환하세요.

{
  "productName": "${productName}",
  "reviewCount": ${totalReviewCount},
  "summary": "전체 batch를 종합한 2~3문장 요약",
  "positivePoints": [
    {
      "topic": "장점 항목",
      "summary": "여러 batch에서 반복 확인된 실제 장점",
      "evidenceReviewNumbers": [1],
      "evidenceCount": 0
    }
  ],
  "negativePoints": [
    {
      "topic": "단점 항목",
      "summary": "여러 batch에서 반복 확인된 실제 단점",
      "evidenceReviewNumbers": [1],
      "evidenceCount": 0
    }
  ],
  "cautions": [
    "구매 전에 확인할 사항"
  ],
  "bestFor": [
    "이 제품이 잘 맞는 사용자"
  ],
  "notFor": [
    "이 제품이 잘 맞지 않는 사용자"
  ],
  "confidenceScore": 0,
  "reviewQuality": {
    "highInformationReviews": 0,
    "lowInformationReviews": 0,
    "promotionalStyleReviews": 0
  },
  "criterionEvidence": {
    "${criterionKeys[0]}": {
      "evidenceReviewNumbers": [1],
      "reviewEvidenceCount": 0,
      "summary": "전체 batch의 해당 구매기준 근거 요약"
    }
  },
  "criterionScores": {
    "${criterionKeys[0]}": null
  },
  "criterionReasons": {
    "${criterionKeys[0]}": "점수 또는 null의 이유"
  }
}

criterionEvidence,
criterionScores,
criterionReasons에는 아래 key를 전부 포함하세요.

${criterionKeys.join(
  ", ",
)}
`;
}

// Deterministic checkpoint contract gate, not a semantic reclassification pass.
function validateProductionCheckpoint(
  value: unknown,
  fingerprint: string,
  keys: string[],
  pipelineVersion: string,
) {
  const row = asRecord(value), analysis = asRecord(row?.analysis);
  const audit = asRecord(analysis?.classificationAudit), qualityAudit = asRecord(analysis?.reviewQualityAudit);
  const quality = asRecord(analysis?.reviewQuality), evidence = asRecord(analysis?.criterionEvidence);
  if (!row || row.inputFingerprint !== fingerprint || row.pipelineVersion !== pipelineVersion ||
      !analysis || analysis.pipelineVersion !== pipelineVersion ||
      analysis.reviewQualitySource !== PRODUCTION_REVIEW_QUALITY_SOURCE ||
      audit?.complete !== true || audit.source !== pipelineVersion ||
      audit.invalidSegmentReferenceCount !== 0 || qualityAudit?.countValid !== true ||
      qualityAudit.mutuallyExclusive !== true || qualityAudit.source !== PRODUCTION_REVIEW_QUALITY_SOURCE || !quality || !evidence) {
    throw new Error("Invalid/legacy production checkpoint; semantic fallback is forbidden.");
  }
  const count = Number(row.reviewCount), start = Number(row.reviewStart), end = Number(row.reviewEnd);
  if (!Number.isSafeInteger(count) || count < 1 || count > 50 || !Number.isSafeInteger(start) || start < 1 || end !== start + count - 1 ||
      qualityAudit.expectedReviewCount !== count || qualityAudit.classifiedReviewCount !== count) throw new Error("Checkpoint count mismatch.");
  const qualityCounts = [quality.highInformationReviews, quality.lowInformationReviews, quality.promotionalStyleReviews];
  if (qualityCounts.some(n => typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) ||
      qualityCounts.reduce<number>((sum,n) => sum + Number(n), 0) !== count) throw new Error("Checkpoint quality counts invalid.");
  for (const key of keys) {
    const slot = asRecord(evidence[key]);
    if (!slot || !Array.isArray(slot.evidenceReviewNumbers) || slot.reviewEvidenceCount !== slot.evidenceReviewNumbers.length) throw new Error("Checkpoint criterion evidence missing.");
    for (const field of ["evidenceReviewNumbers", "positiveReviewNumbers", "negativeReviewNumbers", "mixedReviewNumbers", "neutralReviewNumbers"]) {
      const ids = slot[field];
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(n => !Number.isSafeInteger(n) || n < start || n > end)) throw new Error("Checkpoint evidence range invalid.");
    }
    if (!Array.isArray(slot.evidenceExcerpts)) throw new Error("Checkpoint excerpts missing.");
  }
}

type ProductionCheckpointSource = Awaited<ReturnType<typeof runProductionReviewBatch>>;
function createProductionCheckpoint(
  production: ProductionCheckpointSource,
  index: number,
  inputFingerprint: string,
  pipelineVersion: string,
) {
  return { batchIndex: index + 1, reviewStart: production.reviewStart,
        reviewEnd: production.reviewEnd, reviewCount: production.reviewCount,
        inputFingerprint, pipelineVersion,
        analysis: { criterionEvidence: production.criterionEvidence, reviewQuality: production.reviewQuality,
          reviewQualityAudit: production.reviewQualityAudit, classificationAudit: production.classificationAudit,
          eligibilityCounts: production.eligibilityCounts, semanticVersions: production.semanticVersions,
          pipelineVersion: production.pipelineVersion, reviewQualitySource: production.reviewQualitySource } };
}
function createProductionReplayArtifacts(production: ProductionCheckpointSource) {
  const artifact = (stage: SavedProductionStageArtifact): SavedProductionStageArtifact => ({
    inputFingerprint: stage.inputFingerprint, rawModelOutputText: stage.rawModelOutputText,
    openAiResponse: stage.openAiResponse, apiUsage: stage.apiUsage,
  });
  return { stage0: artifact(production.stage0), criteria: production.criteria ? artifact(production.criteria) : null };
}

export async function POST(
  request: Request,
) {
  let paidApiCalls = 0;
  const paidUsages: AnalysisUsage[] = [];
  const completedProductionBatches: BatchAnalysisResult[] = [];
  let latestProduction: Awaited<ReturnType<typeof runProductionReviewBatch>> | null = null;
  try {
    const body =
      (
        await request.json()
      ) as ReviewAnalysisRequest;

    const requestedProductName =
      typeof body.productName ===
        "string"
        ? body.productName.trim()
        : "";

    const category =
      typeof body.category ===
        "string"
        ? body.category.trim()
        : "";

    const useStoredReviews =
      body.useStoredReviews ===
      true;

    const dryRun =
      body.dryRun ===
      true;

    const originProductNo =
      Number(
        body.originProductNo,
      );

    const hasOriginProductNo =
      Number.isSafeInteger(
        originProductNo,
      ) &&
      originProductNo >
        0;

    if (!category) {
      return NextResponse.json(
        {
          success: false,
          message:
            "카테고리가 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    let productName =
      requestedProductName;

    let reviewInput:
      unknown =
      body.reviews;

    let collectionStatsInput:
      unknown =
      body.collectionStats;

    let storedDbProductId:
      string | null =
      null;

    let storedOriginProductNo:
      number | null =
      null;

    let storedReviewRawDataPresent =
      false;

    let storedReviewCount =
      0;

    if (useStoredReviews) {
      if (
        !hasOriginProductNo &&
        !productName
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "저장 리뷰를 사용할 때는 originProductNo 또는 상품명이 필요합니다.",
          },
          {
            status: 400,
          },
        );
      }

      const serviceSupabase =
        getServiceSupabase();

      let productQuery =
        serviceSupabase
          .from(
            "products",
          )
          .select(
            "id, product_name, origin_product_no, review_raw_data",
          )
          .eq(
            "category",
            category,
          );

      if (hasOriginProductNo) {
        productQuery =
          productQuery.eq(
            "origin_product_no",
            originProductNo,
          );
      } else {
        productQuery =
          productQuery.eq(
            "product_name",
            productName,
          );
      }

      const {
        data: matchedProduct,
        error:
          matchedProductError,
      } =
        await productQuery
          .limit(
            1,
          )
          .maybeSingle();

      if (matchedProductError) {
        throw matchedProductError;
      }

      if (!matchedProduct) {
        return NextResponse.json(
          {
            success: false,
            message:
              "DB에서 저장 리뷰 대상 제품을 찾지 못했습니다.",
          },
          {
            status: 404,
          },
        );
      }

      const reviewRawData =
        asRecord(
          matchedProduct
            .review_raw_data,
        );

      const storedReviews =
        reviewRawData &&
        Array.isArray(
          reviewRawData.reviews,
        )
          ? reviewRawData.reviews
          : [];

      productName =
        cleanText(
          matchedProduct
            .product_name,
        ) ||
        productName;

      reviewInput =
        storedReviews;

      if (
        body.collectionStats ===
          undefined ||
        body.collectionStats ===
          null
      ) {
        collectionStatsInput =
          reviewRawData
            ?.collectionStats ??
          null;
      }

      storedDbProductId =
        cleanText(
          matchedProduct.id,
        ) ||
        null;

      const matchedOriginProductNo =
        Number(
          matchedProduct
            .origin_product_no,
        );

      storedOriginProductNo =
        Number.isSafeInteger(
          matchedOriginProductNo,
        ) &&
        matchedOriginProductNo >
          0
          ? matchedOriginProductNo
          : null;

      storedReviewRawDataPresent =
        reviewRawData !==
        null;

      storedReviewCount =
        storedReviews.length;
    }

    // Preserve physical review positions. Never deduplicate, trim, truncate or compact here.
    const rawReviews: unknown[] = Array.isArray(reviewInput) ? reviewInput : [];
    const numberingAudit = auditProductionReviewNumbering(rawReviews);
    if (!numberingAudit.compatible || rawReviews.length > MAX_REVIEW_COUNT) {
      return NextResponse.json({ success: false, stage: "precheck", paidApiCalls: 0,
        numberingAudit, message: "Production numbering audit/count failed; input was not renumbered." }, { status: 400 });
    }
    // Compatibility audit proves every entry is a surviving string; preserve exact raw text.
    const reviews = rawReviews as string[];

    const collectionStats =
      normalizeCollectionStats(
        collectionStatsInput,
        reviews.length,
      );

    if (!productName) {
      return NextResponse.json(
        {
          success: false,
          message:
            "상품명이 필요합니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      reviews.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            useStoredReviews
              ? "DB에 분석할 저장 리뷰가 없습니다."
              : "분석할 리뷰가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data: profile,
      error:
        profileError,
    } =
      await supabase
        .from(
          "category_profiles",
        )
        .select(
          "criteria",
        )
        .eq(
          "category",
          category,
        )
        .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    const dynamicCriteria =
      Array.isArray(
        profile?.criteria,
      )
        ? (
            profile.criteria as DynamicCriterion[]
          )
            .map(
              (
                criterion,
              ) => ({
                key:
                  typeof criterion.key ===
                    "string"
                    ? criterion.key.trim()
                    : "",

                label:
                  typeof criterion.label ===
                    "string"
                    ? criterion.label.trim()
                    : "",

                shortDescription:
                  typeof criterion.shortDescription ===
                    "string"
                    ? criterion.shortDescription.trim()
                    : "",

                helpText:
                  typeof criterion.helpText ===
                    "string"
                    ? criterion.helpText.trim()
                    : "",

                sourceType:
                  typeof criterion.sourceType ===
                    "string"
                    ? criterion.sourceType.trim()
                    : "",
              }),
            )
            .filter(
              (
                criterion,
              ) =>
                criterion.key &&
                criterion.label,
            )
            .slice(
              0,
              8,
            )
        : [];

    if (
      dynamicCriteria.length ===
      0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "이 카테고리의 구매기준이 아직 생성되지 않았습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const uniqueCriterionKeys =
      new Set(
        dynamicCriteria.map(
          criterion =>
            criterion.key,
        ),
      );

    if (
      dynamicCriteria.length !==
        5 ||
      uniqueCriterionKeys.size !==
        5
    ) {
      return NextResponse.json(
        {
          success:
            false,

          stage:
            "precheck",

          paidApiCalls:
            0,

          message:
            "Production review analysis requires exactly five unique category criteria.",
        },
        {
          status:
            400,
        },
      );
    }

    const pipelineVersion =
      productionReviewPipelineVersionForCriteria(
        dynamicCriteria,
      );

    const frozenCriteriaPipeline =
      pipelineVersion ===
        PRODUCTION_REVIEW_PIPELINE_VERSION;

    const criterionKeys =
      dynamicCriteria.map(
        (
          criterion,
        ) =>
          criterion.key,
      );

    const batches =
      chunkReviews(
        reviews,
      );

    const executionMode =
      normalizeExecutionMode(
        body.executionMode,
      );

    if (!executionMode) {
      return NextResponse.json(
        {
          success: false,
          message:
            "executionMode은 full, batch, aggregate, replay 중 하나여야 합니다.",
        },
        {
          status: 400,
        },
      );
    }

    const productionOriginProductNo = storedOriginProductNo ?? (hasOriginProductNo ? originProductNo : null);
    if (productionOriginProductNo === null) return NextResponse.json({ success: false, stage: "precheck", paidApiCalls: 0,
      message: "Production semantics require a valid originProductNo, including request-body input." }, { status: 400 });
    const productionProductId = storedDbProductId ?? ("request-body:" + productionOriginProductNo);
    const batchInput = (index: number) => ({ category, productName,
      dbProductId: productionProductId, originProductNo: productionOriginProductNo,
      rawReviews, reviewStart: index * REVIEW_BATCH_SIZE + 1,
      reviewEnd: Math.min((index + 1) * REVIEW_BATCH_SIZE, reviews.length), criteria: dynamicCriteria });
    const productionDryRuns = batches.map((_, index) => createProductionBatchDryRun(batchInput(index)));
    const inputFingerprint = createProductionPipelineFingerprint({ category, productName,
      dbProductId: productionProductId, originProductNo: productionOriginProductNo,
      rawReviews, collectionStats, criteria: dynamicCriteria, reviewBatchSize: REVIEW_BATCH_SIZE });
    const requestedInputFingerprint = cleanText(body.inputFingerprint);
    if (requestedInputFingerprint && requestedInputFingerprint !== inputFingerprint) {
      return NextResponse.json({ success: false, stage: "precheck", paidApiCalls: 0, inputFingerprint,
        message: "Production fingerprint mismatch. Legacy checkpoints are not accepted." }, { status: 409 });
    }
    const requestedBatchIndex = Number(body.batchIndex);
    if ((executionMode === "batch" || executionMode === "replay") &&
        (!Number.isSafeInteger(requestedBatchIndex) || requestedBatchIndex < 1 || requestedBatchIndex > batches.length)) {
      return NextResponse.json({ success: false, paidApiCalls: 0, message: "Invalid production batchIndex." }, { status: 400 });
    }
    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, paidApiCalls: 0, executionMode,
        pipelineVersion, reviewQualitySource: PRODUCTION_REVIEW_QUALITY_SOURCE,
        analysisModels: { stage0: productionDryRuns[0].stage0.model, batch: productionDryRuns[0].criteria.model, aggregate: REVIEW_AGGREGATE_MODEL },
        inputFingerprint, requestedBatchIndex: executionMode === "batch" || executionMode === "replay" ? requestedBatchIndex : null,
        inputSource: useStoredReviews ? "stored-db" : "request-body", category, productName,
        dbProductId: storedDbProductId, originProductNo: storedOriginProductNo,
        storedReviewRawDataPresent, storedReviewCount, analyzedReviewCount: reviews.length,
        collectionStats, criterionCount: dynamicCriteria.length, criterionKeys, batchSize: REVIEW_BATCH_SIZE,
        batchCount: batches.length, numberingAudit, productionDryRuns,
        reviewTextLimits: { stage0: 2500, criteria: 5000 },
        estimatedOpenAiCalls: executionMode === "full" ? 2 * batches.length + 1 : executionMode === "batch" ? 2 : executionMode === "aggregate" ? 1 : 0,
        replayAvailable: true, replayApiBlocker: false,
        minimumCriterionEvidence: minimumCriterionEvidence(reviews.length) });
    }
    // Offline replay returns before all client construction and paid paths.
    if (executionMode === "replay") {
      if (!requestedInputFingerprint || !body.replayArtifacts || !body.replayArtifacts.stage0 ||
          !("criteria" in body.replayArtifacts)) {
        return NextResponse.json({ success: false, executionMode, replay: true, paidApiCalls: 0,
          stage: "replay_precheck", message: "Current fingerprint and production-native replayArtifacts are required." }, { status: 400 });
      }
      const production = await replayProductionReviewBatch({ ...batchInput(requestedBatchIndex - 1),
        stage0: body.replayArtifacts.stage0, criteriaArtifact: body.replayArtifacts.criteria });
      const checkpoint = createProductionCheckpoint(production, requestedBatchIndex - 1, inputFingerprint, pipelineVersion);
      validateProductionCheckpoint(checkpoint, inputFingerprint, criterionKeys, pipelineVersion);
      return NextResponse.json({ success: true, executionMode: "replay", replay: true, paidApiCalls: 0,
        inputFingerprint, pipelineVersion,
        reviewQualitySource: PRODUCTION_REVIEW_QUALITY_SOURCE,
        historicalPaidApiCalls: production.historicalPaidApiCalls, apiUsage: production.apiUsage,
        historicalApiUsage: production.historicalApiUsage,
        batchResult: checkpoint, stage0: production.stage0, criteria: production.criteria,
        replayArtifacts: createProductionReplayArtifacts(production),
        classificationAudit: production.classificationAudit, batchCount: batches.length,
        analyzedReviewCount: reviews.length, dbProductId: storedDbProductId, originProductNo: storedOriginProductNo });
    }
    if (!requestedInputFingerprint) {
      return NextResponse.json({ success: false, paidApiCalls: 0, inputFingerprint,
        message: "All paid production modes require the current production dryRun fingerprint." }, { status: 400 });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, paidApiCalls: 0, message: "OPENAI_API_KEY is required." }, { status: 500 });
    const client = new OpenAI({ apiKey, maxRetries: 0 });
    const runBatch = async (index: number) => {
      const priorCalls = paidApiCalls;
      let production: Awaited<ReturnType<typeof runProductionReviewBatch>>;
      try {
        production = await runProductionReviewBatch({ ...batchInput(index), apiKey });
      } catch (error) {
        if (error instanceof ProductionPipelineError) {
          // Adapter errors may carry an internal zero; both stages have already run there.
          const currentCalls = error.details.stage === "adapter" || error.details.stage === "criteria_validation"
            ? Math.max(2, error.details.paidApiCalls)
            : error.details.stage === "stage0_validation" ? Math.max(1, error.details.paidApiCalls) : error.details.paidApiCalls;
          paidApiCalls = priorCalls + currentCalls;
          throw new ProductionPipelineError(error.message, { ...error.details, paidApiCalls });
        }
        // Unknown module failure: do not claim zero; retain conservative attempted-call ceiling.
        paidApiCalls = priorCalls + 2;
        throw error;
      }
      latestProduction = production;
      paidApiCalls = priorCalls + production.paidApiCalls;
      paidUsages.push(production.stage0.apiUsage);
      if (production.criteria) paidUsages.push(production.criteria.apiUsage);
      const checkpoint = createProductionCheckpoint(production, index, inputFingerprint, pipelineVersion);
      validateProductionCheckpoint(checkpoint, inputFingerprint, criterionKeys, pipelineVersion);
      completedProductionBatches.push(checkpoint);
      return { production, checkpoint };
    };
    if (executionMode === "batch") {
      const { production, checkpoint } = await runBatch(requestedBatchIndex - 1);
      return NextResponse.json({ success: true, executionMode, paidApiCalls, inputFingerprint,
        pipelineVersion, reviewQualitySource: PRODUCTION_REVIEW_QUALITY_SOURCE,
        inputSource: useStoredReviews ? "stored-db" : "request-body", dbProductId: storedDbProductId,
        originProductNo: storedOriginProductNo, productName, analyzedReviewCount: reviews.length,
        batchCount: batches.length, batchResult: checkpoint, stage0: production.stage0, criteria: production.criteria,
        replayArtifacts: createProductionReplayArtifacts(production),
        rawModelAnalysis: { stage0: production.stage0.rawModelAnalysis, criteria: production.criteria?.rawModelAnalysis ?? null },
        rawModelOutputText: { stage0: production.stage0.rawModelOutputText, criteria: production.criteria?.rawModelOutputText ?? null },
        openAiResponse: { stage0: production.stage0.openAiResponse, criteria: production.criteria?.openAiResponse ?? null },
        classificationAudit: production.classificationAudit, normalizationVersion: pipelineVersion,
        apiUsage: summarizeUsage(paidUsages) });
    }
    let batchResults: BatchAnalysisResult[];
    const apiUsageCalls = paidUsages;
    if (executionMode === "aggregate") {
      if (!Array.isArray(body.batchResults)) throw new Error("Production checkpoints required.");
      for (const row of body.batchResults) validateProductionCheckpoint(row, inputFingerprint, criterionKeys, pipelineVersion);
      // Existing structural range/completeness checks only; never old semantic normalization.
      batchResults = normalizeResumeBatchResults(body.batchResults, batches);
    } else {
      batchResults = [];
      for (let index = 0; index < batches.length; index++) {
        const { checkpoint } = await runBatch(index);
        batchResults.push(checkpoint);
      }
    }

    const aggregatePrompt =
      buildAggregatePrompt(
        category,
        productName,
        dynamicCriteria,
        criterionKeys,
        reviews.length,
        batchResults,
        collectionStats,
        frozenCriteriaPipeline,
      );

    paidApiCalls += 1; // Count attempted aggregate request even if transport/parsing fails.
    const aggregateCall =
      await requestJsonAnalysis(
        client,
        aggregatePrompt,
        `${productName} 최종 batch 통합`,
        REVIEW_AGGREGATE_MODEL,
      );

    apiUsageCalls.push(
      aggregateCall.usage,
    );

    const aggregateParsed =
      aggregateCall.analysis;

    const normalized =
      normalizeAnalysis(
        aggregateParsed,
        criterionKeys,
      );

    const evidenceNumbersByCriterion =
      collectCriterionEvidenceNumbers(
        batchResults,
        criterionKeys,
      );

    const criterionEvidence =
      normalizeCriterionEvidence(
        aggregateParsed
          .criterionEvidence,
        criterionKeys,
        reviews.length,
        evidenceNumbersByCriterion,
      );

    const evidenceFlooredAnalysis =
      applyCriterionEvidenceFloor(
        normalized,
        criterionEvidence,
        criterionKeys,
        reviews.length,
      );

    const {
      reviewQuality,
      reviewQualityAudit,
    } =
      collectReviewQualityFromBatches(
        batchResults,
        reviews.length,
      );

    const analysis = {
      ...evidenceFlooredAnalysis,

      pipelineVersion,

      inputFingerprint,

      reviewQualitySource:
        PRODUCTION_REVIEW_QUALITY_SOURCE,

      criterionEvidenceProvenance:
        batchResults.map(
          (batch) => {
            const batchAnalysisRow =
              asRecord(
                batch.analysis,
              ) ??
              {};

            return {
              batchIndex:
                batch.batchIndex,

              reviewStart:
                batch.reviewStart,

              reviewEnd:
                batch.reviewEnd,

              reviewCount:
                batch.reviewCount,

              criterionEvidence:
                asRecord(
                  batchAnalysisRow
                    .criterionEvidence,
                ) ??
                {},
            };
          },
        ),

      productName,

      reviewCount:
        reviews.length,

      positivePoints:
        normalizePointEvidence(
          aggregateParsed
            .positivePoints,
          reviews.length,
        ),

      negativePoints:
        normalizePointEvidence(
          aggregateParsed
            .negativePoints,
          reviews.length,
        ),

      reviewQuality,

      reviewQualityAudit: { ...reviewQualityAudit, source: PRODUCTION_REVIEW_QUALITY_SOURCE },

      criterionEvidence,

      collectionStats,

      batchAnalysis: {
        strategy:
          pipelineVersion,

        batchModel:
          REVIEW_BATCH_MODEL,

        aggregateModel:
          REVIEW_AGGREGATE_MODEL,

        totalReviews:
          reviews.length,

        batchSize:
          REVIEW_BATCH_SIZE,

        batchCount:
          batches.length,

        reviewTextLimits: { stage0: 2500, criteria: 5000 },
      },
    };

    return NextResponse.json({
      success: true,

      executionMode,

      paidApiCalls,
      pipelineVersion,
      reviewQualitySource: PRODUCTION_REVIEW_QUALITY_SOURCE,

      inputFingerprint,

      inputSource:
        useStoredReviews
          ? "stored-db"
          : "request-body",

      dbProductId:
        storedDbProductId,

      originProductNo:
        storedOriginProductNo,

      analysis,

      batchCount:
        batches.length,

      analyzedReviewCount:
        reviews.length,

      analysisModels: {
        batch:
          REVIEW_BATCH_MODEL,
        aggregate:
          REVIEW_AGGREGATE_MODEL,
      },

      apiUsage:
        summarizeUsage(
          apiUsageCalls,
        ),
    });
  } catch (error) {
    if (error instanceof ProductionPipelineError) {
      return NextResponse.json({ success: false, ...error.details, message: error.message,
        paidApiCalls: Math.max(paidApiCalls, error.details.paidApiCalls),
        completedBatchResults: completedProductionBatches,
        completedApiUsage: summarizeUsage(paidUsages) }, { status: 502 });
    }
    if (error instanceof AnalysisResponseError) {
      return NextResponse.json({ success: false, message: error.message, stage: "aggregate_response_validation",
        paidApiCalls, openAiResponse: { id: error.details.responseId, status: error.details.responseStatus,
          incompleteReason: error.details.incompleteReason }, rawModelOutputText: error.details.rawOutputText,
        apiUsage: summarizeUsage([...paidUsages, error.details.usage]),
        completedBatchResults: completedProductionBatches }, { status: 502 });
    }
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Production analysis failed.",
      paidApiCalls, apiUsage: summarizeUsage(paidUsages), completedBatchResults: completedProductionBatches,
      latestProduction,
      paidCallAccounting: "Attempted calls; unknown batch failure conservatively counts maximum two." }, { status: paidApiCalls > 0 ? 502 : 400 });
  }
}
