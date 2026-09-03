(() => {
  if (window.__PROJECT_D_BRANDSTORE_PROBE_LISTENER__) return;
  window.__PROJECT_D_BRANDSTORE_PROBE_LISTENER__ = true;

  const START =
    "PROJECT_D_BRANDSTORE_PROBE_START";

  const DONE =
    "PROJECT_D_BRANDSTORE_PROBE_DONE";

  const NATIVE_RESPONSE =
    "PROJECT_D_BRANDSTORE_NATIVE_REVIEW_RESPONSE";

  const NATIVE_FETCH_PAGE =
    "PROJECT_D_BRANDSTORE_NATIVE_REVIEW_FETCH_PAGE";

  const NATIVE_SOURCE =
    "PROJECT_D_BRANDSTORE_MAIN_WORLD";

  const SHALLOW_REVIEW_LIMIT =
    20;

  const MAX_DEEP_REVIEWS =
    1000;

  let activeRequestId =
    "";

  let finished =
    false;

  let deepReviewMode =
    false;

  let targetReviewCount =
    SHALLOW_REVIEW_LIMIT;

  let nativeResponseCount =
    0;

  let nativeResponseSerial =
    0;

  let nativeFirstPageSize =
    0;

  const nativeCapturedPages =
    new Set();

  let lastNativeResponseAt =
    0;

  const accumulatedReviews =
    new Map();

  const sleep = (ms) =>
    new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          ms,
        ),
    );

  const clean = (value) =>
    String(
      value ||
      "",
    )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  const getChannelProductNo =
    () =>
      location.pathname.match(
        /\/products\/(\d+)/,
      )?.[1] || "";

  const sendDone = (
    result,
    message = "",
  ) => {
    if (
      !activeRequestId ||
      finished
    ) {
      return;
    }

    finished =
      true;

    chrome.runtime.sendMessage(
      {
        type:
          DONE,

        requestId:
          activeRequestId,

        result,

        message,
      },
      () => {
        void chrome.runtime.lastError;
      },
    );
  };

  const normalizeReviews =
    (data) => {
      const candidates = [
        data?.contents,
        data?.content,
        data?.reviews,
        data?.productReviews,
        data?.data?.contents,
        data?.data?.content,
        data?.data?.reviews,
      ];

      return (
        candidates.find(
          Array.isArray,
        ) ||
        []
      );
    };

  const reviewKey = (
    review,
    index,
  ) => {
    const id =
      clean(
        review?.id,
      );

    if (id) {
      return (
        "id:" +
        id
      );
    }

    const originProductNo =
      clean(
        review?.originProductNo,
      );

    const productNo =
      clean(
        review?.productNo,
      );

    const createDate =
      clean(
        review?.createDate,
      );

    const text =
      clean(
        review?.reviewContent,
      ).slice(
        0,
        160,
      );

    return [
      "fallback",
      originProductNo,
      productNo,
      createDate,
      text,
      String(index),
    ].join(
      "|",
    );
  };

  const mergeReviews =
    (reviews) => {
      let added =
        0;

      reviews.forEach(
        (
          review,
          index,
        ) => {
          const key =
            reviewKey(
              review,
              index,
            );

          if (
            !key ||
            accumulatedReviews.has(
              key,
            )
          ) {
            return;
          }

          accumulatedReviews.set(
            key,
            review,
          );

          added +=
            1;
        },
      );

      return added;
    };

  window.addEventListener(
    "message",
    (event) => {
      if (
        event.source !==
        window
      ) {
        return;
      }

      const message =
        event.data;

      if (
        message?.type !==
          NATIVE_RESPONSE ||
        message?.source !==
          NATIVE_SOURCE ||
        Number(
          message.status,
        ) !== 200
      ) {
        return;
      }

      const reviews =
        normalizeReviews(
          message.data,
        );

      if (
        !reviews.length
      ) {
        return;
      }

      const added =
        mergeReviews(
          reviews,
        );

      nativeResponseCount +=
        1;

      nativeResponseSerial +=
        1;

      if (
        nativeFirstPageSize ===
          0
      ) {
        nativeFirstPageSize =
          reviews.length;
      }

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

      lastNativeResponseAt =
        Date.now();

      console.log(
        "PROJECT_D_BRAND_NATIVE_REVIEW_CAPTURED",
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
            Number(
              message.requestedPage ||
              0,
            ) || null,

          url:
            String(
              message.url ||
              "",
            ),
        },
      );
    },
  );

  const findReviewButton =
    () => {
      const elements = [
        ...document.querySelectorAll(
          'a, button, [role="button"]',
        ),
      ];

      return elements.find(
        (element) => {
          const text =
            clean(
              element.textContent,
            );

          return (
            text ===
              "리뷰" ||
            /^리뷰\s*[\d,]+/.test(
              text,
            )
          );
        },
      );
    };

  const activateReviewArea =
    async () => {
      if (
        !location.hash.includes(
          "REVIEW",
        )
      ) {
        try {
          history.replaceState(
            history.state,
            "",
            location.pathname +
              location.search +
              "#REVIEW_DIALOG",
          );
        } catch {
          // ignore
        }
      }

      const reviewElement =
        findReviewButton();

      if (
        reviewElement instanceof
        HTMLElement
      ) {
        try {
          reviewElement.click();
        } catch {
          // ignore
        }

        await sleep(
          1200,
        );
      }
    };

  const isVisible =
    (element) =>
      Boolean(
        element &&
        (
          element.offsetWidth ||
          element.offsetHeight ||
          element.getClientRects()
            .length
        ),
      );

  const findReviewScrollers =
    () => {
      /*
       * Brand Store 모바일 리뷰 화면은 "리뷰 6,795" 같은
       * dialog 안에 별도 스크롤 컨테이너를 둔다.
       *
       * 이전 코드는 후보 중 1개만 골랐기 때문에
       * 바깥 상품 페이지 컨테이너를 잘못 고르면 리뷰창이 멈췄다.
       *
       * 이제는 현재 화면에 보이는 스크롤 가능 컨테이너를
       * 여러 개 점수화하고 상위 후보들을 함께 움직인다.
       */
      const elements = [
        ...document.querySelectorAll(
          "div, section, article, main, ul, ol",
        ),
      ];

      const viewportWidth =
        Math.max(
          1,
          window.innerWidth,
        );

      const viewportHeight =
        Math.max(
          1,
          window.innerHeight,
        );

      return elements
        .map(
          (element) => {
            if (
              !isVisible(
                element,
              )
            ) {
              return null;
            }

            const rect =
              element.getBoundingClientRect();

            const range =
              Number(
                element.scrollHeight ||
                0,
              ) -
              Number(
                element.clientHeight ||
                0,
              );

            if (
              range <
              120
            ) {
              return null;
            }

            if (
              rect.width <
                220 ||
              rect.height <
                220
            ) {
              return null;
            }

            if (
              rect.bottom <=
                0 ||
              rect.top >=
                viewportHeight
            ) {
              return null;
            }

            const style =
              getComputedStyle(
                element,
              );

            const overflowY =
              String(
                style.overflowY ||
                "",
              );

            let score =
              range;

            if (
              overflowY ===
                "auto" ||
              overflowY ===
                "scroll"
            ) {
              score +=
                5000;
            }

            if (
              style.position ===
                "fixed" ||
              style.position ===
                "sticky"
            ) {
              score +=
                2500;
            }

            /*
             * 모바일 리뷰 dialog는 대체로 화면 폭과 비슷한
             * 너비를 차지하므로 그 형태를 우선한다.
             */
            if (
              rect.width >=
                viewportWidth *
                  0.65 &&
              rect.width <=
                viewportWidth *
                  1.15
            ) {
              score +=
                1800;
            }

            if (
              rect.height >=
              viewportHeight *
                0.45
            ) {
              score +=
                1200;
            }

            const text =
              clean(
                element.textContent,
              );

            if (
              text.includes(
                "도움돼요",
              ) ||
              /리뷰\s*[\d,]+/.test(
                text,
              )
            ) {
              score +=
                3000;
            }

            return {
              element,
              score,
              range,
              overflowY,
              rect,
            };
          },
        )
        .filter(
          Boolean,
        )
        .sort(
          (
            a,
            b,
          ) =>
            b.score -
            a.score,
        )
        .slice(
          0,
          8,
        );
    };

  const scrollOneElement =
    async (
      element,
    ) => {
      if (
        !(element instanceof
          HTMLElement)
      ) {
        return false;
      }

      const before =
        element.scrollTop;

      const maxTop =
        Math.max(
          0,
          element.scrollHeight -
            element.clientHeight,
        );

      if (
        maxTop <=
        0
      ) {
        return false;
      }

      /*
       * 한 번에 맨 끝으로 점프만 하면 infinite-scroll observer가
       * 놓치는 경우가 있어 85% 지점 -> 맨 끝 순서로 움직인다.
       */
      const nearBottom =
        Math.max(
          0,
          Math.floor(
            maxTop *
            0.85,
          ),
        );

      element.scrollTop =
        Math.max(
          element.scrollTop,
          nearBottom,
        );

      element.dispatchEvent(
        new Event(
          "scroll",
          {
            bubbles:
              true,
          },
        ),
      );

      await sleep(
        180,
      );

      element.scrollTop =
        maxTop;

      element.dispatchEvent(
        new Event(
          "scroll",
          {
            bubbles:
              true,
          },
        ),
      );

      await sleep(
        420,
      );

      return (
        element.scrollTop >
        before
      );
    };

  const scrollReviewSurface =
    async () => {
      const candidates =
        findReviewScrollers();

      let moved =
        false;

      for (
        const candidate of
        candidates
      ) {
        const didMove =
          await scrollOneElement(
            candidate.element,
          );

        moved =
          moved ||
          didMove;

        if (
          accumulatedReviews.size >=
          targetReviewCount
        ) {
          break;
        }
      }

      /*
       * nested dialog가 아닌 변형도 있을 수 있으므로
       * document.scrollingElement도 마지막 fallback으로 움직인다.
       */
      if (
        !moved
      ) {
        const scrollingElement =
          document.scrollingElement;

        if (
          scrollingElement instanceof
          HTMLElement
        ) {
          await scrollOneElement(
            scrollingElement,
          );
        } else {
          window.scrollTo({
            top:
              document.documentElement
                .scrollHeight,
            behavior:
              "instant",
          });

          await sleep(
            650,
          );
        }
      }

      console.log(
        "PROJECT_D_BRAND_SCROLL_ATTEMPT",
        {
          candidateCount:
            candidates.length,

          moved,

          accumulatedReviews:
            accumulatedReviews.size,

          candidates:
            candidates.map(
              (
                candidate,
              ) => ({
                tag:
                  candidate.element
                    .tagName,

                range:
                  candidate.range,

                overflowY:
                  candidate.overflowY,

                score:
                  candidate.score,

                scrollTop:
                  candidate.element
                    .scrollTop,

                clientHeight:
                  candidate.element
                    .clientHeight,

                scrollHeight:
                  candidate.element
                    .scrollHeight,
              }),
            ),
        },
      );
    };

  const parseScore =
    (text) => {
      const match =
        String(
          text ||
          "",
        ).match(
          /(?:평점\s*)?([1-5])(?:\s|$)/,
        );

      return match
        ? Number(
            match[1],
          )
        : 0;
    };

  const collectDomReviews =
    () => {
      const scoreNodes = [
        ...document.querySelectorAll(
          "strong, span",
        ),
      ].filter(
        (element) => {
          const text =
            clean(
              element.textContent,
            );

          return /^평점\s*[1-5]$/.test(
            text,
          );
        },
      );

      const reviews =
        [];

      const seen =
        new Set();

      const findReviewCard =
        (scoreNode) => {
          const selectors = [
            "a",
            "li",
            "article",
          ];

          for (
            const selector of
            selectors
          ) {
            const card =
              scoreNode.closest(
                selector,
              );

            if (!card) {
              continue;
            }

            const text =
              clean(
                card.innerText,
              );

            if (
              text.length <
                40 ||
              text.length >
                2500 ||
              !/^평점\s*[1-5]/.test(
                text,
              )
            ) {
              continue;
            }

            return card;
          }

          let current =
            scoreNode.parentElement;

          for (
            let depth = 0;
            depth < 5 &&
            current;
            depth += 1
          ) {
            const text =
              clean(
                current.innerText,
              );

            if (
              text.length >=
                40 &&
              text.length <=
                2500 &&
              /^평점\s*[1-5]/.test(
                text,
              )
            ) {
              return current;
            }

            current =
              current.parentElement;
          }

          return null;
        };

      for (
        const scoreNode of
        scoreNodes
      ) {
        const card =
          findReviewCard(
            scoreNode,
          );

        if (!card) {
          continue;
        }

        const raw =
          clean(
            card.innerText,
          );

        if (
          /상품정보 제공고시|판매자 상세정보|개인정보 처리방침|네이버 이용약관|NAVER Copyright|쇼핑 안전거래 TIP/.test(
            raw,
          )
        ) {
          continue;
        }

        const score =
          parseScore(
            clean(
              scoreNode.textContent,
            ),
          );

        if (
          score <
            1 ||
          score >
            5
        ) {
          continue;
        }

        const normalizedKey =
          raw
            .replace(
              /\s+/g,
              "",
            )
            .slice(
              0,
              1500,
            );

        if (
          !normalizedKey ||
          seen.has(
            normalizedKey,
          )
        ) {
          continue;
        }

        seen.add(
          normalizedKey,
        );

        const date =
          raw.match(
            /\b\d{2}\.\d{2}\.\d{2}\.?\b/,
          )?.[0] || "";

        reviews.push({
          id:
            `brand-dom-${reviews.length + 1}`,

          score,

          text:
            raw.slice(
              0,
              2500,
            ),

          createDate:
            date,

          productNo:
            getChannelProductNo(),

          productName:
            "",

          productUrl:
            location.href,

          reviewType:
            "BRAND_DOM",
        });
      }

      return reviews.slice(
        0,
        SHALLOW_REVIEW_LIMIT,
      );
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
       * Step 26에서 native page 1은 정상 포착됐지만
       * Brand Store 리뷰 modal의 programmatic scroll은
       * page 2 요청을 발생시키지 않았다.
       *
       * 이제 최초 query-pages request의 실제 body를 MAIN-world
       * interceptor가 템플릿으로 보관하고,
       * page 값만 2, 3, ...으로 바꿔 네이버 원래 endpoint에
       * 같은 세션/쿠키로 요청한다.
       *
       * 따라서 DOM 스크롤 성공 여부에 의존하지 않는다.
       */
      if (
        accumulatedReviews.size ===
        0
      ) {
        return [];
      }

      const pageSize =
        Math.max(
          1,
          nativeFirstPageSize ||
          20,
        );

      const requiredPages =
        Math.max(
          1,
          Math.ceil(
            targetReviewCount /
            pageSize,
          ),
        );

      /*
       * 최초 리뷰 dialog 진입에서 page 1이 보통 이미 포착된다.
       * requestedPage 정보가 없는 구형/변형 응답도 첫 페이지로 취급한다.
       */
      if (
        nativeCapturedPages.size ===
          0 &&
        accumulatedReviews.size >
          0
      ) {
        nativeCapturedPages.add(
          1,
        );
      }

      for (
        let page = 1;
        page <=
          requiredPages;
        page += 1
      ) {
        if (
          accumulatedReviews.size >=
          targetReviewCount
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
            "PROJECT_D_BRAND_NATIVE_PAGE_TIMEOUT",
            {
              page,

              accumulatedReviews:
                accumulatedReviews.size,
            },
          );

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

      return Array.from(
        accumulatedReviews.values(),
      ).slice(
        0,
        targetReviewCount,
      );
    };

  const mapNativeReview =
    (
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
          review?.reviewScore ||
          review?.score ||
          0,
        ),

      text:
        String(
          review?.reviewContent ||
          review?.text ||
          "",
        ).slice(
          0,
          textLimit,
        ),

      createDate:
        String(
          review?.createDate ||
          "",
        ),

      productNo:
        String(
          review?.productNo ||
          "",
        ),

      originProductNo:
        String(
          review?.originProductNo ||
          "",
        ),

      productName:
        String(
          review?.productName ||
          "",
        ),

      productUrl:
        String(
          review?.productUrl ||
          location.href ||
          "",
        ),

      option:
        String(
          review?.productOptionContent ||
          "",
        ),

      reviewType:
        String(
          review?.reviewType ||
          "BRAND_NATIVE",
        ),

      reviewContentClassType:
        String(
          review?.reviewContentClassType ||
          "",
        ),
    });

  const run =
    async () => {
      await sleep(
        1000,
      );

      await activateReviewArea();

      if (
        deepReviewMode
      ) {
        /*
         * 첫 query-pages가 리뷰 dialog 진입 직후 발생할 시간을 준다.
         */
        for (
          let i = 0;
          i < 20;
          i += 1
        ) {
          if (
            accumulatedReviews.size >
            0
          ) {
            break;
          }

          await scrollReviewSurface();

          await sleep(
            250,
          );
        }

        const nativeReviews =
          await collectDeepReviews();

        if (
          nativeReviews.length >
          0
        ) {
          const reviews =
            nativeReviews.map(
              (review) =>
                mapNativeReview(
                  review,
                  2500,
                ),
            );

          const first =
            reviews[0] ||
            {};

          sendDone({
            success:
              true,

            finalUrl:
              location.href,

            channelProductNo:
              String(
                first.productNo ||
                getChannelProductNo(),
              ),

            originProductNo:
              String(
                first.originProductNo ||
                "",
              ),

            productName:
              String(
                first.productName ||
                "",
              ),

            productUrl:
              String(
                first.productUrl ||
                location.href,
              ),

            reviewStatus:
              200,

            reviewCountReturned:
              reviews.length,

            reviewSample:
              reviews.slice(
                0,
                5,
              ),

            reviews,

            nativeResponseCaptured:
              true,

            nativeResponseCount,

            sourceType:
              "brand-native",

            deepReview:
              true,

            targetReviewCount,

            collectionComplete:
              reviews.length >=
              targetReviewCount,
          });

          return;
        }

        /*
         * native 응답이 잡히지 않더라도 기존 DOM shallow 검증은
         * 손상시키지 않는다.
         */
        const fallback =
          collectDomReviews();

        sendDone({
          success:
            fallback.length >
            0,

          finalUrl:
            location.href,

          channelProductNo:
            getChannelProductNo(),

          reviewCountReturned:
            fallback.length,

          reviews:
            fallback,

          reviewSample:
            fallback.slice(
              0,
              5,
            ),

          nativeResponseCaptured:
            false,

          nativeResponseCount,

          sourceType:
            "brand-dom-fallback",

          deepReview:
            true,

          targetReviewCount,

          collectionComplete:
            false,

          reason:
            fallback.length >
            0
              ? "Brand Store query-pages native 응답을 포착하지 못해 DOM fallback을 사용했습니다."
              : "Brand Store query-pages native 응답과 리뷰 DOM을 모두 찾지 못했습니다.",
        });

        return;
      }

      let reviews =
        [];

      for (
        let i = 0;
        i < 20;
        i += 1
      ) {
        reviews =
          collectDomReviews();

        if (
          reviews.length >=
          5
        ) {
          break;
        }

        await scrollReviewSurface();

        await sleep(
          300,
        );
      }

      if (
        !reviews.length
      ) {
        sendDone({
          success:
            false,

          finalUrl:
            location.href,

          reviewCountReturned:
            0,

          reviews:
            [],

          nativeResponseCaptured:
            false,

          sourceType:
            "brand-dom",

          deepReview:
            false,

          reason:
            "Brand Store 리뷰 DOM을 찾지 못했습니다.",
        });

        return;
      }

      sendDone({
        success:
          true,

        finalUrl:
          location.href,

        channelProductNo:
          getChannelProductNo(),

        reviewCountReturned:
          reviews.length,

        reviews,

        reviewSample:
          reviews.slice(
            0,
            5,
          ),

        nativeResponseCaptured:
          false,

        sourceType:
          "brand-dom",

        deepReview:
          false,
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
        options?.maxReviews ??
        options?.targetReviewCount ??
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
      "PROJECT_D_BRAND_PROBE_STARTED",
      {
        requestId,

        href:
          location.href,

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

          reviewCountReturned:
            0,

          reviews:
            [],

          nativeResponseCaptured:
            false,

          sourceType:
            deepReviewMode
              ? "brand-native"
              : "brand-dom",

          deepReview:
            deepReviewMode,

          targetReviewCount,

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
        START
      ) {
        return;
      }

      const requestId =
        String(
          message.requestId ||
          "",
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
