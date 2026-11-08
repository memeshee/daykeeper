import { ImageResponse } from "next/og";

export const alt = "Daykeeper — a public treasury with a new keeper every day";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card that shows up when someone shares the demo. */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f2eee4",
          color: "#191512",
          padding: "64px 72px",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <div style={{ fontSize: 30, letterSpacing: 12, fontWeight: 700 }}>DAYKEEPER</div>
          <div style={{ fontSize: 22, color: "#5a5248" }}>testnet · near</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, lineHeight: 1.08, maxWidth: 940, fontFamily: "serif" }}>
            A treasury with a new keeper every day. The keeper&apos;s key can give and speak.
            It cannot take.
          </div>
          <div style={{ marginTop: 28, fontSize: 26, color: "#be3a26" }}>
            you bid 0.20 NEAR → you may hand out 1.00 NEAR today, to anyone but yourself
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#5a5248" }}>
          <div>one auction · one key · one grant · one day</div>
          <div>daykeeper-tau.vercel.app</div>
        </div>
      </div>
    ),
    size,
  );
}
