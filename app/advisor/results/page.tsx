import { Suspense } from "react";
import ResultsClient from "./ResultsClient";

function Loading() {
  return (
    <main style={{ padding: 40 }}>
      <h2>Project D</h2>
      <p>맞춤 추천 결과를 준비하는 중입니다.</p>
    </main>
  );
}

export default function AdvisorResultsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ResultsClient />
    </Suspense>
  );
}
