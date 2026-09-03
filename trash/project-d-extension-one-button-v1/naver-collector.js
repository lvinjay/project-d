(() => {
  const params = new URLSearchParams(location.search);
  const requestId = params.get("pd_request");
  const adminTabId = Number(params.get("pd_admin"));
  const minBudget = Number(params.get("pd_min") || 0);
  const maxBudget = Number(params.get("pd_max") || 0);
  const targetCount = Number(params.get("pd_target") || 100);

  if (!requestId || !Number.isFinite(adminTabId) || window.__PROJECT_D_V5_RUNNING__) return;
  window.__PROJECT_D_V5_RUNNING__ = true;

  const collect = async (minBudget, maxBudget, targetCount) => {
      const sleep = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      const clean = (value) =>
        String(value || "").replace(/\s+/g, " ").trim();

      const num = (value) => {
        const n = Number(String(value || "").replace(/[^\d]/g, ""));
        return Number.isFinite(n) ? n : 0;
      };

      function getPrice(root) {
        const text = clean(root.innerText);

        const direct = text.match(
          /(?:최저|광고|최대할인가|할인가|판매가)\s*(\d{1,3}(?:,\d{3})+)\s*원/i,
        );
        if (direct) return num(direct[1]);

        const values = [
          ...text.matchAll(/(\d{1,3}(?:,\d{3})+)\s*원/g),
        ]
          .map((match) => num(match[1]))
          .filter((value) => value >= 1000);

        return values.length ? Math.min(...values) : 0;
      }

      function getImage(root) {
        const images = [...root.querySelectorAll("img")];

        for (const img of images) {
          const url =
            img.currentSrc ||
            img.src ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-original") ||
            img.getAttribute("data-lazy-src") ||
            "";

          if (url) {
            return {
              url,
              alt: clean(img.alt),
            };
          }
        }

        return { url: "", alt: "" };
      }

      function isNoiseText(value) {
        if (!value) return true;
        if (value.length < 5 || value.length > 240) return true;
        if (/^(찜하기|판매처|리뷰|더 알아보기|상품 더보기|브랜드스토어|정보)$/i.test(value)) return true;
        if (/^\d[\d,.]*\s*원?$/.test(value)) return true;
        return false;
      }

      function getProductLink(root) {
        const ranked = [...root.querySelectorAll("a")]
          .map((link) => ({
            href: link.href || "",
            text: clean(link.innerText),
            cls: String(link.className || ""),
          }))
          .filter((item) => item.href && !isNoiseText(item.text))
          .map((item) => {
            let score = 0;

            /*
              네이버 광고 카드 안에는 프로모션 문구, 상세정보, 판매처 등
              여러 링크가 같은 ader URL을 공유한다.
              실제 상품명 링크(adProduct_link__/product_link__)를 최우선한다.
              광고 상품 자체를 제외하는 필터는 아니다.
            */
            if (
              /(?:^|\\s)(?:adProduct|product)_link__/i.test(item.cls) &&
              !/(?:link_more|detail|brand_message|mall|btn)/i.test(item.cls)
            ) {
              score += 30;
            } else if (/product.*title|product.*name|title|name/i.test(item.cls)) {
              score += 10;
            }

            if (
              /ader\.naver\.com|cr3\.shopping\.naver\.com|shopping\.naver\.com/i.test(
                item.href,
              )
            ) {
              score += 4;
            }
            if (item.text.length >= 8 && item.text.length <= 180) score += 3;
            if (item.href.includes("#")) score -= 5;
            if (/브랜드스토어|공식몰|스토어|판매처|정보/.test(item.text)) score -= 5;

            return { ...item, score };
          })
          .sort((a, b) => b.score - a.score);

        const best = ranked[0];

        return best
          ? { href: best.href, text: best.text }
          : { href: "", text: "" };
      }

      function chooseName(root, linkData, imageData) {
        if (!isNoiseText(linkData.text)) {
          return linkData.text;
        }

        const selectors = [
          '[class*="product_title"]',
          '[class*="product_name"]',
          '[class*="title"]',
          '[class*="name"]',
          "strong",
          "b",
          "a",
        ];

        const candidates = [];

        for (const selector of selectors) {
          for (const el of root.querySelectorAll(selector)) {
            const value = clean(el.innerText);
            if (isNoiseText(value)) continue;

            const cls = String(el.className || "");
            let score = 0;
            if (/product.*title|product.*name/i.test(cls)) score += 12;
            else if (/title|name/i.test(cls)) score += 8;
            if (value.length >= 8 && value.length <= 180) score += 3;
            if (/브랜드스토어|공식몰|스토어|판매처|정보/.test(value)) score -= 5;

            candidates.push({ value, score });
          }
        }

        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length) {
          return candidates[0].value;
        }

        if (
          imageData.alt &&
          imageData.alt.length >= 6 &&
          imageData.alt.length <= 220 &&
          !/상품\s*이미지|이미지|로고/i.test(imageData.alt)
        ) {
          return imageData.alt;
        }

        return "";
      }

      function normalizeName(name) {
        return clean(name)
          .toUpperCase()
          .replace(/\s+/g, "")
          .replace(/[^A-Z0-9가-힣]/g, "")
          .slice(0, 160);
      }

      function modelKey(name) {
        const cleaned = clean(name)
          .toUpperCase()
          .replace(
            /\b(단품|화이트|블랙|베이지|퍼플|골드|라벤더|블루|노블|카밍|에센스)\b/g,
            " ",
          );

        const model = cleaned.match(
          /\b[A-Z]{1,8}[-_]?[A-Z0-9]{2,}[A-Z0-9-]*\b/,
        );

        if (model) return model[0];

        return cleaned
          .replace(/[^A-Z0-9가-힣]/g, "")
          .slice(0, 120);
      }

      const captured = new Map();

      function capture() {
        const roots = [
          ...document.querySelectorAll(
            '[class*="product_item"],[class*="adProduct_item"]',
          ),
        ];

        for (const root of roots) {
          const price = getPrice(root);
          const linkData = getProductLink(root);
          const imageData = getImage(root);
          const name = chooseName(root, linkData, imageData);

          if (!name || !price) continue;

          const key = normalizeName(name);
          if (!key) continue;

          const previous = captured.get(key);
          const item = {
            name,
            price,
            url: linkData.href || "",
            imageUrl: imageData.url || "",
            seller: "",
            reviewCount: 0,
            rating: 0,
          };

          if (
            !previous ||
            (!previous.imageUrl && item.imageUrl) ||
            (!previous.url && item.url)
          ) {
            captured.set(key, {
              ...previous,
              ...item,
              imageUrl: item.imageUrl || previous?.imageUrl || "",
              url: item.url || previous?.url || "",
            });
          }
        }
      }

      capture();

      let previousCount = captured.size;
      let stableCount = 0;

      for (let step = 1; step <= 35; step++) {
        window.scrollBy({
          top: Math.max(window.innerHeight * 0.8, 600),
          behavior: "smooth",
        });

        await sleep(1200);
        capture();

        const currentCount = captured.size;

        if (currentCount <= previousCount) {
          stableCount++;
        } else {
          stableCount = 0;
        }

        previousCount = currentCount;

        if (currentCount >= targetCount || stableCount >= 7) {
          break;
        }
      }

      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });

      await sleep(1800);
      capture();

      const allProducts = [...captured.values()];

      const budgetProducts = allProducts.filter((product) => {
        if (minBudget > 0 && product.price < minBudget) return false;
        if (maxBudget > 0 && product.price > maxBudget) return false;
        return true;
      });

      const seenModel = new Set();
      const candidates = [];

      for (const product of budgetProducts) {
        if (!product.name || !product.url || !product.price) continue;

        const key = modelKey(product.name);
        if (!key || seenModel.has(key)) continue;

        seenModel.add(key);
        candidates.push(product);
      }

      return {
        rawProducts: allProducts.length,
        budgetProducts: budgetProducts.length,
        finalCandidates: candidates.length,
        missingUrl: candidates.filter((item) => !item.url).length,
        missingImage: candidates.filter((item) => !item.imageUrl).length,
        candidates,
      };
    };

  void collect(minBudget, maxBudget, targetCount)
    .then((result) => chrome.runtime.sendMessage({
      type: "PROJECT_D_NAVER_CAPTURE_DONE",
      requestId,
      adminTabId,
      success: true,
      result,
    }))
    .catch((error) => chrome.runtime.sendMessage({
      type: "PROJECT_D_NAVER_CAPTURE_DONE",
      requestId,
      adminTabId,
      success: false,
      message: error instanceof Error ? error.message : String(error || "네이버 후보 수집 실패"),
    }));
})();
