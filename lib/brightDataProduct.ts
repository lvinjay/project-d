const DATASET_ID =
  "gd_m9qqjxxr1hab7okefj";

type BrightDataProductInformation = {
  type?: string;
  value?: string;
};

type BrightDataReview = {
  rating?: number;
  rating_date?: string;
  review?: string;
  helpful_count?: number | null;
};

type BrightDataRawProduct = {
  url?: string;
  product_id?: string;

  /*
    include_errors=true 이므로 snapshot에 정상 상품 대신
    Bright Data 오류 레코드가 포함될 수 있다.
  */
  error?: string;
  error_code?: string;
  error_message?: string;
  message?: string;
  title?: string;
  original_price?: string | number;
  final_price?: string | number;
  discount_rate?: number;
  currency?: string;

  images?: {
    link?: string;
  }[];

  total_reviews?: number;
  average_rating?: number | null;

  sold_out?: boolean;

  sellers?: {
    seller_name?: string;
    final_price?: number;
    seller_link?: string;
  }[];

  product_information?: BrightDataProductInformation[];

  top_reviews?: BrightDataReview[];

  category_name?: string;
};

export type NormalizedNaverProduct = {
  url: string;
  productId: string;

  title: string;

  originalPrice: number;
  finalPrice: number;
  discountRate: number;

  currency: string;

  imageUrl: string;

  totalReviews: number;
  averageRating: number | null;

  soldOut: boolean;

  sellerName: string;

  sellers: {
    sellerName: string;
    finalPrice: number;
    sellerLink: string;
  }[];

  purchaseSeller: string;
  purchasePrice: number;
  purchaseUrl: string;

  brand: string;
  manufacturer: string;
  modelName: string;

  categoryName: string;

  topReviews: {
    rating: number;
    date: string;
    text: string;
    helpfulCount: number;
  }[];
};

function numberValue(
  value: unknown,
) {
  const parsed =
    Number(
      String(
        value ?? "",
      ).replace(
        /[^\d.]/g,
        "",
      ),
    );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function getProductInfo(
  items:
    | BrightDataProductInformation[]
    | undefined,
  key: string,
) {
  if (!Array.isArray(items)) {
    return "";
  }

  return (
    items.find(
      (item) =>
        item.type?.trim() ===
        key,
    )?.value?.trim() ?? ""
  );
}

function sleep(ms: number) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms),
  );
}

export async function collectNaverProduct(
  productUrl: string,
): Promise<NormalizedNaverProduct> {
  const apiKey =
    process.env.BRIGHTDATA_API_KEY;

  if (!apiKey) {
    throw new Error(
      "BRIGHTDATA_API_KEY가 설정되지 않았습니다.",
    );
  }

  const normalizedUrl =
    productUrl.trim();

  if (!normalizedUrl) {
    throw new Error(
      "상품 URL이 없습니다.",
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
            url: normalizedUrl,
          },
        ]),
        cache: "no-store",
      },
    );

  const triggerText =
    await triggerResponse.text();

  if (!triggerResponse.ok) {
    throw new Error(
      `Bright Data 실행 실패 (${triggerResponse.status}): ${triggerText}`,
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
    throw new Error(
      "Bright Data snapshot_id를 받지 못했습니다.",
    );
  }

  /*
    상품 1개 상세수집은
    최대 약 3분까지 기다린다.
  */
  for (
    let attempt = 1;
    attempt <= 36;
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
          cache: "no-store",
        },
      );

    if (!progressResponse.ok) {
      throw new Error(
        `Bright Data 진행상태 확인 실패 (${progressResponse.status})`,
      );
    }

    const progress =
      (await progressResponse.json()) as {
        status?: string;
        records?: number;
        errors?: number;
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
            cache: "no-store",
          },
        );

      if (!resultResponse.ok) {
        throw new Error(
          `Bright Data 결과 다운로드 실패 (${resultResponse.status})`,
        );
      }

      const result =
        (await resultResponse.json()) as
          BrightDataRawProduct[];

      const raw =
        Array.isArray(result)
          ? result[0]
          : undefined;

      if (!raw) {
        throw new Error(
          "Bright Data가 상품 정보를 반환하지 않았습니다.",
        );
      }

      /*
        include_errors=true 상태에서는 snapshot에 레코드가 존재해도
        실제 상품이 아니라 blocked/error 레코드일 수 있다.

        기존에는 이런 레코드도 정상 상품으로 파싱되어
        productId="", totalReviews=0, topReviews=[] 형태로
        조용히 반환될 수 있었다.

        오류 레코드는 여기서 명시적으로 실패시켜 상위 호출부가
        canonical fallback 및 진단 로그를 정확히 처리하게 한다.
      */
      const rawErrorCode =
        String(
          raw.error_code ??
            "",
        ).trim();

      const rawErrorMessage =
        String(
          raw.error_message ??
            raw.error ??
            raw.message ??
            "",
        ).trim();

      if (
        rawErrorCode ||
        rawErrorMessage
      ) {
        throw new Error(
          [
            "Bright Data 오류 레코드",
            rawErrorCode
              ? `code=${rawErrorCode}`
              : "",
            rawErrorMessage
              ? `message=${rawErrorMessage}`
              : "",
            `snapshot=${snapshotId}`,
            `url=${normalizedUrl}`,
          ]
            .filter(Boolean)
            .join(" | "),
        );
      }

      const originalPrice =
        numberValue(
          raw.original_price,
        );

      const finalPrice =
        numberValue(
          raw.final_price,
        );

      /*
        판매처 정보는 버리지 않고 보존한다.

        purchase*는 현재 단계에서는
        가격 > 0 + 판매 링크가 있는 판매처 중
        최저가를 선택한다.

        다음 단계에서 동일 모델/동일 구성 검증을
        추가해 옵션 낚시 가격을 걸러낸다.
      */
      const sellers =
        Array.isArray(raw.sellers)
          ? raw.sellers
              .map((seller) => ({
                sellerName:
                  seller.seller_name?.trim() ??
                  "",
                finalPrice:
                  numberValue(
                    seller.final_price,
                  ),
                sellerLink:
                  seller.seller_link?.trim() ??
                  "",
              }))
              .filter(
                (seller) =>
                  seller.finalPrice > 0 &&
                  Boolean(
                    seller.sellerLink,
                  ),
              )
              .sort(
                (a, b) =>
                  a.finalPrice -
                  b.finalPrice,
              )
          : [];

      const cheapestSeller =
        sellers[0];

      return {
        url:
          raw.url ??
          normalizedUrl,

        productId:
          raw.product_id ??
          "",

        title:
          raw.title ??
          "",

        /*
          사용자에게 보여줄 기본 가격은
          반드시 finalPrice를 사용한다.
        */
        originalPrice,

        finalPrice,

        discountRate:
          Number(
            raw.discount_rate ??
              0,
          ),

        currency:
          raw.currency ??
          "KRW",

        imageUrl:
          raw.images?.[0]
            ?.link ??
          "",

        totalReviews:
          Number(
            raw.total_reviews ??
              0,
          ),

        averageRating:
          typeof raw.average_rating ===
          "number"
            ? raw.average_rating
            : null,

        soldOut:
          Boolean(
            raw.sold_out,
          ),

        sellerName:
          cheapestSeller
            ?.sellerName ??
          raw.sellers?.[0]
            ?.seller_name ??
          "",

        sellers,

        purchaseSeller:
          cheapestSeller
            ?.sellerName ??
          "",

        purchasePrice:
          cheapestSeller
            ?.finalPrice ??
          0,

        purchaseUrl:
          cheapestSeller
            ?.sellerLink ??
          "",

        manufacturer:
          getProductInfo(
            raw.product_information,
            "제조사",
          ),

        brand:
          getProductInfo(
            raw.product_information,
            "브랜드",
          ),

        modelName:
          getProductInfo(
            raw.product_information,
            "모델명",
          ),

        categoryName:
          raw.category_name ??
          "",

        topReviews:
          Array.isArray(
            raw.top_reviews,
          )
            ? raw.top_reviews
                .slice(0, 20)
                .map(
                  (review) => ({
                    rating:
                      Number(
                        review.rating ??
                          0,
                      ),

                    date:
                      review.rating_date ??
                      "",

                    text:
                      review.review ??
                      "",

                    helpfulCount:
                      Number(
                        review.helpful_count ??
                          0,
                      ),
                  }),
                )
            : [],
      };
    }

    if (
      progress.status ===
      "failed"
    ) {
      throw new Error(
        `Bright Data 상품 수집 실패 (records=${progress.records ?? 0}, errors=${progress.errors ?? 0})`,
      );
    }

    await sleep(5000);
  }

  throw new Error(
    "Bright Data 상품 수집이 제한 시간 안에 완료되지 않았습니다.",
  );
}

