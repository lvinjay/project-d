(() => {
  const REQUEST = "PROJECT_D_NAVER_CAPTURE_REQUEST";
  const RESULT = "PROJECT_D_NAVER_CAPTURE_RESULT";
  const START = "PROJECT_D_NAVER_CAPTURE_START";
  const DELIVER = "PROJECT_D_NAVER_CAPTURE_DELIVER";

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== REQUEST || !event.data.requestId) return;

    chrome.runtime.sendMessage({
      type: START,
      requestId: event.data.requestId,
      payload: event.data.payload || {},
    }, (response) => {
      if (chrome.runtime.lastError || !response?.accepted) {
        window.postMessage({
          type: RESULT,
          requestId: event.data.requestId,
          success: false,
          message: chrome.runtime.lastError?.message || response?.message || "네이버 수집 시작 실패",
        }, window.location.origin);
      }
    });
  });

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (
        message?.type !== DELIVER ||
        !message.requestId
      ) {
        return;
      }

      window.postMessage({
        type: RESULT,
        requestId: message.requestId,
        success: message.success === true,
        result: message.result,
        message: message.message,
      }, window.location.origin);

      sendResponse({
        accepted: true,
        requestId: message.requestId,
      });
    }
  );
})();
