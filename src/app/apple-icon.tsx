import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1b1e2b" }}>
        <span style={{ color: "#f8f4ed", fontSize: 120, fontWeight: 700, lineHeight: 1, marginTop: -16 }}>a</span>
        <span style={{ color: "#f08a70", fontSize: 120, fontWeight: 700, lineHeight: 1, marginTop: -16 }}>.</span>
      </div>
    ),
    { ...size },
  );
}
