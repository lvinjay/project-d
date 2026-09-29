export type ReviewRawFingerprintResolution = {
  accepted: boolean;
  inputFingerprint: string;
  matchedPipeline:
    | "v6"
    | "legacy"
    | "none";
};

export function resolveReviewRawInputFingerprint(
  requestedInputFingerprint: string,
  legacyInputFingerprint: string,
  v6InputFingerprint: string,
): ReviewRawFingerprintResolution {
  if (
    requestedInputFingerprint ===
      v6InputFingerprint
  ) {
    return {
      accepted: true,
      inputFingerprint:
        v6InputFingerprint,
      matchedPipeline: "v6",
    };
  }

  if (
    requestedInputFingerprint ===
      legacyInputFingerprint
  ) {
    return {
      accepted: true,
      inputFingerprint:
        legacyInputFingerprint,
      matchedPipeline: "legacy",
    };
  }

  return {
    accepted: false,
    inputFingerprint:
      legacyInputFingerprint,
    matchedPipeline: "none",
  };
}
