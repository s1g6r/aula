import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Sans, Noto_Sans_Arabic, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

// Headings: Fraunces, a warm, soft serif. Everything else: the Noto family,
// which covers every script our students read. Arabic and Chinese load only
// when a page actually shows those characters.
// Only what the first paint needs is preloaded: one heading weight, and the
// Latin letters of the body font. Other alphabets (Cyrillic, Vietnamese,
// Arabic, Chinese) load only on pages that use them.
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], weight: "600" });
const body = Noto_Sans({ variable: "--font-body", subsets: ["latin"] });
const bodyExtra = Noto_Sans({ variable: "--font-body-extra", subsets: ["latin-ext", "cyrillic", "vietnamese"], preload: false });
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], preload: false });
const cjk = Noto_Sans_SC({ variable: "--font-cjk", preload: false });

export const metadata: Metadata = {
  title: { default: "Aula: every lesson, understood", template: "%s · Aula" },
  description:
    "Aula turns a teacher's voice into live captions in each student's home language, lets lost students signal it silently, and turns every lesson into a recap no one can miss.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f4ed" },
    { media: "(prefers-color-scheme: dark)", color: "#13151c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${bodyExtra.variable} ${arabic.variable} ${cjk.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
