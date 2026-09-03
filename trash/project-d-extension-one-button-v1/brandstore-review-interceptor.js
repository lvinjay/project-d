(() => {
  if (window.__PROJECT_D_BRANDSTORE_REVIEW_XHR_INTERCEPTOR__) return;
  window.__PROJECT_D_BRANDSTORE_REVIEW_XHR_INTERCEPTOR__ = true;

  const TARGETS = [
    "/n/v1/contents/reviews/query-pages",
    "/i/v1/contents/reviews/query-pages",
  ];

  const isTargetReviewUrl = (value) =>
    TARGETS.some(
      (target) =>
        String(
          value ||
          "",
        ).includes(
          target,
        ),
    );

  const RESPONSE_TYPE =
    "PROJECT_D_BRANDSTORE_NATIVE_REVIEW_RESPONSE";

  const FETCH_PAGE_TYPE =
    "PROJECT_D_BRANDSTORE_NATIVE_REVIEW_FETCH_PAGE";

  const SOURCE =
    "PROJECT_D_BRANDSTORE_MAIN_WORLD";

  const originalOpen =
    XMLHttpRequest.prototype.open;

  const originalSend =
    XMLHttpRequest.prototype.send;

  const originalSetRequestHeader =
    XMLHttpRequest.prototype.setRequestHeader;

  let requestTemplate =
    null;

  XMLHttpRequest.prototype.open =
    function(
      method,
      url,
      ...rest
    ) {
      try {
        this.__projectDBrandReviewUrl =
          String(
            url ||
            "",
          );

        this.__projectDBrandReviewMethod =
          String(
            method ||
            "",
          );

        this.__projectDBrandReviewHeaders =
          {};
      } catch {
        // ignore
      }

      return originalOpen.call(
        this,
        method,
        url,
        ...rest,
      );
    };

  XMLHttpRequest.prototype.setRequestHeader =
    function(
      name,
      value,
    ) {
      try {
        if (
          isTargetReviewUrl(
            this.__projectDBrandReviewUrl,
          )
        ) {
          this.__projectDBrandReviewHeaders[
            String(
              name ||
              "",
            )
          ] =
            String(
              value ||
              "",
            );
        }
      } catch {
        // ignore
      }

      return originalSetRequestHeader.call(
        this,
        name,
        value,
      );
    };

  XMLHttpRequest.prototype.send =
    function(body) {
      const xhr =
        this;

      if (
        isTargetReviewUrl(
          xhr.__projectDBrandReviewUrl,
        )
      ) {
        try {
          requestTemplate = {
            url:
              String(
                xhr.__projectDBrandReviewUrl ||
                "",
              ),

            method:
              String(
                xhr.__projectDBrandReviewMethod ||
                "POST",
              ),

            body:
              typeof body ===
                "string"
                ? body
                : null,

            headers: {
              ...(
                xhr.__projectDBrandReviewHeaders ||
                {}
              ),
            },
          };
        } catch {
          // 템플릿 저장 실패는 원래 페이지 요청에 영향을 주지 않는다.
        }

        xhr.addEventListener(
          "load",
          () => {
            try {
              if (
                xhr.status !==
                200
              ) {
                return;
              }

              let data =
                null;

              if (
                xhr.responseType ===
                  "json" &&
                xhr.response
              ) {
                data =
                  xhr.response;
              } else {
                const text =
                  typeof xhr.responseText ===
                  "string"
                    ? xhr.responseText
                    : "";

                if (text) {
                  data =
                    JSON.parse(
                      text,
                    );
                }
              }

              if (!data) {
                return;
              }

              window.postMessage(
                {
                  type:
                    RESPONSE_TYPE,

                  source:
                    SOURCE,

                  url:
                    String(
                      xhr.__projectDBrandReviewUrl ||
                      "",
                    ),

                  method:
                    String(
                      xhr.__projectDBrandReviewMethod ||
                      "",
                    ),

                  status:
                    xhr.status,

                  requestedPage:
                    (() => {
                      try {
                        const parsed =
                          typeof body ===
                            "string"
                            ? JSON.parse(
                                body,
                              )
                            : null;

                        return Number(
                          parsed?.page ||
                          0,
                        ) || null;
                      } catch {
                        return null;
                      }
                    })(),

                  data,
                },
                "*",
              );
            } catch {
              // 원래 Brand Store XHR 동작에는 영향을 주지 않는다.
            }
          },
        );
      }

      return originalSend.call(
        this,
        body,
      );
    };

  const postReplayResponse =
    (
      url,
      status,
      data,
      requestedPage,
    ) => {
      window.postMessage(
        {
          type:
            RESPONSE_TYPE,

          source:
            SOURCE,

          url:
            String(
              url ||
              "",
            ),

          method:
            String(
              requestTemplate?.method ||
              "POST",
            ),

          status:
            Number(
              status ||
              0,
            ),

          requestedPage:
            Number(
              requestedPage ||
              0,
            ) || null,

          data,
        },
        "*",
      );
    };

  const replayNativePage =
    (
      requestedPage,
    ) => {
      const template =
        requestTemplate;

      if (
        !template?.url ||
        !isTargetReviewUrl(
          template.url,
        ) ||
        typeof template.body !==
          "string"
      ) {
        return;
      }

      let parsedBody =
        null;

      try {
        parsedBody =
          JSON.parse(
            template.body,
          );
      } catch {
        return;
      }

      if (
        !parsedBody ||
        typeof parsedBody !==
          "object"
      ) {
        return;
      }

      const body = {
        ...parsedBody,
        page:
          requestedPage,
      };

      const xhr =
        new XMLHttpRequest();

      try {
        originalOpen.call(
          xhr,
          template.method ||
            "POST",
          template.url,
          true,
        );

        const headers =
          template.headers ||
          {};

        Object.entries(
          headers,
        ).forEach(
          (
            [
              name,
              value,
            ],
          ) => {
            try {
              originalSetRequestHeader.call(
                xhr,
                name,
                value,
              );
            } catch {
              // 브라우저가 금지한 헤더는 건너뛴다.
            }
          },
        );

        /*
         * 원본 request가 content-type을 명시하지 않은 경우를 대비한다.
         * 이미 있으면 중복 설정하지 않는다.
         */
        const hasContentType =
          Object.keys(
            headers,
          ).some(
            (name) =>
              String(
                name,
              ).toLowerCase() ===
              "content-type",
          );

        if (
          !hasContentType
        ) {
          try {
            originalSetRequestHeader.call(
              xhr,
              "content-type",
              "application/json;charset=UTF-8",
            );
          } catch {
            // ignore
          }
        }

        xhr.addEventListener(
          "load",
          () => {
            try {
              if (
                xhr.status !==
                  200
              ) {
                return;
              }

              let data =
                null;

              if (
                xhr.responseType ===
                  "json" &&
                xhr.response
              ) {
                data =
                  xhr.response;
              } else {
                const text =
                  typeof xhr.responseText ===
                    "string"
                    ? xhr.responseText
                    : "";

                if (
                  text
                ) {
                  data =
                    JSON.parse(
                      text,
                    );
                }
              }

              if (
                !data
              ) {
                return;
              }

              postReplayResponse(
                template.url,
                xhr.status,
                data,
                requestedPage,
              );
            } catch {
              // probe timeout/fallback이 처리한다.
            }
          },
        );

        originalSend.call(
          xhr,
          JSON.stringify(
            body,
          ),
        );
      } catch {
        // probe timeout/fallback이 처리한다.
      }
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
        FETCH_PAGE_TYPE
      ) {
        return;
      }

      const requestedPage =
        Math.max(
          1,
          Math.floor(
            Number(
              message.page ||
              1,
            ),
          ),
        );

      replayNativePage(
        requestedPage,
      );
    },
  );
})();
