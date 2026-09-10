import Link from "next/link";

type Props = { captureId: string; category: string; finalists: unknown[] };

export default function NaverCaptureAutomation({ category }: Props) {
  return (
    <section style={{ marginTop: 30, padding: 22 }}>
      <h2>자동 분석은 중단되었습니다.</h2>
      <p>{category} 수집 화면을 열거나 새로고침해도 유료 수집·AI 분석을 시작하지 않습니다.</p>
      <p>관리자에서 무과금 파일럿 또는 승인 가능한 작업을 직접 선택해 주세요.</p>
      <Link href="/admin">관리자로 이동</Link>
    </section>
  );
}
