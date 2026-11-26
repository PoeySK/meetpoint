import { MeetPointBrand } from "@/shared/ui/meetpoint-brand";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mp-appointment mp-page">
      <header className="mp-shell py-4 sm:py-6">
        <MeetPointBrand />
      </header>
      <main className="mp-shell pb-10">
        <section className="mp-card mx-auto max-w-lg space-y-4 p-4 sm:p-6">
          <h1 className="break-keep text-2xl font-extrabold tracking-tight">
            페이지를 찾을 수 없어요
          </h1>
          <p className="break-keep text-sm leading-6 text-[var(--mp-muted)]">
            주소가 맞는지 확인해 주세요. 방장이 보낸 방 코드가 있다면 코드로 입장할 수 있어요.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link className="mp-button mp-button-primary" href="/">
              홈으로
            </Link>
            <Link className="mp-button mp-button-secondary" href="/join">
              방 코드로 입장하기
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
