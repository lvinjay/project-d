import {
  discoverManufacturerProductUrl,
} from "./discoverManufacturerProductUrl";

import {
  parseManufacturerProductHtml,
} from "./parseManufacturerProductHtml";

import {
  isUsableManufacturerProduct,
  normalizeManufacturerProduct,
  type NormalizedManufacturerProduct,
} from "./normalizeManufacturerProduct";

export type ManufacturerCollectionResult =
  | {
      success: true;

      detail:
        NormalizedManufacturerProduct;

      discoveredUrl: string;

      candidatesChecked: number;
    }
  | {
      success: false;

      reason: string;

      candidatesChecked: number;
    };

export async function collectManufacturerProduct(
  input: {
    officialSite: string;

    searchTerms: string[];
  },
): Promise<ManufacturerCollectionResult> {
  const officialSite =
    String(
      input.officialSite ?? "",
    ).trim();

  const searchTerms =
    Array.isArray(
      input.searchTerms,
    )
      ? input.searchTerms
          .map(
            (value) =>
              String(
                value ?? "",
              ).trim(),
          )
          .filter(Boolean)
      : [];

  if (
    !officialSite ||
    searchTerms.length === 0
  ) {
    return {
      success: false,

      reason:
        "제조사 공식몰 주소 또는 상품 검색어가 없습니다.",

      candidatesChecked: 0,
    };
  }

  const discovered =
    await discoverManufacturerProductUrl(
      officialSite,
      searchTerms,
    );

  if (
    !discovered.success
  ) {
    return {
      success: false,

      reason:
        discovered.reason,

      candidatesChecked:
        discovered.candidatesChecked,
    };
  }

  const raw =
    parseManufacturerProductHtml(
      discovered.html,
      discovered.url,
    );

  const detail =
    normalizeManufacturerProduct(
      raw,
      discovered.url,
    );

  if (
    !isUsableManufacturerProduct(
      detail,
    )
  ) {
    return {
      success: false,

      reason:
        `제조사 공식몰 상세페이지는 찾았지만 필수 상품정보를 확보하지 못했습니다. ` +
        `[url=${Boolean(detail.canonicalUrl)}, title=${Boolean(detail.title)}, ` +
        `price=${detail.finalPrice}, model=${detail.modelName || "-"}]`,

      candidatesChecked:
        discovered.candidatesChecked,
    };
  }

  /*
    discover 단계가 공식사이트 안의 "관련 상품" 또는 프로모션 페이지를
    하나 찾았다는 이유만으로 성공시키지 않는다.

    route에서 전달되는 searchTerms는
    getStrongSearchModelTokens() 결과라 최대 2개이며,
    보통 "P70 + Pro", "S10 + MaxV", "X60 + Master" 형태다.

    최종 상세 title / modelName / URL 안에 이 토큰이 모두 있어야
    동일 모델 후보로 인정한다.
  */
  let decodedUrl =
    discovered.url;

  try {
    decodedUrl =
      decodeURIComponent(
        discovered.url,
      );
  } catch {
    // URL 디코딩 실패 시 원문을 사용한다.
  }

  const comparableDetailText =
    [
      detail.title,
      detail.modelName,
      decodedUrl,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(
        /[^a-z0-9가-힣]+/g,
        " ",
      );

  const normalizedSearchTerms =
    searchTerms
      .map(
        (term) =>
          term
            .toLowerCase()
            .replace(
              /[^a-z0-9가-힣]+/g,
              "",
            ),
      )
      .filter(Boolean);

  const missingSearchTerms =
    normalizedSearchTerms.filter(
      (term) =>
        !comparableDetailText
          .replace(
            /\s+/g,
            "",
          )
          .includes(term),
    );

  if (
    missingSearchTerms.length >
    0
  ) {
    return {
      success: false,

      reason:
        `제조사 공식몰 후보가 요청 모델과 일치하지 않습니다. ` +
        `[required=${normalizedSearchTerms.join("|") || "-"}, ` +
        `missing=${missingSearchTerms.join("|") || "-"}, ` +
        `title=${detail.title || "-"}]`,

      candidatesChecked:
        discovered.candidatesChecked,
    };
  }

  return {
    success: true,

    detail,

    discoveredUrl:
      discovered.url,

    candidatesChecked:
      discovered.candidatesChecked,
  };
}
