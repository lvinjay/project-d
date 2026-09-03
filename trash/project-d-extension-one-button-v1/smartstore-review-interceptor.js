(() => {
  if (window.__PROJECT_D_REVIEW_XHR_INTERCEPTOR__) return;
  window.__PROJECT_D_REVIEW_XHR_INTERCEPTOR__ = true;

  const TARGET = "/i/v1/contents/reviews/query-pages";
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    try {
      this.__projectDUrl = String(url || "");
      this.__projectDMethod = String(method || "");
    } catch {}

    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;

    if (
      String(xhr.__projectDUrl || "").includes(TARGET)
    ) {
      xhr.addEventListener("load", () => {
        try {
          if (xhr.status !== 200) return;

          let data = null;

          if (
            xhr.responseType === "json" &&
            xhr.response
          ) {
            data = xhr.response;
          } else {
            const text =
              typeof xhr.responseText === "string"
                ? xhr.responseText
                : "";

            if (text) {
              data = JSON.parse(text);
            }
          }

          if (!data) return;

          window.postMessage(
            {
              type:
                "PROJECT_D_SMARTSTORE_NATIVE_REVIEW_RESPONSE",

              source:
                "PROJECT_D_SMARTSTORE_MAIN_WORLD",

              url:
                String(xhr.__projectDUrl || ""),

              status:
                xhr.status,

              data,
            },
            "*"
          );
        } catch {}
      });
    }

    return originalSend.call(this, body);
  };
})();
