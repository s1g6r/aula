import { ImageResponse } from "next/og";

// The preview image when someone shares aulaapp.xyz (Devpost, messages).
export const alt = "Aula: live classroom captions in every student's language";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f8f4ed", padding: 72 }}>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#1b1e2b" }}>
          aula<span style={{ color: "#b93b25" }}>.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, color: "#1b1e2b", lineHeight: 1.05 }}>Every lesson, understood.</div>
          <div style={{ fontSize: 76, fontWeight: 700, color: "#b93b25", lineHeight: 1.05 }}>In any language.</div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#4b5063", maxWidth: 900 }}>
            Live captions in each student&apos;s home language, a silent &ldquo;I&apos;m lost&rdquo; button, and a recap no one can miss.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {["Español", "Tiếng Việt", "Português", "Kreyòl", "Soomaali", "Français"].map((w) => (
            <div key={w} style={{ display: "flex", padding: "8px 18px", borderRadius: 999, background: "#fffdf9", border: "2px solid #e6dfd3", fontSize: 24, color: "#1b1e2b" }}>
              {w}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
