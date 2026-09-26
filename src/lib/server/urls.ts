import { headers } from "next/headers";
import QRCode from "qrcode";
import { env } from "./env";

// Public base URL: APP_URL when set (prod), otherwise the host this request
// came in on (dev, or a preview deploy).
export async function baseUrl(): Promise<string> {
  if (env.appUrl) return env.appUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function joinUrl(code: string): Promise<string> {
  return `${await baseUrl()}/join/${code}`;
}

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1b1e2bff", light: "#00000000" } });
}
