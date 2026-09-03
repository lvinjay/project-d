(() => {
  if (window.__PROJECT_D_CATALOG_REVIEW_PROBE_LISTENER__) return;
  window.__PROJECT_D_CATALOG_REVIEW_PROBE_LISTENER__ = true;

  const START =
    "PROJECT_D_CATALOG_REVIEW_PROBE_START";
  const DONE =
    "PROJECT_D_CATALOG_REVIEW_PROBE_DONE";

  const NATIVE_RESPONSE =
    "PROJECT_D_CATALOG_NATIVE_REVIEW_RESPONSE";
  const NATIVE_FETCH_PAGE =
    "PROJECT_D_CATALOG_NATIVE_REVIEW_FETCH_PAGE";
  const NATIVE_SOURCE =
    "PROJECT_D_CATALOG_MAIN_WORLD";

  const SHALLOW_REVIEW_LIMIT = 20;
  const MAX_DEEP_REVIEWS = 1000;

  let activeRequestId = "";
  let finished = false;

  let deepReviewMode = false;
  let targetReviewCount =
    SHALLOW_REVIEW_LIMIT;

  let nativeTemplateUrl = "";
  let nativeTotalCount = 0;
  let nativeResponseSerial = 0;
  let nativeResponseCount = 0;
  let nativeFirstPageSize = 0;

  const nativeCapturedPages =
    new Set();

  const nativeReviews =
    new Map();

  const nativeSeenReviewKeys =
    new Set();

  let nativeDuplicateTextCount = 0;

  const sleep = (ms) =>
    new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          ms,
        ),
    );

  const clean = (value) =>
    String(value || "")
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

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

    finished = true;

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

  const catalogProductNo = () =>
    location.pathname.match(
      /\/catalog\/(\d+)/,
    )?.[1] || "";

  const findControl = (
    matcher,
  ) => {
    const elements = [
      ...document.querySelectorAll(
        'button, a, [role="button"]',
      ),
    ];

    return elements.find(
      (element) => {
        const text =
          clean(
            element.innerText ||
            element.textContent,
          );

        return matcher(
          text,
        );
      },
    );
  };

  const activateReviews =
    async () => {
      const getVisibleControls =
        () =>
          [
            ...document.querySelectorAll(
              'button, a, [role="button"]',
            ),
          ].filter(
            (element) =>
              Boolean(
                element.offsetWidth ||
                element.offsetHeight ||
                element.getClientRects()
                  .length,
              ),
          );

      let mallReviewButton =
        null;

      for (
        let attempt = 0;
        attempt < 30;
        attempt += 1
      ) {
        const controls =
          getVisibleControls();

        mallReviewButton =
          controls.find(
            (element) => {
              const text =
                clean(
                  element.innerText ||
                  element.textContent,
                );

              return (
                text ===
                "쇼핑몰리뷰"
              );
            },
          ) ||
          controls.find(
            (element) => {
              const text =
                clean(
                  element.innerText ||
                  element.textContent,
                );

              return /^쇼핑몰리뷰[\d,]+$/.test(
                text,
              );
            },
          );

        if (
          mallReviewButton
        ) {
          try {
            mallReviewButton.scrollIntoView(
              {
                block:
                  "center",
                behavior:
                  "instant",
              },
            );

            await sleep(
              300,
            );

            mallReviewButton.click();
          } catch {
            // ignore
          }

          await sleep(
            1200,
          );

          break;
        }

        await sleep(
          300,
        );
      }

      let reviewAllButton =
        null;

      for (
        let attempt = 0;
        attempt < 30;
        attempt += 1
      ) {
        const controls =
          getVisibleControls();

        reviewAllButton =
          controls.find(
            (element) => {
              const text =
                clean(
                  element.innerText ||
                  element.textContent,
                );

              return (
                text ===
                "쇼핑몰 리뷰 전체보기"
              );
            },
          );

        if (
          reviewAllButton
        ) {
          try {
            reviewAllButton.scrollIntoView(
              {
                block:
                  "center",
                behavior:
                  "instant",
              },
            );

            await sleep(
              300,
            );

            reviewAllButton.click();
          } catch {
            // ignore
          }

          await sleep(
            1500,
          );

          break;
        }

        const existingCards =
          document.querySelectorAll(
            'div[class*="catalogMallReviewItem_mall_review_item__"]',
          );

        if (
          existingCards.length >=
          5
        ) {
          break;
        }

        await sleep(
          300,
        );
      }

      console.log(
        "PROJECT_D_CATALOG_REVIEW_ACTIVATION",
        {
          mallReviewButtonFound:
            Boolean(
              mallReviewButton,
            ),
          reviewAllButtonFound:
            Boolean(
              reviewAllButton,
            ),
          reviewCardCount:
            document.querySelectorAll(
              'div[class*="catalogMallReviewItem_mall_review_item__"]',
            ).length,
          deepReviewMode,
        },
      );
    };

  const collectDomReviews =
    () => {
      const cards = [
        ...document.querySelectorAll(
          'div[class*="catalogMallReviewItem_mall_review_item__"]',
        ),
      ];

      const reviews = [];
      const seen =
        new Set();

      for (
        const card of
        cards
      ) {
        const raw =
          clean(
            card.innerText,
          );

        const score =
          Number(
            raw.match(
              /평점\s*([1-5])/,
            )?.[1] || 0,
          );

        const date =
          raw.match(
            /\b\d{2}\.\d{2}\.\d{2}\.?\b/,
          )?.[0] || "";

        if (
          score < 1 ||
          score > 5 ||
          !date ||
          raw.length < 40
        ) {
          continue;
        }

        const key =
          raw
            .replace(
              /\s+/g,
              "",
            )
            .replace(
              /더보기/g,
              "",
            )
            .replace(
              /리뷰더보기/g,
              "",
            )
            .replace(
              /동영상/g,
              "",
            )
            .slice(
              0,
              3000,
            );

        if (
          !key ||
          seen.has(
            key,
          )
        ) {
          continue;
        }

        seen.add(
          key,
        );

        reviews.push({
          id:
            `catalog-dom-${reviews.length + 1}`,
          score,
          text:
            raw.slice(
              0,
              2500,
            ),
          createDate:
            date,
          productNo:
            catalogProductNo(),
          productName:
            "",
          productUrl:
            location.href,
          reviewType:
            "CATALOG_DOM",
        });

        if (
          reviews.length >=
          SHALLOW_REVIEW_LIMIT
        ) {
          break;
        }
      }

      return reviews;
    };

  const firstText = (
    review,
  ) => {
    const directKeys = [
      "content",
      "reviewContent",
      "text",
      "reviewText",
      "comment",
      "body",
      "contents",
    ];

    for (
      const key of
      directKeys
    ) {
      const value =
        review?.[key];

      if (
        typeof value ===
          "string" &&
        clean(
          value,
        )
      ) {
        return clean(
          value,
        );
      }
    }

    const nestedCandidates = [
      review?.content,
      review?.reviewContent,
      review?.review,
      review?.detail,
    ];

    for (
      const item of
      nestedCandidates
    ) {
      if (
        !item ||
        typeof item !==
          "object" ||
        Array.isArray(
          item,
        )
      ) {
        continue;
      }

      for (
        const key of
        directKeys
      ) {
        const value =
          item?.[key];

        if (
          typeof value ===
            "string" &&
          clean(
            value,
          )
        ) {
          return clean(
            value,
          );
        }
      }
    }

    return "";
  };

  const normalizeNativeReview =
    (
      review,
      index,
    ) => {
      const text =
        firstText(
          review,
        );

      const id =
        clean(
          review?.id ||
          review?.reviewId ||
          review?.reviewNo ||
          "",
        );

      const score =
        Number(
          review?.starScore ??
          review?.reviewScore ??
          review?.score ??
          review?.rating ??
          0,
        );

      const createDate =
        clean(
          review?.createDate ||
          review?.registerDate ||
          review?.reviewDate ||
          review?.createdAt ||
          review?.date ||
          "",
        );

      return {
        ...review,
        id:
          id ||
          `catalog-native-${index + 1}`,
        score:
          Number.isFinite(
            score,
          )
            ? score
            : 0,
        text:
          text.slice(
            0,
            2500,
          ),
        createDate,
        productNo:
          catalogProductNo(),
        productName:
          clean(
            review?.productName ||
            review?.productTitle ||
            "",
          ),
        productUrl:
          location.href,
        reviewType:
          "CATALOG_NATIVE",
      };
    };

  const nativeReviewKey =
    (
      review,
      index,
    ) => {
      const id =
        clean(
          review?.id ||
          review?.reviewId ||
          review?.reviewNo ||
          "",
        );

      if (id) {
        return (
          "id:" +
          id
        );
      }

      const text =
        firstText(
          review,
        )
          .replace(
            /\s+/g,
            " ",
          )
          .trim()
          .slice(
            0,
            500,
          );

      const date =
        clean(
          review?.createDate ||
          review?.registerDate ||
          review?.reviewDate ||
          review?.createdAt ||
          review?.date ||
          "",
        );

      if (
        !date &&
        !text
      ) {
        return "";
      }

      return [
        "fallback",
        date,
        text,
        String(index),
      ].join(
        "|",
      );
    };

  const nativeEvidenceKey =
    (review) => {
      const text =
        firstText(
          review,
        )
          .replace(
            /\s+/g,
            " ",
          )
          .trim()
          .slice(
            0,
            2500,
          );

      if (!text) {
        return "";
      }

      return (
        "text:" +
        text
      );
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

      const data =
        message?.data?.data;

      const reviews =
        Array.isArray(
          data?.reviews,
        )
          ? data.reviews
          : [];

      if (
        !reviews.length
      ) {
        return;
      }

      nativeTemplateUrl =
        clean(
          message.url,
        );

      if (
        nativeFirstPageSize ===
        0
      ) {
        nativeFirstPageSize =
          reviews.length;
      }

      const totalCount =
        Number(
          data?.totalCount ||
          0,
        );

      if (
        Number.isFinite(
          totalCount,
        ) &&
        totalCount > 0
      ) {
        nativeTotalCount =
          Math.floor(
            totalCount,
          );
      }

      reviews.forEach(
        (
          review,
          index,
        ) => {
          const reviewKey =
            nativeReviewKey(
              review,
              index,
            );

          if (
            !reviewKey ||
            nativeSeenReviewKeys.has(
              reviewKey,
            )
          ) {
            return;
          }

          nativeSeenReviewKeys.add(
            reviewKey,
          );

          const evidenceKey =
            nativeEvidenceKey(
              review,
            );

          if (!evidenceKey) {
            return;
          }

          if (
            nativeReviews.has(
              evidenceKey,
            )
          ) {
            nativeDuplicateTextCount +=
              1;

            return;
          }

          nativeReviews.set(
            evidenceKey,
            normalizeNativeReview(
              review,
              nativeReviews.size,
            ),
          );
        },
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

      nativeResponseSerial +=
        1;
      nativeResponseCount +=
        1;

      console.log(
        "PROJECT_D_CATALOG_NATIVE_REVIEW_CAPTURED",
        {
          requestedPage:
            message.requestedPage ??
            null,
          responseReviews:
            reviews.length,
          rawUniqueReviewCount:
            nativeSeenReviewKeys.size,
          uniqueEvidenceReviews:
            nativeReviews.size,
          duplicateTextReviews:
            nativeDuplicateTextCount,
          totalCount:
            nativeTotalCount,
          url:
            nativeTemplateUrl,
        },
      );
    },
  );

  const waitForNativeResponse =
    async (
      previousSerial,
      timeoutMs = 8000,
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

  const collectDeepNativeReviews =
    async () => {
      for (
        let attempt = 0;
        attempt < 40;
        attempt += 1
      ) {
        if (
          nativeTemplateUrl &&
          nativeReviews.size >
            0
        ) {
          break;
        }

        window.scrollTo({
          top:
            document
              .documentElement
              .scrollHeight,
          behavior:
            "instant",
        });

        await sleep(
          250,
        );
      }

      if (
        !nativeTemplateUrl ||
        nativeReviews.size ===
          0
      ) {
        return [];
      }

      const effectiveTarget =
        Math.min(
          targetReviewCount,
          nativeTotalCount >
            0
            ? nativeTotalCount
            : targetReviewCount,
        );

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
            effectiveTarget /
            pageSize,
          ),
        );

      const availablePages =
        nativeTotalCount >
        0
          ? Math.max(
              1,
              Math.ceil(
                nativeTotalCount /
                pageSize,
              ),
            )
          : Math.min(
              200,
              Math.max(
                requiredPages * 3,
                requiredPages + 20,
              ),
            );

      if (
        nativeCapturedPages.size ===
          0 &&
        nativeReviews.size >
          0
      ) {
        nativeCapturedPages.add(
          1,
        );
      }

      let stagnantPages = 0;

      for (
        let page = 1;
        page <=
          availablePages;
        page += 1
      ) {
        if (
          nativeReviews.size >=
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

        const beforeUnique =
          nativeReviews.size;

        window.postMessage(
          {
            type:
              NATIVE_FETCH_PAGE,
            page,
            templateUrl:
              nativeTemplateUrl,
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
            "PROJECT_D_CATALOG_NATIVE_PAGE_TIMEOUT",
            {
              page,
              accumulated:
                nativeReviews.size,
            },
          );

          break;
        }

        if (
          nativeReviews.size >
          beforeUnique
        ) {
          stagnantPages = 0;
        } else {
          stagnantPages += 1;
        }

        if (
          stagnantPages >=
          10
        ) {
          console.warn(
            "PROJECT_D_CATALOG_NATIVE_UNIQUE_STAGNANT",
            {
              page,
              rawUniqueReviewCount:
                nativeSeenReviewKeys.size,
              uniqueEvidenceReviews:
                nativeReviews.size,
              duplicateTextReviews:
                nativeDuplicateTextCount,
            },
          );

          break;
        }

        await sleep(
          180,
        );
      }

      return Array.from(
        nativeReviews.values(),
      ).slice(
        0,
        effectiveTarget,
      );
    };

  const collectSpecs =
    async () => {
      let productInfoButton =
        null;

      for (
        let attempt = 0;
        attempt < 20;
        attempt += 1
      ) {
        productInfoButton =
          findControl(
            (text) =>
              text ===
              "제품정보",
          );

        if (
          productInfoButton
        ) {
          try {
            productInfoButton.scrollIntoView(
              {
                block:
                  "center",
                behavior:
                  "instant",
              },
            );

            await sleep(
              300,
            );

            productInfoButton.click();
          } catch {
            // ignore
          }

          await sleep(
            800,
          );

          break;
        }

        await sleep(
          250,
        );
      }

      let expandButton =
        null;

      for (
        let attempt = 0;
        attempt < 20;
        attempt += 1
      ) {
        expandButton =
          findControl(
            (text) =>
              text.includes(
                "제품속성 펼쳐보기",
              ),
          );

        if (
          expandButton
        ) {
          try {
            expandButton.scrollIntoView(
              {
                block:
                  "center",
                behavior:
                  "instant",
              },
            );

            await sleep(
              300,
            );

            expandButton.click();
          } catch {
            // ignore
          }

          await sleep(
            800,
          );

          break;
        }

        const existingAttributes =
          document.querySelectorAll(
            'div[class*="catalogSpecContainer_catalog_spec_wrap__"] dt',
          );

        if (
          existingAttributes.length >=
          2
        ) {
          break;
        }

        await sleep(
          250,
        );
      }

      let container =
        null;

      for (
        let attempt = 0;
        attempt < 20;
        attempt += 1
      ) {
        container =
          document.querySelector(
            'div[class*="catalogSpecContainer_catalog_spec_wrap__"]',
          );

        if (
          container &&
          container.querySelectorAll(
            "dt",
          ).length > 0
        ) {
          break;
        }

        await sleep(
          250,
        );
      }

      const specs = {};

      if (
        container
      ) {
        const terms = [
          ...container.querySelectorAll(
            "dt",
          ),
        ];

        for (
          const term of
          terms
        ) {
          const key =
            clean(
              term.innerText ||
              term.textContent,
            );

          const valueElement =
            term.nextElementSibling;

          const value =
            clean(
              valueElement
                ?.innerText ||
              valueElement
                ?.textContent,
            );

          if (
            !key ||
            !value
          ) {
            continue;
          }

          specs[key] =
            value;
        }
      }

      const catalogTitle =
        clean(
          document.title.replace(
            /\s*:\s*네이버\s*가격비교\s*$/i,
            "",
          ),
        );

      return {
        specs,
        catalogTitle,
      };
    };

  const run =
    async () => {
      await sleep(
        1200,
      );

      const {
        specs,
        catalogTitle,
      } =
        await collectSpecs();

      await activateReviews();

      if (
        deepReviewMode
      ) {
        const reviews =
          await collectDeepNativeReviews();

        if (
          reviews.length ===
          0
        ) {
          const fallbackReviews =
            collectDomReviews();

          sendDone({
            success:
              fallbackReviews.length >
              0,
            finalUrl:
              location.href,
            catalogProductNo:
              catalogProductNo(),
            reviewCountReturned:
              fallbackReviews.length,
            reviews:
              fallbackReviews,
            reviewSample:
              fallbackReviews.slice(
                0,
                5,
              ),
            specCount:
              Object.keys(
                specs,
              ).length,
            specs,
            catalogTitle,
            nativeResponseCaptured:
              false,
            sourceType:
              "catalog-dom-fallback",
            deepReview:
              true,
            targetReviewCount,
            totalAvailableReviews:
              nativeTotalCount,
            collectionComplete:
              false,
            reason:
              fallbackReviews.length >
              0
                ? "Catalog native reviews API를 포착하지 못해 DOM fallback을 사용했습니다."
                : "Catalog native reviews API와 리뷰 DOM을 모두 찾지 못했습니다.",
          });

          return;
        }

        sendDone({
          success:
            true,
          finalUrl:
            location.href,
          catalogProductNo:
            catalogProductNo(),
          reviewCountReturned:
            reviews.length,
          reviews,
          reviewSample:
            reviews.slice(
              0,
              5,
            ),
          specCount:
            Object.keys(
              specs,
            ).length,
          specs,
          catalogTitle,
          nativeResponseCaptured:
            true,
          nativeResponseCount,
          rawUniqueReviewCount:
            nativeSeenReviewKeys.size,
          uniqueEvidenceReviewCount:
            nativeReviews.size,
          duplicateTextReviewCount:
            nativeDuplicateTextCount,
          sourceType:
            "catalog-native",
          deepReview:
            true,
          targetReviewCount,
          totalAvailableReviews:
            nativeTotalCount,
          collectionComplete:
            nativeTotalCount >
            0
              ? reviews.length >=
                Math.min(
                  targetReviewCount,
                  nativeTotalCount,
                )
              : reviews.length >=
                targetReviewCount,
        });

        return;
      }

      let reviews = [];

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

        await sleep(
          500,
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
          specCount:
            Object.keys(
              specs,
            ).length,
          specs,
          catalogTitle,
          nativeResponseCaptured:
            nativeResponseCount >
            0,
          nativeResponseCount,
          totalAvailableReviews:
            nativeTotalCount,
          sourceType:
            nativeResponseCount >
            0
              ? "catalog-native-shallow"
              : "catalog-dom",
          reason:
            "Catalog 리뷰 DOM을 찾지 못했습니다.",
        });

        return;
      }

      sendDone({
        success:
          true,
        finalUrl:
          location.href,
        catalogProductNo:
          catalogProductNo(),
        reviewCountReturned:
          reviews.length,
        reviews,
        reviewSample:
          reviews.slice(
            0,
            5,
          ),
        specCount:
          Object.keys(
            specs,
          ).length,
        specs,
        catalogTitle,
        nativeResponseCaptured:
          nativeResponseCount >
          0,
        nativeResponseCount,
        totalAvailableReviews:
          nativeTotalCount,
        sourceType:
          nativeResponseCount >
          0
            ? "catalog-native-shallow"
            : "catalog-dom",
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
              ? "catalog-native"
              : "catalog-dom",
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
