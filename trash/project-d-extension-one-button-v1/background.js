const START = "PROJECT_D_NAVER_CAPTURE_START";
const DONE = "PROJECT_D_NAVER_CAPTURE_DONE";
const DELIVER = "PROJECT_D_NAVER_CAPTURE_DELIVER";
const SMARTSTORE_PROBE_DONE = "PROJECT_D_SMARTSTORE_PROBE_DONE";
const BRANDSTORE_PROBE_DONE = "PROJECT_D_BRANDSTORE_PROBE_DONE";
const CATALOG_PROBE_DONE = "PROJECT_D_CATALOG_REVIEW_PROBE_DONE";

const pending = new Map();

function deliver(adminTabId, requestId, success, result, message) {
  chrome.tabs.sendMessage(
    adminTabId,
    {
      type: DELIVER,
      requestId,
      success,
      result,
      message,
    },
    () => {
      const error = chrome.runtime.lastError;

      if (error) {
        console.error("PROJECT_D_DELIVER_FAILED", {
          adminTabId,
          requestId,
          message: error.message,
        });
        return;
      }

      console.log("PROJECT_D_DELIVER_OK", {
        adminTabId,
        requestId,
      });
    },
  );
}

function closeProbeTab(tabId) {
  if (!tabId) return;

  chrome.tabs
    .remove(tabId)
    .catch(() => {});
}

function openCurrentCandidate(requestId) {
  const state = pending.get(requestId);
  if (!state) return;

  const candidates = state.result?.candidates || [];
  const index = state.currentIndex || 0;

  if (index >= candidates.length) {
    const probes = state.reviewProbes || [];

    const successful = probes.filter(
      (probe) => probe?.success === true
    );

    const enoughReviews = successful.filter(
      (probe) =>
        Number(probe?.reviewCountReturned || 0) >= 5
    );

    const finalCandidates = candidates.map(
      (candidate, candidateIndex) => {
        const probe =
          probes[candidateIndex] || {
            success: false,
            reason: "리뷰 수집 결과 없음",
          };

        return {
          ...candidate,
          smartstoreReviewProbe: probe,
          browserReviews:
            probe?.reviews ||
            probe?.reviewSample ||
            [],
        };
      }
    );

    const finalResult = {
      ...state.result,

      candidates: finalCandidates,

      smartstoreReviewProbes: probes,

      browserReviewSummary: {
        attemptedCandidates: candidates.length,
        successfulCandidates: successful.length,
        candidatesWithAtLeast5Reviews:
          enoughReviews.length,
      },

      smartstoreReviewProbe:
        successful[0] ||
        probes[0] || {
          success: false,
          reason: "성공한 리뷰 수집 후보 없음",
        },
    };

    pending.delete(requestId);

    closeProbeTab(state.probeTabId);

    deliver(
      state.adminTabId,
      requestId,
      true,
      finalResult,
      ""
    );

    return;
  }

  const candidate = candidates[index];

  state.navigationIndex = index;
  state.navigationReady = false;
  state.processingNavigationIndex = -1;

  if (!candidate?.url) {
    state.reviewProbes[index] = {
      success: false,
      reason: "후보 URL 없음",
      candidateName: String(candidate?.name || ""),
    };

    state.currentIndex = index + 1;
    openCurrentCandidate(requestId);
    return;
  }

  const separator =
    candidate.url.includes("?") ? "&" : "?";

  const probeUrl =
    candidate.url +
    separator +
    "pd_probe=" +
    encodeURIComponent(requestId);

  if (state.probeTabId) {
    chrome.tabs.update(
      state.probeTabId,
      {
        url: probeUrl,
        active: true,
      },
      () => {
        void chrome.runtime.lastError;
      }
    );

    return;
  }

  chrome.tabs.create(
    {
      url: probeUrl,
      active: true,
    },
    (tab) => {
      const latest = pending.get(requestId);

      if (latest) {
        latest.probeTabId = tab?.id || null;
      }

      void chrome.runtime.lastError;
    }
  );
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === START) {
    const requestId = String(message.requestId || "");
    const adminTabId = sender.tab?.id;
    const payload = message.payload || {};

    if (!requestId || !adminTabId) {
      sendResponse({
        accepted: false,
        message: "요청 정보가 없습니다.",
      });
      return;
    }

    const params = new URLSearchParams({
      query: String(payload.category || ""),
      pd_request: requestId,
      pd_admin: String(adminTabId),
      pd_min: String(payload.minBudget || 0),
      pd_max: String(payload.maxBudget || 0),
      pd_target: String(payload.targetCount || 100),
    });

    chrome.tabs.create({
      url:
        "https://search.shopping.naver.com/search/all?" +
        params.toString(),
      active: true,
    });

    sendResponse({ accepted: true });
    return;
  }

  if (message?.type === DONE) {
    const adminTabId = Number(message.adminTabId);
    const requestId = String(message.requestId || "");
    const result = message.result;

    if (!Number.isFinite(adminTabId) || !requestId) return;

    if (
      message.success !== true ||
      !Array.isArray(result?.candidates) ||
      result.candidates.length === 0
    ) {
      deliver(
        adminTabId,
        requestId,
        message.success === true,
        result,
        message.message,
      );
      return;
    }

    pending.set(requestId, {
      adminTabId,
      result,
      searchTabId: sender.tab?.id || null,
      currentIndex: 0,
      reviewProbes: [],
      probeTabId: null,
    });

    openCurrentCandidate(requestId);

    return;
  }

  if (message?.type === SMARTSTORE_PROBE_DONE || message?.type === BRANDSTORE_PROBE_DONE || message?.type === CATALOG_PROBE_DONE) {
    const requestId = String(message.requestId || "");
    const state = pending.get(requestId);

    if (!state) return;

    const index = state.currentIndex || 0;
    const candidate =
      state.result?.candidates?.[index];

    const probe =
      message.result || {
        success: false,
        message:
          message.message ||
          "SmartStore review probe failed",
      };

    state.reviewProbes[index] = {
      ...probe,

      candidateName:
        String(candidate?.name || ""),

      candidateUrl:
        String(candidate?.url || ""),

      reviews:
        Array.isArray(probe?.reviews)
          ? probe.reviews
          : Array.isArray(probe?.reviewSample)
            ? probe.reviewSample
            : [],
    };

    state.currentIndex = index + 1;

    openCurrentCandidate(requestId);

    return;
  }
});

/* PROJECT_D_V053_SMARTSTORE_REDIRECT_FIX */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  let requestId = "";

  for (const [id, state] of pending.entries()) {
    if (state?.probeTabId === tabId) {
      requestId = id;
      break;
    }
  }

  if (!requestId) return;

  const state = pending.get(requestId);
  if (!state) return;

  if (state.navigationIndex !== state.currentIndex) {
    return;
  }

  if (changeInfo.url) {
    state.navigationReady = true;
  }

  if (changeInfo.status !== "complete") return;

  if (!state.navigationReady) {
    return;
  }

  const currentUrl = String(tab?.url || changeInfo.url || "");
  if (!currentUrl) return;

  const index = state.currentIndex || 0;

  if (state.processingNavigationIndex === index) {
    return;
  }

  state.processingNavigationIndex = index;

  const isSmartStore =
    currentUrl.startsWith("https://smartstore.naver.com/") ||
    currentUrl.startsWith("https://m.smartstore.naver.com/");

  const isBrandStore =
    currentUrl.startsWith("https://brand.naver.com/") ||
    currentUrl.startsWith("https://m.brand.naver.com/");

  const isCatalog =
    currentUrl.startsWith("https://search.shopping.naver.com/catalog/");

  if (isCatalog) {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["catalog-review-probe.js"],
      },
      () => {
        const injectionError = chrome.runtime.lastError;

        if (injectionError) {
          const candidate =
            state.result?.candidates?.[index];

          state.reviewProbes[index] = {
            success: false,
            candidateName: String(candidate?.name || ""),
            candidateUrl: String(candidate?.url || ""),
            finalUrl: currentUrl,
            reason:
              "Catalog probe 주입 실패: " +
              injectionError.message,
            reviews: [],
          };

          state.currentIndex = index + 1;
          openCurrentCandidate(requestId);
          return;
        }

        chrome.tabs.sendMessage(
          tabId,
          {
            type: "PROJECT_D_CATALOG_REVIEW_PROBE_START",
            requestId,
          },
          () => {
            const sendError = chrome.runtime.lastError;

            if (!sendError) return;

            const latest = pending.get(requestId);
            if (!latest) return;
            if (latest.currentIndex !== index) return;

            const candidate =
              latest.result?.candidates?.[index];

            latest.reviewProbes[index] = {
              success: false,
              candidateName: String(candidate?.name || ""),
              candidateUrl: String(candidate?.url || ""),
              finalUrl: currentUrl,
              reason:
                "Catalog probe START 실패: " +
                sendError.message,
              reviews: [],
            };

            latest.currentIndex = index + 1;
            openCurrentCandidate(requestId);
          },
        );
      },
    );

    return;
  }

  if (isBrandStore) {
    chrome.tabs.sendMessage(
      tabId,
      {
        type: "PROJECT_D_BRANDSTORE_PROBE_START",
        requestId,
      },
      () => {
        void chrome.runtime.lastError;
      },
    );

    return;
  }

  if (!isSmartStore) {
    const candidate =
      state.result?.candidates?.[index];

    state.reviewProbes[index] = {
      success: false,
      candidateName: String(candidate?.name || ""),
      candidateUrl: String(candidate?.url || ""),
      finalUrl: currentUrl,
      reason: "SmartStore/Brand Store/Catalog가 아닌 최종 URL",
      reviews: [],
    };

    state.currentIndex = index + 1;
    openCurrentCandidate(requestId);
    return;
  }

  chrome.tabs.sendMessage(
    tabId,
    {
      type: "PROJECT_D_SMARTSTORE_PROBE_START",
      requestId,
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
});









