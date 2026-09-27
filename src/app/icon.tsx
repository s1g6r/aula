import { ImageResponse } from "next/og";

// Browser tab icon: "a." in Aula's ink and coral.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1b1e2b", borderRadius: 14 }}>
        <span style={{ color: "#f8f4ed", fontSize: 44, fontWeight: 700, lineHeight: 1, marginTop: -6 }}>a</span>
        <span style={{ color: "#f08a70", fontSize: 44, fontWeight: 700, lineHeight: 1, marginTop: -6 }}>.</span>
      </div>
    ),
    { ...size },
  );
}
