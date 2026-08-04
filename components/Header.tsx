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
          <Link href="/search">제품 비교</Link>
          <Link href="/#how">이용 방법</Link>
          <Link href="/#categories">카테고리</Link>
          <button className="ghostButton" type="button" onClick={() => alert("로그인 기능은 다음 버전에서 연결됩니다.")}>로그인</button>
        </nav>
      </div>
    </header>
  );
}
