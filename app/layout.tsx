import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project D | AI 제품 구매 추천",
  description: "제품 스펙과 실사용 리뷰를 분석해 나에게 맞는 제품을 추천하는 AI 구매 의사결정 플랫폼",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
