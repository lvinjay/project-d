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

const CANDIDATE_TIMEOUT_MS = 20000;
const PROBE_DEADLINE_MS = 11 * 60 * 1000;

function finishMarketProbe(requestId, deadlineReached = false) {
  const state = pending.get(requestId);
  if (!state || state.mode === "deep-reviews") return;
  clearTimeout(state.candidateTimer);
  clearTimeout(state.deadlineTimer);
  pending.delete(requestId);
  closeProbeTab(state.probeTabId);
  const candidates = state.result.candidates;
  const probes = candidates.map((candidate, index) => state.reviewProbes[index] || {
    success: false, reviews: [], candidateName: String(candidate?.name || ""),
    reason: deadlineReached ? "전체 probe 11분 deadline 도달" : "리뷰 수집 결과 없음",
    stage: index === state.currentIndex ? (state.probeStage || "navigation") : "not-started",
    lastObservedUrl: index === state.currentIndex ? (state.lastObservedUrl || "") : "",
  });
  const successful = probes.filter(probe => probe.success === true);
  const probeFailures = probes.flatMap((probe, index) => probe.success === true ? [] : [{
    position: index + 1, index, name: String(candidates[index]?.name || ""),
    productName: String(candidates[index]?.name || ""),
    lastObservedUrl: String(probe.lastObservedUrl || probe.finalUrl || ""),
    stage: String(probe.stage || "probe"),
    reason: String(probe.reason || probe.message || "리뷰 probe 실패"),
  }]);
  deliver(state.adminTabId, requestId, true, {
    ...state.result,
    candidates: candidates.map((candidate, index) => ({ ...candidate,
      smartstoreReviewProbe: probes[index],
      browserReviews: probes[index].reviews || probes[index].reviewSample || [],
    })),
    smartstoreReviewProbes: probes,
    browserReviewSummary: {
      attemptedCandidates: state.attemptedCandidates || 0,
      successfulCandidates: successful.length,
      candidatesWithAtLeast5Reviews: successful.filter(probe => Number(probe.reviewCountReturned || 0) >= 5).length,
    },
    smartstoreReviewProbe: successful[0] || probes[0] || { success: false, reason: "성공한 리뷰 수집 후보 없음" },
    probeFailureCount: probeFailures.length, probeFailures, deadlineReached,
  }, "");
}

function completeMarketCandidate(requestId, token, probe) {
  const state = pending.get(requestId);
  if (!state || state.mode === "deep-reviews" || state.probeToken !== token) return;
  if (Date.now() >= state.deadlineAt) return finishMarketProbe(requestId, true);
  clearTimeout(state.candidateTimer);
  state.probeToken = null;
  const index = state.currentIndex;
  const candidate = state.result.candidates[index];
  state.reviewProbes[index] = { stage: state.probeStage || "navigation",
    lastObservedUrl: state.lastObservedUrl || "", ...probe,
    candidateName: String(candidate?.name || ""), candidateUrl: String(candidate?.url || ""),
    reviews: Array.isArray(probe?.reviews) ? probe.reviews : Array.isArray(probe?.reviewSample) ? probe.reviewSample : [],
  };
  state.currentIndex = index + 1;
  openCurrentCandidate(requestId);
}

function openCurrentCandidate(requestId) {
  const state = pending.get(requestId);
  if (!state || state.mode === "deep-reviews") return;
  if (Date.now() >= state.deadlineAt) return finishMarketProbe(requestId, true);
  const index = state.currentIndex;
  if (index >= state.result.candidates.length) return finishMarketProbe(requestId);
  const candidate = state.result.candidates[index];
  // Probe scripts echo requestId. Give each candidate its own ID, while Admin keeps the parent ID.
  const token = requestId + ":candidate:" + index;
  state.probeToken = token;
  state.navigationIndex = index;
  state.navigationReady = false;
  state.lastObservedUrl = "";
  state.probeStage = "navigation";
  state.processingNavigationIndex = -1;
  state.attemptedCandidates = index + 1;
  const fail = reason => completeMarketCandidate(requestId, token, { success: false, reason, reviews: [] });
  state.candidateTimer = setTimeout(() => fail("후보 probe 20초 timeout (탐색/START/DONE 대기 포함)"), CANDIDATE_TIMEOUT_MS);
  if (!candidate?.url) return fail("후보 URL 없음");
  // Preserve signed advertising query bytes; only append our parameter before any fragment.
  const rawUrl = String(candidate.url);
  try { new URL(rawUrl); } catch { return fail("후보 URL 형식 오류"); }
  const hashIndex = rawUrl.indexOf("#");
  const baseUrl = hashIndex < 0 ? rawUrl : rawUrl.slice(0, hashIndex);
  const fragment = hashIndex < 0 ? "" : rawUrl.slice(hashIndex);
  const probeUrl = baseUrl + (baseUrl.includes("?") ? "&" : "?") +
    "pd_probe=" + encodeURIComponent(token) + fragment;
  if (state.probeTabId) {
    chrome.tabs.update(state.probeTabId, { url: probeUrl, active: true }, () => {
      const error = chrome.runtime.lastError;
      if (error && pending.get(requestId)?.probeToken === token) {
        fail("후보 탭 update 실패: " + error.message);
      }
    });
    return;
  }
  if (state.creatingTab) return; // Never start a second tab while create is unresolved.
  state.creatingTab = true;
  chrome.tabs.create({ url: probeUrl, active: true }, tab => {
    const error = chrome.runtime.lastError;
    state.creatingTab = false;
    if (pending.get(requestId)?.probeToken !== token) {
      closeProbeTab(tab?.id);
      return;
    }
    if (error || !tab?.id) return fail("후보 탭 create 실패: " + (error?.message || "tab ID 없음"));
    state.probeTabId = tab.id;
  });
}
function openDeepReview(requestId) {
  const state = pending.get(requestId);

  if (
    !state ||
    state.mode !== "deep-reviews"
  ) {
    return;
  }

  const reviewSourceUrl =
    String(
      state.reviewSourceUrl ||
      "",
    );

  if (!reviewSourceUrl) {
    pending.delete(requestId);

    deliver(
      state.adminTabId,
      requestId,
      false,
      null,
      "심층 리뷰 수집 URL이 없습니다.",
    );

    return;
  }

  const separator =
    reviewSourceUrl.includes("?")
      ? "&"
      : "?";

  const probeUrl =
    reviewSourceUrl +
    separator +
    "pd_probe=" +
    encodeURIComponent(
      requestId,
    );

  chrome.tabs.create(
    {
      url:
        probeUrl,
      active:
        true,
    },
    (tab) => {
      const latest =
        pending.get(
          requestId,
        );

      if (!latest) {
        return;
      }

      latest.probeTabId =
        tab?.id ||
        null;

      void chrome.runtime.lastError;
    },
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

    if (
      payload.mode ===
      "deep-reviews"
    ) {
      const reviewSourceUrl =
        String(
          payload.reviewSourceUrl ||
          "",
        ).trim();

      const productName =
        String(
          payload.productName ||
          "",
        ).trim();

      const requestedMax =
        Number(
          payload.maxReviews ??
          1000,
        );

      const maxReviews =
        Math.max(
          1,
          Math.min(
            1000,
            Number.isFinite(
              requestedMax,
            )
              ? Math.floor(
                  requestedMax,
                )
              : 1000,
          ),
        );

      const isSmartStore =
        reviewSourceUrl.startsWith(
          "https://smartstore.naver.com/",
        ) ||
        reviewSourceUrl.startsWith(
          "https://m.smartstore.naver.com/",
        );

      const isCatalog =
        reviewSourceUrl.startsWith(
          "https://search.shopping.naver.com/catalog/",
        );

      const isBrandStore =
        reviewSourceUrl.startsWith(
          "https://brand.naver.com/",
        ) ||
        reviewSourceUrl.startsWith(
          "https://m.brand.naver.com/",
        );

      if (
        !reviewSourceUrl ||
        (
          !isSmartStore &&
          !isCatalog &&
          !isBrandStore
        )
      ) {
        sendResponse({
          accepted:
            false,
          message:
            "현재 심층 리뷰 수집기는 SmartStore, Naver Catalog, Brand Store URL을 지원합니다.",
        });

        return;
      }

      pending.set(
        requestId,
        {
          mode:
            "deep-reviews",
          adminTabId,
          productName,
          reviewSourceUrl,
          maxReviews,
          sourceType:
            isCatalog
              ? "catalog"
              : isBrandStore
                ? "brandstore"
                : "smartstore",
          probeTabId:
            null,
          probeStarted:
            false,
        },
      );

      openDeepReview(
        requestId,
      );

      sendResponse({
        accepted:
          true,
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
      deadlineAt: Date.now() + PROBE_DEADLINE_MS,
      deadlineTimer: setTimeout(() => finishMarketProbe(requestId, true), PROBE_DEADLINE_MS),
    });

    openCurrentCandidate(requestId);

    return;
  }

  if (message?.type === SMARTSTORE_PROBE_DONE || message?.type === BRANDSTORE_PROBE_DONE || message?.type === CATALOG_PROBE_DONE) {
    const messageToken = String(message.requestId || "");
    const requestId = pending.has(messageToken) ? messageToken :
      [...pending.entries()].find(([, value]) => value.mode !== "deep-reviews" && value.probeToken === messageToken)?.[0];
    const state = pending.get(requestId);

    if (!state) return;

    if (
      state.mode ===
        "deep-reviews" &&
      (
        message?.type ===
          SMARTSTORE_PROBE_DONE ||
        message?.type ===
          CATALOG_PROBE_DONE ||
        message?.type ===
          BRANDSTORE_PROBE_DONE
      )
    ) {
      const probe =
        message.result || {
          success:
            false,
          reason:
            message.message ||
            "SmartStore deep review probe failed",
          reviews: [],
        };

      const success =
        probe?.success ===
          true &&
        Array.isArray(
          probe?.reviews,
        ) &&
        probe.reviews.length >
          0;

      const result = {
        mode:
          "deep-reviews",
        productName:
          String(
            state.productName ||
            "",
          ),
        reviewSourceUrl:
          String(
            state.reviewSourceUrl ||
            "",
          ),
        requestedMaxReviews:
          Number(
            state.maxReviews ||
            1000,
          ),
        reviewCountReturned:
          Array.isArray(
            probe?.reviews,
          )
            ? probe.reviews.length
            : 0,
        probe,
      };

      pending.delete(
        requestId,
      );

      closeProbeTab(
        state.probeTabId,
      );

      deliver(
        state.adminTabId,
        requestId,
        success,
        result,
        success
          ? ""
          : String(
              probe?.reason ||
              message.message ||
              "심층 리뷰 수집에 실패했습니다.",
            ),
      );

      return;
    }

    if (state.probeToken !== messageToken || sender.tab?.id !== state.probeTabId ||
        state.navigationIndex !== state.currentIndex) return;
    completeMarketCandidate(requestId, messageToken, message.result || {
      success: false, reason: message.message || "리뷰 probe 실패", reviews: [],
    });

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

  if (
    state.mode ===
    "deep-reviews"
  ) {
    if (
      changeInfo.status !==
      "complete"
    ) {
      return;
    }

    const currentUrl =
      String(
        tab?.url ||
        changeInfo.url ||
        "",
      );

    if (!currentUrl) {
      return;
    }

    const isSmartStore =
      currentUrl.startsWith(
        "https://smartstore.naver.com/",
      ) ||
      currentUrl.startsWith(
        "https://m.smartstore.naver.com/",
      );

    const isCatalog =
      currentUrl.startsWith(
        "https://search.shopping.naver.com/catalog/",
      );

    const isBrandStore =
      currentUrl.startsWith(
        "https://brand.naver.com/",
      ) ||
      currentUrl.startsWith(
        "https://m.brand.naver.com/",
      );

    const expectedSourceType =
      String(
        state.sourceType ||
        "",
      );

    const sourceMatches =
      (
        expectedSourceType ===
          "smartstore" &&
        isSmartStore
      ) ||
      (
        expectedSourceType ===
          "catalog" &&
        isCatalog
      ) ||
      (
        expectedSourceType ===
          "brandstore" &&
        isBrandStore
      );

    if (!sourceMatches) {
      pending.delete(
        requestId,
      );

      closeProbeTab(
        state.probeTabId,
      );

      deliver(
        state.adminTabId,
        requestId,
        false,
        {
          mode:
            "deep-reviews",
          productName:
            String(
              state.productName ||
              "",
            ),
          reviewSourceUrl:
            String(
              state.reviewSourceUrl ||
              "",
            ),
          finalUrl:
            currentUrl,
        },
        "심층 리뷰 수집 URL이 요청한 네이버 리뷰 소스와 다른 페이지로 이동했습니다.",
      );

      return;
    }

    if (
      state.probeStarted
    ) {
      return;
    }

    state.probeStarted =
      true;

    const probeType =
      isCatalog
        ? "PROJECT_D_CATALOG_REVIEW_PROBE_START"
        : isBrandStore
          ? "PROJECT_D_BRANDSTORE_PROBE_START"
          : "PROJECT_D_SMARTSTORE_PROBE_START";

    chrome.tabs.sendMessage(
      tabId,
      {
        type:
          probeType,
        requestId,
        mode:
          "deep",
        deepReview:
          true,
        maxReviews:
          Number(
            state.maxReviews ||
            1000,
          ),
      },
      () => {
        const sendError =
          chrome.runtime.lastError;

        if (!sendError) {
          return;
        }

        const latest =
          pending.get(
            requestId,
          );

        if (!latest) {
          return;
        }

        pending.delete(
          requestId,
        );

        closeProbeTab(
          latest.probeTabId,
        );

        deliver(
          latest.adminTabId,
          requestId,
          false,
          null,
          (
            isCatalog
              ? "Catalog"
              : isBrandStore
                ? "Brand Store"
                : "SmartStore"
          ) +
            " 심층 리뷰 probe START 실패: " +
            sendError.message,
        );
      },
    );

    return;
  }

  if (Date.now() >= state.deadlineAt) return finishMarketProbe(requestId, true);
  if (state.navigationIndex !== state.currentIndex || !state.probeToken) return;
  const token = state.probeToken;
  const index = state.currentIndex;
  // Tab/request/index ownership is checked above; redirect URLs need not retain our query.
  if (changeInfo.url) {
    state.navigationReady = true;
    state.lastObservedUrl = changeInfo.url;
  }
  if (changeInfo.status !== "complete" || !state.navigationReady || state.processingNavigationIndex === index) return;
  const currentUrl = String(tab?.url || changeInfo.url || "");
  if (!currentUrl) return;
  state.lastObservedUrl = currentUrl;
  let host;
  try { host = new URL(currentUrl).hostname; } catch { return; }
  if (host === "cr.shopping.naver.com" || host === "ader.naver.com") {
    state.probeStage = "redirect";
    return; // Intermediate advertising page; watchdog bounds the remaining wait.
  }
  state.processingNavigationIndex = index;
  const isSmartStore = /^https:\/\/(?:m\.)?smartstore\.naver\.com\//.test(currentUrl);
  const isBrandStore = /^https:\/\/(?:m\.)?brand\.naver\.com\//.test(currentUrl);
  const isCatalog = currentUrl.startsWith("https://search.shopping.naver.com/catalog/");
  const fail = reason => completeMarketCandidate(requestId, token, { success: false, reason, finalUrl: currentUrl, reviews: [] });
  const sendStart = () => {
    if (pending.get(requestId)?.probeToken !== token) return;
    state.probeStage = "probe-start";
    chrome.tabs.sendMessage(tabId, {
      type: isCatalog ? "PROJECT_D_CATALOG_REVIEW_PROBE_START" : isBrandStore ? "PROJECT_D_BRANDSTORE_PROBE_START" : "PROJECT_D_SMARTSTORE_PROBE_START",
      requestId: token,
    }, () => {
      const error = chrome.runtime.lastError;
      if (error) fail("리뷰 probe START 실패: " + error.message);
      else if (pending.get(requestId)?.probeToken === token) state.probeStage = "probe-done-wait";
    });
  };
  if (isCatalog) {
    chrome.scripting.executeScript({ target: { tabId }, files: ["catalog-review-probe.js"] }, () => {
      const error = chrome.runtime.lastError;
      if (error) return fail("Catalog probe 주입 실패: " + error.message);
      sendStart();
    });
  } else if (isBrandStore || isSmartStore) {
    sendStart();
  } else {
    fail("SmartStore/Brand Store/Catalog가 아닌 최종 URL");
  }
});
