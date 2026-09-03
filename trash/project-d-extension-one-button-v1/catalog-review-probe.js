(() => {
  if (window.__PROJECT_D_CATALOG_REVIEW_PROBE_LISTENER__) return;
  window.__PROJECT_D_CATALOG_REVIEW_PROBE_LISTENER__ = true;

  const START = "PROJECT_D_CATALOG_REVIEW_PROBE_START";
  const DONE = "PROJECT_D_CATALOG_REVIEW_PROBE_DONE";

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
        message
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
  };

  const findControl = (matcher) => {
    const elements = [
      ...document.querySelectorAll(
        'button, a, [role="button"]'
      )
    ];

    return elements.find((element) => {
      const text = clean(
        element.innerText ||
        element.textContent
      );

      return matcher(text);
    });
  };

  const activateReviews = async () => {
    const getVisibleControls = () =>
      [
        ...document.querySelectorAll(
          'button, a, [role="button"]'
        )
      ].filter((element) =>
        Boolean(
          element.offsetWidth ||
          element.offsetHeight ||
          element.getClientRects().length
        )
      );

    /*
     * 1단계
     * Catalog 상세 화면의 "쇼핑몰리뷰" 탭을 먼저 연다.
     */
    let mallReviewButton = null;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const controls = getVisibleControls();

      mallReviewButton =
        controls.find((element) => {
          const text = clean(
            element.innerText ||
            element.textContent
          );

          return text === "쇼핑몰리뷰";
        }) ||
        controls.find((element) => {
          const text = clean(
            element.innerText ||
            element.textContent
          );

          return /^쇼핑몰리뷰[\d,]+$/.test(text);
        });

      if (mallReviewButton) {
        try {
          mallReviewButton.scrollIntoView({
            block: "center",
            behavior: "instant"
          });

          await sleep(300);

          mallReviewButton.click();
        } catch {
          // ignore
        }

        await sleep(1200);
        break;
      }

      await sleep(300);
    }

    /*
     * 2단계
     * 쇼핑몰리뷰 영역 안의 "쇼핑몰 리뷰 전체보기"를 연다.
     */
    let reviewAllButton = null;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const controls = getVisibleControls();

      reviewAllButton = controls.find((element) => {
        const text = clean(
          element.innerText ||
          element.textContent
        );

        return text === "쇼핑몰 리뷰 전체보기";
      });

      if (reviewAllButton) {
        try {
          reviewAllButton.scrollIntoView({
            block: "center",
            behavior: "instant"
          });

          await sleep(300);

          reviewAllButton.click();
        } catch {
          // ignore
        }

        await sleep(1500);
        break;
      }

      /*
       * 이미 전체 리뷰 카드가 충분히 렌더링된 경우에는
       * 별도 클릭 없이 다음 단계로 진행한다.
       */
      const existingCards =
        document.querySelectorAll(
          'div[class*="catalogMallReviewItem_mall_review_item__"]'
        );

      if (existingCards.length >= 5) {
        break;
      }

      await sleep(300);
    }

    console.log(
      "PROJECT_D_CATALOG_REVIEW_ACTIVATION",
      {
        mallReviewButtonFound:
          Boolean(mallReviewButton),
        reviewAllButtonFound:
          Boolean(reviewAllButton),
        reviewCardCount:
          document.querySelectorAll(
            'div[class*="catalogMallReviewItem_mall_review_item__"]'
          ).length
      }
    );
  };

  const collectReviews = () => {
    const cards = [
      ...document.querySelectorAll(
        'div[class*="catalogMallReviewItem_mall_review_item__"]'
      )
    ];

    const reviews = [];
    const seen = new Set();

    for (const card of cards) {
      const raw = clean(card.innerText);

      const score =
        Number(
          raw.match(/평점\s*([1-5])/)?.[1] || 0
        );

      const date =
        raw.match(
          /\b\d{2}\.\d{2}\.\d{2}\.?\b/
        )?.[0] || "";

      if (
        score < 1 ||
        score > 5 ||
        !date ||
        raw.length < 40
      ) {
        continue;
      }

      /*
       * 네이버가 동일 리뷰를 중복 DOM으로 렌더링하는
       * 경우가 있으므로 실제 리뷰 텍스트 기준 dedupe.
       */
      const key = raw
        .replace(/\s+/g, "")
        .replace(/더보기/g, "")
        .replace(/리뷰더보기/g, "")
        .replace(/동영상/g, "")
        .slice(0, 3000);

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);

      reviews.push({
        id: `catalog-dom-${reviews.length + 1}`,
        score,
        text: raw.slice(0, 2500),
        createDate: date,
        productNo:
          location.pathname.match(
            /\/catalog\/(\d+)/
          )?.[1] || "",
        productName: "",
        productUrl: location.href,
        reviewType: "CATALOG_DOM"
      });

      if (reviews.length >= 20) {
        break;
      }
    }

    return reviews;
  };

  /*
   * Catalog 제품정보의 구조화 스펙을 수집한다.
   *
   * 확인된 실제 DOM:
   * - "제품정보" 탭
   * - "제품속성 펼쳐보기"
   * - dt = 항목명
   * - 다음 dd = 항목값
   */
  const collectSpecs = async () => {
    let productInfoButton = null;

    for (
      let attempt = 0;
      attempt < 20;
      attempt += 1
    ) {
      productInfoButton =
        findControl(
          (text) =>
            text === "제품정보"
        );

      if (productInfoButton) {
        try {
          productInfoButton.scrollIntoView({
            block: "center",
            behavior: "instant"
          });

          await sleep(300);

          productInfoButton.click();
        } catch {
          // ignore
        }

        await sleep(800);
        break;
      }

      await sleep(250);
    }

    let expandButton = null;

    for (
      let attempt = 0;
      attempt < 20;
      attempt += 1
    ) {
      expandButton =
        findControl(
          (text) =>
            text.includes(
              "제품속성 펼쳐보기"
            )
        );

      if (expandButton) {
        try {
          expandButton.scrollIntoView({
            block: "center",
            behavior: "instant"
          });

          await sleep(300);

          expandButton.click();
        } catch {
          // ignore
        }

        await sleep(800);
        break;
      }

      /*
       * 이미 펼쳐져 있다면 버튼을 찾지 못해도
       * dt/dd가 렌더링된 순간 바로 진행한다.
       */
      const existingAttributes =
        document.querySelectorAll(
          'div[class*="catalogSpecContainer_catalog_spec_wrap__"] dt'
        );

      if (
        existingAttributes.length >= 2
      ) {
        break;
      }

      await sleep(250);
    }

    let container = null;

    for (
      let attempt = 0;
      attempt < 20;
      attempt += 1
    ) {
      container =
        document.querySelector(
          'div[class*="catalogSpecContainer_catalog_spec_wrap__"]'
        );

      if (
        container &&
        container.querySelectorAll("dt")
          .length > 0
      ) {
        break;
      }

      await sleep(250);
    }

    const specs = {};

    if (container) {
      const terms = [
        ...container.querySelectorAll(
          "dt"
        )
      ];

      for (const term of terms) {
        const key =
          clean(
            term.innerText ||
            term.textContent
          );

        const valueElement =
          term.nextElementSibling;

        const value =
          clean(
            valueElement?.innerText ||
            valueElement?.textContent
          );

        if (
          !key ||
          !value
        ) {
          continue;
        }

        specs[key] = value;
      }
    }

    const catalogTitle =
      clean(
        document.title.replace(
          /\s*:\s*네이버\s*가격비교\s*$/i,
          ""
        )
      );

    console.log(
      "PROJECT_D_CATALOG_SPECS_CAPTURED",
      {
        href:
          location.href,

        productInfoButtonFound:
          Boolean(
            productInfoButton
          ),

        expandButtonFound:
          Boolean(
            expandButton
          ),

        specCount:
          Object.keys(specs).length,

        specs
      }
    );

    return {
      specs,
      catalogTitle
    };
  };

  const run = async () => {
    await sleep(1200);

    /*
     * 같은 Catalog 방문에서 먼저 구조화 스펙을 확보한 뒤
     * 기존 검증된 리뷰 수집 순서를 그대로 실행한다.
     */
    const {
      specs,
      catalogTitle
    } =
      await collectSpecs();

    await activateReviews();

    let reviews = [];

    /*
     * React 렌더링까지 기다리면서 최대 약 10초 확인.
     */
    for (let i = 0; i < 20; i += 1) {
      reviews = collectReviews();

      if (reviews.length >= 5) {
        break;
      }

      await sleep(500);
    }

    if (!reviews.length) {
      sendDone({
        success: false,
        finalUrl: location.href,
        reviewCountReturned: 0,
        reviews: [],

        specCount:
          Object.keys(specs).length,

        specs,

        catalogTitle,

        nativeResponseCaptured: false,
        sourceType: "catalog-dom",
        reason:
          "Catalog 리뷰 DOM을 찾지 못했습니다."
      });

      return;
    }

    console.log(
      "PROJECT_D_CATALOG_REVIEWS_CAPTURED",
      {
        href: location.href,
        reviewCount: reviews.length
      }
    );

    sendDone({
      success: true,
      finalUrl: location.href,
      catalogProductNo:
        location.pathname.match(
          /\/catalog\/(\d+)/
        )?.[1] || "",
      reviewCountReturned: reviews.length,
      reviews,
      reviewSample: reviews.slice(0, 5),

      specCount:
        Object.keys(specs).length,

      specs,

      catalogTitle,

      nativeResponseCaptured: false,
      sourceType: "catalog-dom"
    });
  };

  const startProbe = (id) => {
    const requestId = String(id || "");

    if (!requestId || activeRequestId) return;

    activeRequestId = requestId;

    console.log(
      "PROJECT_D_CATALOG_PROBE_STARTED",
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
        nativeResponseCaptured: false,
        sourceType: "catalog-dom",
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
        "PROJECT_D_CATALOG_PROBE_START_RECEIVED",
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

