(() => {
  if (window.__PROJECT_D_BRANDSTORE_PROBE_LISTENER__) return;
  window.__PROJECT_D_BRANDSTORE_PROBE_LISTENER__ = true;

  const START = "PROJECT_D_BRANDSTORE_PROBE_START";
  const DONE = "PROJECT_D_BRANDSTORE_PROBE_DONE";

  let activeRequestId = "";
  let finished = false;

  const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const clean = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  const sendDone = (result, message = "") => {
    if (!activeRequestId || finished) return;

    finished = true;

    chrome.runtime.sendMessage(
      {
        type: DONE,
        requestId: activeRequestId,
        result,
        message,
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
  };

  const activateReviewArea = async () => {
    if (!location.hash.includes("REVIEW")) {
      try {
        history.replaceState(
          history.state,
          "",
          location.pathname +
            location.search +
            "#REVIEW_DIALOG"
        );
      } catch {
        // ignore
      }
    }

    const directSelectors = [
      'a[href*="#REVIEW"]',
      'button',
      'a'
    ];

    for (const selector of directSelectors) {
      const elements = [
        ...document.querySelectorAll(selector)
      ];

      const reviewElement = elements.find((element) => {
        const text = clean(element.textContent);

        return (
          text === "리뷰" ||
          /^리뷰\s*\d+/.test(text)
        );
      });

      if (!reviewElement) continue;

      try {
        reviewElement.click();
      } catch {
        // ignore
      }

      await sleep(1200);

      break;
    }

    for (let i = 0; i < 20; i += 1) {
      window.scrollBy({
        top: Math.max(
          350,
          Math.floor(window.innerHeight * 0.65)
        ),
        behavior: "instant"
      });

      await sleep(300);
    }
  };

  const parseScore = (text) => {
    const match =
      String(text || "").match(
        /(?:평점\s*)?([1-5])(?:\s|$)/
      );

    return match ? Number(match[1]) : 0;
  };

  const collectReviews = () => {
    /*
     * Brand Store의 실제 개별 리뷰는
     * "평점 1~5" 요소를 내부에 가진 카드 구조다.
     *
     * CSS class 이름은 난수형이라 사용하지 않고,
     * 평점 요소 -> 가장 가까운 A / LI / ARTICLE 순으로
     * 실제 리뷰 카드만 찾는다.
     */
    const scoreNodes = [
      ...document.querySelectorAll("strong, span")
    ].filter((element) => {
      const text = clean(element.textContent);

      return /^평점\s*[1-5]$/.test(text);
    });

    const reviews = [];
    const seen = new Set();

    const findReviewCard = (scoreNode) => {
      const selectors = [
        "a",
        "li",
        "article"
      ];

      for (const selector of selectors) {
        const card = scoreNode.closest(selector);

        if (!card) continue;

        const text = clean(card.innerText);

        if (text.length < 40) continue;
        if (text.length > 2500) continue;
        if (!/^평점\s*[1-5]/.test(text)) continue;

        return card;
      }

      /*
       * A/LI/ARTICLE가 없는 Brand Store 변형을 위한
       * 제한적 부모 탐색 fallback.
       */
      let current = scoreNode.parentElement;

      for (let depth = 0; depth < 5 && current; depth += 1) {
        const text = clean(current.innerText);

        if (
          text.length >= 40 &&
          text.length <= 2500 &&
          /^평점\s*[1-5]/.test(text)
        ) {
          return current;
        }

        current = current.parentElement;
      }

      return null;
    };

    for (const scoreNode of scoreNodes) {
      const card = findReviewCard(scoreNode);

      if (!card) continue;

      const raw = clean(card.innerText);

      /*
       * 페이지 공통 안내/상품정보 영역이 혹시 잡혀도 제외.
       */
      if (
        /상품정보 제공고시|판매자 상세정보|개인정보 처리방침|네이버 이용약관|NAVER Copyright|쇼핑 안전거래 TIP/.test(
          raw
        )
      ) {
        continue;
      }

      const score = parseScore(
        clean(scoreNode.textContent)
      );

      if (score < 1 || score > 5) {
        continue;
      }

      /*
       * 같은 카드가 STRONG/SPAN 양쪽에서 중복 검출되는 경우 제거.
       * 리뷰 카드 전체 텍스트를 정규화해서 key로 사용한다.
       */
      const normalizedKey = raw
        .replace(/\s+/g, "")
        .slice(0, 1500);

      if (
        !normalizedKey ||
        seen.has(normalizedKey)
      ) {
        continue;
      }

      seen.add(normalizedKey);

      const date =
        raw.match(
          /\b\d{2}\.\d{2}\.\d{2}\.?\b/
        )?.[0] || "";

      reviews.push({
        id: `brand-dom-${reviews.length + 1}`,
        score,
        text: raw.slice(0, 2500),
        createDate: date,
        productNo:
          location.pathname.match(
            /\/products\/(\d+)/
          )?.[1] || "",
        productName: "",
        productUrl: location.href,
        reviewType: "BRAND_DOM"
      });
    }

    return reviews.slice(0, 20);
  };

  const run = async () => {
    await sleep(1000);

    await activateReviewArea();

    let reviews = [];

    for (let i = 0; i < 20; i += 1) {
      reviews = collectReviews();

      if (reviews.length >= 5) break;

      await sleep(500);
    }

    if (!reviews.length) {
      sendDone({
        success: false,
        finalUrl: location.href,
        reviewCountReturned: 0,
        reviews: [],
        reason:
          "Brand Store 리뷰 DOM을 찾지 못했습니다."
      });

      return;
    }

    console.log(
      "PROJECT_D_BRAND_REVIEWS_CAPTURED",
      {
        href: location.href,
        reviewCount: reviews.length
      }
    );

    sendDone({
      success: true,
      finalUrl: location.href,
      channelProductNo:
        location.pathname.match(
          /\/products\/(\d+)/
        )?.[1] || "",
      reviewCountReturned: reviews.length,
      reviews,
      reviewSample: reviews.slice(0, 5),
      nativeResponseCaptured: false,
      sourceType: "brand-dom"
    });
  };

  const startProbe = (id) => {
    const requestId = String(id || "");

    if (!requestId || activeRequestId) return;

    activeRequestId = requestId;

    console.log(
      "PROJECT_D_BRAND_PROBE_STARTED",
      {
        requestId,
        href: location.href
      }
    );

    void run().catch((error) => {
      sendDone({
        success: false,
        finalUrl: location.href,
        reviewCountReturned: 0,
        reviews: [],
        reason:
          error instanceof Error
            ? error.message
            : String(error)
      });
    });
  };

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (message?.type !== START) return;

      const requestId =
        String(message.requestId || "");

      console.log(
        "PROJECT_D_BRAND_PROBE_START_RECEIVED",
        {
          requestId,
          href: location.href
        }
      );

      sendResponse({
        accepted: Boolean(requestId),
        requestId,
        href: location.href
      });

      startProbe(requestId);
    }
  );
})();


