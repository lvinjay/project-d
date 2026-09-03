(() => {
  if (window.__PROJECT_D_SMARTSTORE_PROBE_LISTENER__) return;
  window.__PROJECT_D_SMARTSTORE_PROBE_LISTENER__ = true;

  let activeRequestId = "";
  let finished = false;
  let capturedReviewData = null;

  const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const getChannelProductNo = () =>
    location.pathname.match(/\/products\/(\d+)/)?.[1] || "";

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

    const reviews = normalizeReviews(message.data);

    if (!reviews.length) return;

    console.log("PROJECT_D_NATIVE_REVIEW_CAPTURED", {
      href: location.href,
      reviewCount: reviews.length,
      url: String(message.url || "")
    });

    capturedReviewData = {
      url: String(message.url || ""),
      data: message.data,
      reviews,
    };
  });

  const activateReviewArea = async () => {
    if (capturedReviewData) return;

    /*
     * SmartStore에서 리뷰 목록 XHR은 리뷰 영역이 실제로
     * 활성화되어야 발생하는 경우가 있으므로 #REVIEW를 우선 사용한다.
     */
    if (location.hash !== "#REVIEW") {
      try {
        history.replaceState(
          history.state,
          "",
          location.pathname + location.search + "#REVIEW"
        );
      } catch {
        // hash 변경 실패 시 아래 DOM/scroll fallback 사용
      }
    }

    const reviewSelectors = [
      "#REVIEW",
      '[id="REVIEW"]',
      'a[href="#REVIEW"]',
      '[href*="#REVIEW"]'
    ];

    for (const selector of reviewSelectors) {
      const element = document.querySelector(selector);

      if (!element) continue;

      try {
        element.scrollIntoView({
          behavior: "instant",
          block: "start"
        });
      } catch {
        // ignore
      }

      if (
        element instanceof HTMLElement &&
        typeof element.click === "function"
      ) {
        try {
          element.click();
        } catch {
          // ignore
        }
      }

      await sleep(1200);

      if (capturedReviewData) return;
    }

    /*
     * 텍스트가 '리뷰'인 탭/링크도 찾아서 활성화한다.
     */
    const clickable = Array.from(
      document.querySelectorAll("a, button")
    ).find((element) => {
      const text = String(element.textContent || "")
        .replace(/\s+/g, " ")
        .trim();

      return text === "리뷰" || text.startsWith("리뷰 ");
    });

    if (clickable instanceof HTMLElement) {
      try {
        clickable.click();
        await sleep(1200);
      } catch {
        // ignore
      }

      if (capturedReviewData) return;
    }
  };

  const scrollForNativeReviews = async () => {
    const startY = window.scrollY;

    await activateReviewArea();

    if (capturedReviewData) return;

    for (let i = 0; i < 40; i += 1) {
      if (capturedReviewData) break;

      window.scrollBy({
        top: Math.max(
          400,
          Math.floor(window.innerHeight * 0.7)
        ),
        behavior: "instant",
      });

      await sleep(400);
    }

    if (!capturedReviewData) {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      });

      await sleep(2000);
    }

    if (!capturedReviewData) {
      await activateReviewArea();
    }

    if (!capturedReviewData) {
      window.scrollTo({
        top: startY,
        behavior: "instant",
      });
    }
  };

  const run = async () => {
    await sleep(1000);

    await scrollForNativeReviews();

    for (let i = 0; i < 20; i += 1) {
      if (capturedReviewData) break;
      await sleep(500);
    }

    if (!capturedReviewData) {
      sendDone({
        success: false,
        finalUrl: location.href,
        channelProductNo: getChannelProductNo(),
        reason:
          "네이버 자체 query-pages 200 응답을 포착하지 못했습니다.",
      });

      return;
    }

    const reviews = capturedReviewData.reviews;

    const first = reviews[0] || {};

    sendDone({
      success: true,

      finalUrl:
        location.href,

      channelProductNo:
        String(
          first?.productNo ||
          getChannelProductNo()
        ),

      originProductNo:
        String(
          first?.originProductNo || ""
        ),

      productName:
        String(
          first?.productName || ""
        ),

      productUrl:
        String(
          first?.productUrl || ""
        ),

      reviewStatus: 200,

      reviewCountReturned:
        reviews.length,

      reviewSample:
        reviews
          .slice(0, 5)
          .map((review) => ({
            id:
              String(
                review?.id || ""
              ),

            score:
              Number(
                review?.reviewScore || 0
              ),

            text:
              String(
                review?.reviewContent || ""
              ).slice(0, 1000),

            createDate:
              String(
                review?.createDate || ""
              ),

            productNo:
              String(
                review?.productNo || ""
              ),

            originProductNo:
              String(
                review?.originProductNo || ""
              ),

            productName:
              String(
                review?.productName || ""
              ),
          })),

      reviews:
        reviews
          .slice(0, 20)
          .map((review) => ({
            id:
              String(
                review?.id || ""
              ),

            score:
              Number(
                review?.reviewScore || 0
              ),

            text:
              String(
                review?.reviewContent || ""
              ).slice(0, 2000),

            createDate:
              String(
                review?.createDate || ""
              ),

            productNo:
              String(
                review?.productNo || ""
              ),

            originProductNo:
              String(
                review?.originProductNo || ""
              ),

            productName:
              String(
                review?.productName || ""
              ),

            productUrl:
              String(
                review?.productUrl || ""
              ),

            option:
              String(
                review?.productOptionContent || ""
              ),

            reviewType:
              String(
                review?.reviewType || ""
              ),

            reviewContentClassType:
              String(
                review?.reviewContentClassType || ""
              ),
          })),

      nativeResponseCaptured: true,
    });
  };

  const startProbe = (id) => {
    const requestId = String(id || "");

    if (!requestId || activeRequestId) return;

    activeRequestId = requestId;

    console.log("PROJECT_D_PROBE_STARTED", {
      requestId,
      href: location.href,
      alreadyCaptured: Boolean(capturedReviewData)
    });

    void run().catch((error) => {
      sendDone({
        success: false,
        finalUrl: location.href,
        channelProductNo: getChannelProductNo(),
        reason:
          error instanceof Error
            ? error.message
            : String(error),
      });
    });
  };

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (
        message?.type !==
        "PROJECT_D_SMARTSTORE_PROBE_START"
      ) {
        return;
      }

      const requestId = String(message.requestId || "");

      console.log("PROJECT_D_PROBE_START_RECEIVED", {
        requestId,
        href: location.href
      });

      sendResponse({
        accepted: Boolean(requestId),
        requestId,
        href: location.href
      });

      startProbe(requestId);
    }
  );
})();




