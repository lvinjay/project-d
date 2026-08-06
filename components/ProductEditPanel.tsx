"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type EditableProduct = {
  id: string;
  category: string;
  product_name: string;
  source_url: string;
  checkout_merchant_no: number | null;
  origin_product_no: number | null;
  review_analysis: unknown | null;
  created_at: string;
  updated_at: string;
};

type ProductEditPanelProps = {
  product: EditableProduct;
  onSaved: (product: EditableProduct) => void;
  onCancel: () => void;
};

type EditDraft = {
  category: string;
  productName: string;
  sourceUrl: string;
  checkoutMerchantNo: string;
  originProductNo: string;
};

const PRODUCT_SELECT_FIELDS =
  "id, category, product_name, source_url, checkout_merchant_no, origin_product_no, review_analysis, created_at, updated_at";

export default function ProductEditPanel({
  product,
  onSaved,
  onCancel,
}: ProductEditPanelProps) {
  const [draft, setDraft] =
    useState<EditDraft>({
      category: "",
      productName: "",
      sourceUrl: "",
      checkoutMerchantNo: "",
      originProductNo: "",
    });

  const [isSaving, setIsSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    setDraft({
      category: product.category,
      productName: product.product_name,
      sourceUrl: product.source_url,
      checkoutMerchantNo:
        product.checkout_merchant_no?.toString() ??
        "",
      originProductNo:
        product.origin_product_no?.toString() ??
        "",
    });

    setErrorMessage("");
  }, [product]);

  function updateField(
    field: keyof EditDraft,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      [field]:
        field === "checkoutMerchantNo" ||
        field === "originProductNo"
          ? value.replace(/[^0-9]/g, "")
          : value,
    }));
  }

  function isValidUrl(value: string) {
    try {
      const url = new URL(value);

      return (
        url.protocol === "https:" ||
        url.protocol === "http:"
      );
    } catch {
      return false;
    }
  }

  async function saveProduct() {
    const category = draft.category.trim();
    const productName =
      draft.productName.trim();
    const sourceUrl = draft.sourceUrl.trim();

    const checkoutMerchantNo = draft.checkoutMerchantNo.trim()
      ? Number(draft.checkoutMerchantNo)
      : null;

    const originProductNo = draft.originProductNo.trim()
      ? Number(draft.originProductNo)
      : null;

    if (!category) {
      alert("카테고리를 입력하세요.");
      return;
    }

    if (!productName) {
      alert("제품명을 입력하세요.");
      return;
    }

    if (!isValidUrl(sourceUrl)) {
      alert("올바른 상품 URL을 입력하세요.");
      return;
    }

    if (
      checkoutMerchantNo !== null &&
      (!Number.isInteger(checkoutMerchantNo) || checkoutMerchantNo <= 0)
    ) {
      alert("네이버 판매자 번호를 숫자로 입력하세요.");
      return;
    }

    if (
      originProductNo !== null &&
      (!Number.isInteger(originProductNo) || originProductNo <= 0)
    ) {
      alert("네이버 원상품 번호를 숫자로 입력하세요.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("products")
        .update({
          category,
          product_name: productName,
          source_url: sourceUrl,
          checkout_merchant_no:
            checkoutMerchantNo,
          origin_product_no:
            originProductNo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id)
        .select(PRODUCT_SELECT_FIELDS)
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error(
            "같은 상품 URL이 이미 등록되어 있습니다.",
          );
        }

        throw error;
      }

      onSaved(data as EditableProduct);
    } catch (error) {
      console.error(
        "제품 정보 수정 실패:",
        error,
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "제품 정보를 수정하지 못했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 18,
        padding: 20,
        borderRadius: 14,
        border: "1px solid #b9d8ff",
        background: "#f7fbff",
      }}
    >
      <h3 style={{ marginTop: 0 }}>
        제품 정보 수정
      </h3>

      <div
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        <div className="field">
          <label htmlFor={`category-${product.id}`}>
            <span>카테고리</span>
          </label>

          <input
            id={`category-${product.id}`}
            className="textInput"
            value={draft.category}
            onChange={(event) =>
              updateField(
                "category",
                event.target.value,
              )
            }
            disabled={isSaving}
          />
        </div>

        <div className="field">
          <label
            htmlFor={`product-name-${product.id}`}
          >
            <span>제품명</span>
          </label>

          <input
            id={`product-name-${product.id}`}
            className="textInput"
            value={draft.productName}
            onChange={(event) =>
              updateField(
                "productName",
                event.target.value,
              )
            }
            disabled={isSaving}
          />
        </div>

        <div className="field">
          <label
            htmlFor={`source-url-${product.id}`}
          >
            <span>네이버 상품 URL</span>
          </label>

          <textarea
            id={`source-url-${product.id}`}
            className="textInput"
            value={draft.sourceUrl}
            onChange={(event) =>
              updateField(
                "sourceUrl",
                event.target.value,
              )
            }
            rows={3}
            disabled={isSaving}
            style={{
              resize: "vertical",
              minHeight: 90,
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <div className="field">
            <label
              htmlFor={`merchant-${product.id}`}
            >
              <span>네이버 판매자 번호</span>
            </label>

            <input
              id={`merchant-${product.id}`}
              className="textInput"
              inputMode="numeric"
              value={draft.checkoutMerchantNo}
              onChange={(event) =>
                updateField(
                  "checkoutMerchantNo",
                  event.target.value,
                )
              }
              disabled={isSaving}
            />
          </div>

          <div className="field">
            <label
              htmlFor={`origin-${product.id}`}
            >
              <span>네이버 원상품 번호</span>
            </label>

            <input
              id={`origin-${product.id}`}
              className="textInput"
              inputMode="numeric"
              value={draft.originProductNo}
              onChange={(event) =>
                updateField(
                  "originProductNo",
                  event.target.value,
                )
              }
              disabled={isSaving}
            />
          </div>
        </div>
      </div>

      {errorMessage ? (
        <p
          style={{
            margin: "14px 0 0",
            color: "#b42318",
            lineHeight: 1.7,
          }}
        >
          {errorMessage}
        </p>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 18,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="primaryButton"
          onClick={saveProduct}
          disabled={isSaving}
        >
          {isSaving
            ? "수정 내용 저장 중..."
            : "수정 내용 저장"}
        </button>

        <button
          type="button"
          className="secondaryButton"
          onClick={onCancel}
          disabled={isSaving}
        >
          취소
        </button>
      </div>
    </div>
  );
}