"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <header className="siteHeader">
      <div className="headerInner">
        <Link href="/" className="brand" aria-label="Project D 홈">
          Project D
          <small>Decision AI</small>
        </Link>

        <button
          type="button"
          className="mobileMenuButton"
          aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={isOpen}
          aria-controls="primary-navigation"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span aria-hidden="true">{isOpen ? "✕" : "☰"}</span>
        </button>

        <nav
          id="primary-navigation"
          className={`nav ${isOpen ? "navOpen" : ""}`}
          aria-label="주요 메뉴"
        >
          <Link href="/advisor?category=캠핑용%20에어컨">
            AI 구매 상담
          </Link>
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
