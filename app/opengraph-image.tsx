import { ImageResponse } from "next/og";

export const alt = "PickVize AI Buying Advisor";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 88px",
          background:
            "linear-gradient(135deg, #f8fbff 0%, #eef4ff 58%, #dfe9ff 100%)",
          color: "#101828",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 58,
          }}
        >
          <div
            style={{
              width: 82,
              height: 82,
              borderRadius: 22,
              background: "#2563eb",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 52,
              fontWeight: 800,
            }}
          >
            P
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontSize: 54, fontWeight: 800, color: "#2563eb" }}>
              PickVize
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 20,
                letterSpacing: "0.18em",
                fontWeight: 700,
                color: "#475467",
              }}
            >
              AI BUYING ADVISOR
            </div>
          </div>
        </div>

        <div
          style={{
            maxWidth: 920,
            fontSize: 66,
            lineHeight: 1.12,
            fontWeight: 800,
            letterSpacing: "-0.03em",
          }}
        >
          Search less. Choose with better evidence.
        </div>

        <div
          style={{
            marginTop: 30,
            maxWidth: 900,
            fontSize: 28,
            lineHeight: 1.45,
            color: "#475467",
          }}
        >
          Specs, real-user reviews, and your priorities — analyzed together.
        </div>

        <div
          style={{
            marginTop: 62,
            display: "flex",
            gap: 18,
            fontSize: 22,
            color: "#344054",
          }}
        >
          <div>Specs</div>
          <div>•</div>
          <div>Reviews</div>
          <div>•</div>
          <div>Personal fit</div>
          <div>•</div>
          <div>Decision rationale</div>
        </div>
      </div>
    ),
    size,
  );
}
