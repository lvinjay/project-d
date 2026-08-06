"use client";

import Link from "next/link";

export default function Header() {
  return (
    <header className="siteHeader">
      <div className="headerInner">
        <Link href="/" className="brand" aria-label="Project D 홈">
          Project D
          <small>Decision AI</small>
        </Link>
        <nav className="nav" aria-label="주요 메뉴">
          <Link href="/advisor?category=캠핑용%20에어컨">AI 구매 상담</Link>
          <Link href="/assistant">분석 결과</Link>
          <Link href="/#how">이용 방법</Link>
          <Link
            className="headerCta"
            href="/advisor?category=캠핑용%20에어컨"
          >
            무료 체험
          </Link>
        </nav>
      </div>
    </header>
  );
}
