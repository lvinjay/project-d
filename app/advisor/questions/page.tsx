import { Suspense } from "react";
import QuestionsClient from "./QuestionsClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 40 }}>
          <h2>Project D</h2>
          <p>맞춤 질문을 준비하고 있습니다.</p>
        </main>
      }
    >
      <QuestionsClient />
    </Suspense>
  );
}
