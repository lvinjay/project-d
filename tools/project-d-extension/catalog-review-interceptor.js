(() => {
  if (window.__PROJECT_D_CATALOG_REVIEW_FETCH_INTERCEPTOR__) return;
  window.__PROJECT_D_CATALOG_REVIEW_FETCH_INTERCEPTOR__ = true;

  const RESPONSE_TYPE =
    "PROJECT_D_CATALOG_NATIVE_REVIEW_RESPONSE";
  const FETCH_PAGE_TYPE =
    "PROJECT_D_CATALOG_NATIVE_REVIEW_FETCH_PAGE";
  const SOURCE =
    "PROJECT_D_CATALOG_MAIN_WORLD";

  const originalFetch =
    window.fetch.bind(window);

  let templateUrl = "";
  let templateRequest = null;

  const isCatalogReviewUrl = (value) => {
    try {
      const url =
        new URL(
          String(value || ""),
          location.href,
        );

      return (
        url.origin ===
          location.origin &&
        /\/catalog\/api\/\d+\/reviews$/.test(
          url.pathname,
        )
      );
    } catch {
      return false;
    }
  };

  const getRequestedPage = (value) => {
    try {
      const url =
        new URL(
          String(value || ""),
          location.href,
        );

      const page =
        Number(
          url.searchParams.get(
            "page",
          ) || 0,
        );

      return Number.isFinite(
        page,
      ) &&
        page > 0
        ? Math.floor(
            page,
          )
        : null;
    } catch {
      return null;
    }
  };

  const normalizeUrl = (input) => {
    try {
      if (
        typeof input ===
        "string"
      ) {
        return new URL(
          input,
          location.href,
        ).href;
      }

      if (
        input instanceof
        Request
      ) {
        return new URL(
          input.url,
          location.href,
        ).href;
      }

      return "";
    } catch {
      return "";
    }
  };

  const postResponse = (
    url,
    status,
    data,
    requestedPage = null,
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
        status:
          Number(
            status ||
            0,
          ),
        requestedPage:
          requestedPage ===
          null
            ? null
            : Number(
                requestedPage,
              ),
        data,
      },
      "*",
    );
  };

  const captureResponse =
    async (
      url,
      response,
      requestedPage = null,
    ) => {
      if (
        !isCatalogReviewUrl(
          url,
        )
      ) {
        return;
      }

      try {
        templateUrl =
          String(
            url,
          );

        const clone =
          response.clone();

        const data =
          await clone.json();

        postResponse(
          url,
          response.status,
          data,
          requestedPage,
        );
      } catch {
        // 원래 페이지 fetch 동작에는 영향을 주지 않는다.
      }
    };

  window.fetch =
    async function(
      input,
      init,
    ) {
      const url =
        normalizeUrl(
          input,
        );

      if (
        isCatalogReviewUrl(
          url,
        )
      ) {
        try {
          templateRequest =
            new Request(
              input,
              init,
            );

          templateUrl =
            String(
              url,
            );
        } catch {
          templateRequest =
            null;
        }
      }

      const response =
        await originalFetch(
          input,
          init,
        );

      if (
        isCatalogReviewUrl(
          url,
        )
      ) {
        void captureResponse(
          url,
          response,
          getRequestedPage(
            url,
          ),
        );
      }

      return response;
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

      const base =
        String(
          message.templateUrl ||
          templateUrl ||
          "",
        );

      if (
        !base ||
        !isCatalogReviewUrl(
          base,
        )
      ) {
        return;
      }

      let pageUrl = "";

      try {
        const url =
          new URL(
            base,
            location.href,
          );

        url.searchParams.set(
          "page",
          String(
            requestedPage,
          ),
        );

        pageUrl =
          url.href;
      } catch {
        return;
      }

      let replayRequest =
        pageUrl;

      try {
        if (
          templateRequest
        ) {
          replayRequest =
            new Request(
              pageUrl,
              templateRequest,
            );
        }
      } catch {
        replayRequest =
          pageUrl;
      }

      void originalFetch(
        replayRequest,
      )
        .then(
          async (
            response,
          ) => {
            await captureResponse(
              pageUrl,
              response,
              requestedPage,
            );
          },
        )
        .catch(
          () => {
            // probe 쪽 timeout/fallback이 처리한다.
          },
        );
    },
  );
})();
