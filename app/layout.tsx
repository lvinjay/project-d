import type { Metadata } from "next";
import "./globals.css";

const siteName = "PickVize";
const title = "PickVize | AI 제품 구매 추천";
const description =
  "제품 스펙과 실사용 리뷰를 함께 분석해 내 조건에 맞는 제품과 선택 근거를 보여주는 AI 구매 의사결정 플랫폼";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s | PickVize",
  },
  description,
  applicationName: siteName,
  keywords: [
    "PickVize",
    "픽바이즈",
    "AI 제품 추천",
    "제품 비교",
    "구매 추천",
    "구매 가이드",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName,
    title,
    description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "PickVize AI Buying Advisor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
