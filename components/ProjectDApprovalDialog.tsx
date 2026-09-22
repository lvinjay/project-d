"use client";

import { useEffect, useRef, useState } from "react";

export type ApprovalDialogState = {
  title: string;
  lines: string[];
  confirmLabel: string;
  cancelLabel: string;
};

// Shared presentation extracted from ProjectDAutomationPanel. Only buttons decide;
// focus changes, backdrop clicks and browser visibility never approve or cancel.
export function ProjectDApprovalDialog({
  dialog: approvalDialog,
  onDecision: resolveApproval,
}: {
  dialog: ApprovalDialogState | null;
  onDecision: (approved: boolean) => void;
}) {
  return (
    <>
      {approvalDialog ? (
        <div
          role="presentation"
          style={{
            position:
              "fixed",
            inset: 0,
            zIndex: 10000,
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            padding: 24,
            background:
              "rgba(16, 24, 40, 0.58)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              approvalDialog.title
            }
            style={{
              width:
                "min(680px, 100%)",
              maxHeight:
                "80vh",
              overflowY:
                "auto",
              borderRadius: 16,
              background:
                "#ffffff",
              border:
                "1px solid #d0d5dd",
              boxShadow:
                "0 20px 60px rgba(16, 24, 40, 0.24)",
              padding: 24,
            }}
          >
            <h3
              style={{
                margin:
                  "0 0 16px",
              }}
            >
              {approvalDialog.title}
            </h3>

            <div
              style={{
                display:
                  "grid",
                gap: 6,
                whiteSpace:
                  "pre-wrap",
                lineHeight: 1.6,
                color:
                  "#344054",
              }}
            >
              {approvalDialog.lines.map(
                (line, index) => (
                  <div
                    key={`${index}:${line}`}
                    style={{
                      minHeight:
                        line
                          ? undefined
                          : 8,
                    }}
                  >
                    {line}
                  </div>
                ),
              )}
            </div>

            <div
              style={{
                marginTop: 22,
                display:
                  "flex",
                justifyContent:
                  "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() =>
                  resolveApproval(
                    false,
                  )
                }
                style={{
                  minWidth: 100,
                  padding:
                    "10px 16px",
                  borderRadius: 10,
                  border:
                    "1px solid #d0d5dd",
                  background:
                    "#ffffff",
                  cursor:
                    "pointer",
                  fontWeight: 700,
                }}
              >
                {approvalDialog.cancelLabel}
              </button>

              <button
                type="button"
                className="primaryButton"
                onClick={() =>
                  resolveApproval(
                    true,
                  )
                }
                style={{
                  minWidth: 130,
                }}
              >
                {approvalDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function usePersistentApproval() {
  const [dialog, setDialog] = useState<ApprovalDialogState | null>(null);
  const mounted = useRef(false);
  const running = useRef<symbol | null>(null);
  const pending = useRef<{
    dialog: ApprovalDialogState;
    resolve: (approved: boolean) => void;
  } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      running.current = null;
      const decision = pending.current;
      pending.current = null;
      decision?.resolve(false);
    };
  }, []);

  async function requestApproval(options: ApprovalDialogState): Promise<boolean> {
    if (!mounted.current) return false;
    if (pending.current) throw new Error("승인 대화상자가 이미 열려 있습니다.");
    const approved = await new Promise<boolean>((resolve) => {
      const nextDialog = { ...options };
      pending.current = { dialog: nextDialog, resolve };
      setDialog(nextDialog);
    });
    return approved && mounted.current;
  }

  function resolveApproval(approved: boolean) {
    const decision = pending.current;
    // Ignore a repeated click or an event retained from a previous dialog.
    if (!decision || decision.dialog !== dialog) return;
    pending.current = null;
    setDialog(null);
    decision.resolve(approved && mounted.current);
  }

  async function runExclusive(action: (isActive: () => boolean) => Promise<void>) {
    if (!mounted.current || running.current !== null) return;
    const token = Symbol("admin-paid-action");
    running.current = token;
    const isActive = () => mounted.current && running.current === token;
    try {
      await action(isActive);
    } finally {
      if (running.current === token) running.current = null;
    }
  }

  return { dialog, requestApproval, resolveApproval, runExclusive };
}
