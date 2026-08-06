import { Suspense } from "react";
import AdvisorClient from "./AdvisorClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 40 }}>
          <h2>Project D</h2>
          <p>구매 가이드를 불러오는 중...</p>
        </main>
      }
    >
      <AdvisorClient />
    </Suspense>
  );
}