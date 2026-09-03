(() => {
  if (window.__PROJECT_D_SMARTSTORE_PROBE_LISTENER__) return;
  window.__PROJECT_D_SMARTSTORE_PROBE_LISTENER__ = true;

  let activeRequestId = "";
  let finished = false;
  let capturedReviewData = null;

  /*
   * 중요:
   * - 기존 시장 후보 검증은 shallow mode를 그대로 사용한다.
   * - deep mode는 DB 상품 확정 뒤에만 별도 호출한다.
   * - 따라서 현재 시장 후보 50~60개를 1,000개씩 수집하는 일은 없다.
   */
  let deepReviewMode = false;
  let targetReviewCount = 20;

  const MAX_DEEP_REVIEWS = 1000;
  const SHALLOW_REVIEW_LIMIT = 20;

  const accumulatedReviews = new Map();

  const NATIVE_FETCH_PAGE =
    "PROJECT_D_SMARTSTORE_NATIVE_REVIEW_FETCH_PAGE";

  let nativeResponseCount = 0;
  let nativeResponseSerial = 0;
  let nativeFirstPageSize = 0;
  let nativeTotalCount = 0;
  let lastNativeResponseAt = 0;

  const nativeCapturedPages =
    new Set();

  const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const getChannelProductNo = () =>
    location.pathname.match(/\/products\/(\d+)/)?.[1] || "";

  const cleanText = (value) =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const sendDone = (result, message = "") => {
    if (!activeRequestId || finished) return;

    finished = true;

    chrome.runtime.sendMessage(
      {
        type: "PROJECT_D_SMARTSTORE_PROBE_DONE",
        requestId: activeRequestId,
        result,
        message,
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
  };

  const normalizeReviews = (data) => {
    const candidates = [
      data?.contents,
      data?.content,
      data?.reviews,
      data?.productReviews,
      data?.data?.contents,
      data?.data?.content,
      data?.data?.reviews,
    ];

    return candidates.find(Array.isArray) || [];
  };

  const reviewKey = (review, index) => {
    const id = cleanText(review?.id);

    if (id) {
      return `id:${id}`;
    }

    const originProductNo =
      cleanText(review?.originProductNo);

    const productNo =
      cleanText(review?.productNo);

    const createDate =
      cleanText(review?.createDate);

    const text =
      cleanText(review?.reviewContent)
        .slice(0, 160);

    return [
      "fallback",
      originProductNo,
      productNo,
      createDate,
      text,
      String(index),
    ].join("|");
  };

  const mergeReviews = (reviews) => {
    let added = 0;

    reviews.forEach((review, index) => {
      const key =
        reviewKey(review, index);

      if (
        !key ||
        accumulatedReviews.has(key)
      ) {
        return;
      }

      accumulatedReviews.set(
        key,
        review,
      );

      added += 1;
    });

    return added;
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    const message = event.data;

    if (
      message?.type !==
      "PROJECT_D_SMARTSTORE_NATIVE_REVIEW_RESPONSE"
    ) {
      return;
    }

    if (
      message?.source !==
      "PROJECT_D_SMARTSTORE_MAIN_WORLD"
    ) {
      return;
    }

    if (Number(message.status) !== 200) return;

    const reviews =
      normalizeReviews(
        message.data,
      );

    const requestedPage =
      Number(
        message.requestedPage ||
        0,
      );

    if (
      requestedPage >
        0
    ) {
      nativeCapturedPages.add(
        requestedPage,
      );
    }

    if (
      nativeFirstPageSize ===
        0 &&
      reviews.length >
        0
    ) {
      nativeFirstPageSize =
        reviews.length;
    }

    const totalCountCandidates = [
      message.data?.totalCount,
      message.data?.totalElements,
      message.data?.data?.totalCount,
      message.data?.data?.totalElements,
      message.data?.summary?.totalCount,
      message.data?.summary?.reviewCount,
    ]
      .map(
        (value) =>
          Number(
            value ||
            0,
          ),
      )
      .filter(
        (value) =>
          Number.isFinite(
            value,
          ) &&
          value >
            0,
      );

    if (
      totalCountCandidates.length >
        0
    ) {
      nativeTotalCount =
        Math.max(
          nativeTotalCount,
          ...totalCountCandidates,
        );
    }

    const added =
      reviews.length >
        0
        ? mergeReviews(
            reviews,
          )
        : 0;

    nativeResponseCount += 1;
    nativeResponseSerial += 1;
    lastNativeResponseAt =
      Date.now();

    console.log(
      "PROJECT_D_NATIVE_REVIEW_CAPTURED",
      {
        href:
          location.href,
        responseReviews:
          reviews.length,
        added,
        accumulated:
          accumulatedReviews.size,
        deepReviewMode,
        targetReviewCount,
        requestedPage:
          requestedPage ||
          null,
        nativeTotalCount,
        url:
          String(
            message.url ||
            "",
          ),
      },
    );

    capturedReviewData = {
      url:
        String(
          message.url ||
          "",
        ),
      data:
        message.data,
      reviews,
    };
  });

  const findReviewClickable = (
    predicate,
  ) => {
    const reviewRoot =
      document.querySelector(
        "#REVIEW",
      ) ||
      document.querySelector(
        '[id="REVIEW"]',
      );

    const roots =
      reviewRoot
        ? [
            reviewRoot,
            document,
          ]
        : [
            document,
          ];

    for (
      const root of roots
    ) {
      const elements =
        Array.from(
          root.querySelectorAll(
            "a, button",
          ),
        );

      const found =
        elements.find(
          (element) => {
            const text =
              cleanText(
                element.textContent,
              );

            return predicate(
              text,
              element,
            );
          },
        );

      if (found) {
        return found;
      }
    }

    return null;
  };

  const activateReviewArea = async () => {
    if (
      capturedReviewData &&
      !deepReviewMode
    ) {
      return;
    }

    /*
     * SmartStore에서 리뷰 목록 XHR은 리뷰 영역이 실제로
     * 활성화되어야 발생하는 경우가 있으므로 #REVIEW를 우선 사용한다.
     */
    if (location.hash !== "#REVIEW") {
      try {
        history.replaceState(
          history.state,
          "",
          location.pathname +
            location.search +
            "#REVIEW",
        );
      } catch {
        // hash 변경 실패 시 아래 DOM/scroll fallback 사용
      }
    }

    const reviewSelectors = [
      "#REVIEW",
      '[id="REVIEW"]',
      'a[href="#REVIEW"]',
      '[href*="#REVIEW"]',
    ];

    for (
      const selector of
      reviewSelectors
    ) {
      const element =
        document.querySelector(
          selector,
        );

      if (!element) continue;

      try {
        element.scrollIntoView({
          behavior:
            "instant",
          block:
            "start",
        });
      } catch {
        // ignore
      }

      if (
        element instanceof
          HTMLElement &&
        typeof element.click ===
          "function"
      ) {
        try {
          element.click();
        } catch {
          // ignore
        }
      }

      await sleep(1200);

      if (
        capturedReviewData &&
        !deepReviewMode
      ) {
        return;
      }
    }

    /*
     * 텍스트가 '리뷰'인 탭/링크도 찾아서 활성화한다.
     */
    const clickable =
      findReviewClickable(
        (text) =>
          text === "리뷰" ||
          text.startsWith(
            "리뷰 ",
          ),
      );

    if (
      clickable instanceof
      HTMLElement
    ) {
      try {
        clickable.click();
        await sleep(1200);
      } catch {
        // ignore
      }
    }
  };

  const activateReviewAll = async () => {
    /*
     * 사용자가 직접 확인한 SmartStore 동작:
     * 리뷰 전체보기 진입 후 아래로 스크롤하면
     * query-pages page=2, 3, ... 요청이 이어진다.
     *
     * 따라서 deep mode에서는 우선 "리뷰 전체보기"를 찾고,
     * 찾지 못하면 이미 전체보기 상태라고 보고 계속 진행한다.
     */
    const exact =
      findReviewClickable(
        (text) =>
          text ===
            "리뷰 전체보기" ||
          text.startsWith(
            "리뷰 전체보기 ",
          ),
      );

    const fallback =
      exact ||
      findReviewClickable(
        (text) =>
          text === "전체보기",
      );

    if (
      fallback instanceof
      HTMLElement
    ) {
      try {
        fallback.scrollIntoView({
          behavior:
            "instant",
          block:
            "center",
        });

        await sleep(300);

        fallback.click();

        await sleep(1500);
      } catch {
        // 전체보기 클릭 실패 시 스크롤 방식으로 계속 시도
      }
    }
  };

  const scrollForFirstNativeReview =
    async () => {
      const startY =
        window.scrollY;

      await activateReviewArea();

      if (capturedReviewData) {
        return;
      }

      for (
        let i = 0;
        i < 40;
        i += 1
      ) {
        if (
          capturedReviewData
        ) {
          break;
        }

        window.scrollBy({
          top:
            Math.max(
              400,
              Math.floor(
                window.innerHeight *
                  0.7,
              ),
            ),
          behavior:
            "instant",
        });

        await sleep(400);
      }

      if (
        !capturedReviewData
      ) {
        window.scrollTo({
          top:
            document
              .documentElement
              .scrollHeight,
          behavior:
            "instant",
        });

        await sleep(2000);
      }

      if (
        !capturedReviewData
      ) {
        await activateReviewArea();
      }

      if (
        !capturedReviewData
      ) {
        window.scrollTo({
          top:
            startY,
          behavior:
            "instant",
        });
      }
    };

  const waitForNativeResponse =
    async (
      previousSerial,
      timeoutMs =
        8000,
    ) => {
      const started =
        Date.now();

      while (
        Date.now() -
          started <
        timeoutMs
      ) {
        if (
          nativeResponseSerial >
          previousSerial
        ) {
          return true;
        }

        await sleep(
          120,
        );
      }

      return false;
    };

  const collectDeepReviews =
    async () => {
      /*
       * SmartStore도 Brand Store와 같은 query-pages 기반이다.
       *
       * 기존 방식은 "리뷰 전체보기 + 화면 스크롤"에 의존했기 때문에
       * page 1 응답만 잡히고 후속 페이지가 열리지 않는 상품이 있었다.
       *
       * 이제 최초 query-pages의 실제 XHR 요청 body/header를
       * MAIN-world interceptor가 템플릿으로 보관하고,
       * page 값만 2, 3, ...으로 바꿔 같은 endpoint에 직접 재요청한다.
       */
      if (
        accumulatedReviews.size ===
          0
      ) {
        return;
      }

      if (
        nativeCapturedPages.size ===
          0
      ) {
        nativeCapturedPages.add(
          1,
        );
      }

      const pageSize =
        Math.max(
          1,
          nativeFirstPageSize ||
          20,
        );

      const effectiveTarget =
        nativeTotalCount >
          0
          ? Math.min(
              targetReviewCount,
              nativeTotalCount,
            )
          : targetReviewCount;

      const requiredPages =
        Math.max(
          1,
          Math.ceil(
            effectiveTarget /
            pageSize,
          ),
        );

      let zeroGrowthPages =
        0;

      for (
        let page = 1;
        page <=
          requiredPages;
        page += 1
      ) {
        if (
          accumulatedReviews.size >=
          effectiveTarget
        ) {
          break;
        }

        if (
          nativeCapturedPages.has(
            page,
          )
        ) {
          continue;
        }

        const beforeSerial =
          nativeResponseSerial;

        const beforeCount =
          accumulatedReviews.size;

        window.postMessage(
          {
            type:
              NATIVE_FETCH_PAGE,

            page,
          },
          "*",
        );

        const received =
          await waitForNativeResponse(
            beforeSerial,
            8000,
          );

        if (
          !received
        ) {
          console.warn(
            "PROJECT_D_SMARTSTORE_NATIVE_PAGE_TIMEOUT",
            {
              page,
              accumulatedReviews:
                accumulatedReviews.size,
            },
          );

          break;
        }

        const afterCount =
          accumulatedReviews.size;

        if (
          afterCount >
          beforeCount
        ) {
          zeroGrowthPages =
            0;
        } else {
          zeroGrowthPages +=
            1;
        }

        /*
         * 실제 리뷰 끝에 도달했거나 동일 응답만 반복되는 경우
         * 불필요하게 50페이지까지 계속 요청하지 않는다.
         */
        if (
          zeroGrowthPages >=
          2
        ) {
          break;
        }

        await sleep(
          180,
        );
      }

      if (
        lastNativeResponseAt >
          0 &&
        Date.now() -
          lastNativeResponseAt <
          1000
      ) {
        await sleep(
          1000,
        );
      }
    };

  const mapReview = (
    review,
    textLimit,
  ) => ({
    id:
      String(
        review?.id ||
        "",
      ),

    score:
      Number(
        review
          ?.reviewScore ||
        0,
      ),

    text:
      String(
        review
          ?.reviewContent ||
        "",
      ).slice(
        0,
        textLimit,
      ),

    createDate:
      String(
        review
          ?.createDate ||
        "",
      ),

    productNo:
      String(
        review
          ?.productNo ||
        "",
      ),

    originProductNo:
      String(
        review
          ?.originProductNo ||
        "",
      ),

    productName:
      String(
        review
          ?.productName ||
        "",
      ),

    productUrl:
      String(
        review
          ?.productUrl ||
        "",
      ),

    option:
      String(
        review
          ?.productOptionContent ||
        "",
      ),

    reviewType:
      String(
        review
          ?.reviewType ||
        "",
      ),

    reviewContentClassType:
      String(
        review
          ?.reviewContentClassType ||
        "",
      ),
  });

  const run = async () => {
    await sleep(1000);

    await scrollForFirstNativeReview();

    for (
      let i = 0;
      i < 20;
      i += 1
    ) {
      if (capturedReviewData) {
        break;
      }

      await sleep(500);
    }

    if (!capturedReviewData) {
      sendDone({
        success:
          false,

        finalUrl:
          location.href,

        channelProductNo:
          getChannelProductNo(),

        reason:
          "네이버 자체 query-pages 200 응답을 포착하지 못했습니다.",
      });

      return;
    }

    if (deepReviewMode) {
      await collectDeepReviews();
    }

    const reviews =
      (
        deepReviewMode
          ? Array.from(
              accumulatedReviews.values(),
            )
          : capturedReviewData.reviews
      ).slice(
        0,
        deepReviewMode
          ? targetReviewCount
          : SHALLOW_REVIEW_LIMIT,
      );

    const first =
      reviews[0] || {};

    sendDone({
      success:
        true,

      finalUrl:
        location.href,

      channelProductNo:
        String(
          first?.productNo ||
          getChannelProductNo(),
        ),

      originProductNo:
        String(
          first
            ?.originProductNo ||
          "",
        ),

      productName:
        String(
          first
            ?.productName ||
          "",
        ),

      productUrl:
        String(
          first
            ?.productUrl ||
          "",
        ),

      reviewStatus:
        200,

      reviewCountReturned:
        reviews.length,

      reviewSample:
        reviews
          .slice(
            0,
            5,
          )
          .map(
            (review) =>
              mapReview(
                review,
                1000,
              ),
          ),

      reviews:
        reviews.map(
          (review) =>
            mapReview(
              review,
              2000,
            ),
        ),

      nativeResponseCaptured:
        true,

      nativeResponseCount,

      sourceType:
        "smartstore-native",

      deepReview:
        deepReviewMode,

      targetReviewCount:
        deepReviewMode
          ? targetReviewCount
          : SHALLOW_REVIEW_LIMIT,

      collectionComplete:
        deepReviewMode
          ? reviews.length >=
              targetReviewCount
          : reviews.length > 0,
    });
  };

  const startProbe = (
    id,
    options = {},
  ) => {
    const requestId =
      String(
        id ||
        "",
      );

    if (
      !requestId ||
      activeRequestId
    ) {
      return;
    }

    activeRequestId =
      requestId;

    deepReviewMode =
      options?.deepReview ===
        true ||
      options?.mode ===
        "deep";

    const requestedMax =
      Number(
        options
          ?.maxReviews ??
        options
          ?.targetReviewCount ??
        SHALLOW_REVIEW_LIMIT,
      );

    targetReviewCount =
      deepReviewMode
        ? Math.max(
            1,
            Math.min(
              MAX_DEEP_REVIEWS,
              Number.isFinite(
                requestedMax,
              )
                ? Math.floor(
                    requestedMax,
                  )
                : MAX_DEEP_REVIEWS,
            ),
          )
        : SHALLOW_REVIEW_LIMIT;

    console.log(
      "PROJECT_D_PROBE_STARTED",
      {
        requestId,
        href:
          location.href,
        alreadyCaptured:
          Boolean(
            capturedReviewData,
          ),
        deepReviewMode,
        targetReviewCount,
      },
    );

    void run().catch(
      (error) => {
        sendDone({
          success:
            false,

          finalUrl:
            location.href,

          channelProductNo:
            getChannelProductNo(),

          reason:
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
        });
      },
    );
  };

  chrome.runtime.onMessage.addListener(
    (
      message,
      sender,
      sendResponse,
    ) => {
      if (
        message?.type !==
        "PROJECT_D_SMARTSTORE_PROBE_START"
      ) {
        return;
      }

      const requestId =
        String(
          message.requestId ||
          "",
        );

      console.log(
        "PROJECT_D_PROBE_START_RECEIVED",
        {
          requestId,
          href:
            location.href,
          deepReview:
            message?.deepReview ===
              true ||
            message?.mode ===
              "deep",
          maxReviews:
            Number(
              message
                ?.maxReviews ??
              message
                ?.targetReviewCount ??
              0,
            ),
        },
      );

      sendResponse({
        accepted:
          Boolean(
            requestId,
          ),
        requestId,
        href:
          location.href,
      });

      startProbe(
        requestId,
        message,
      );
    },
  );
})();
