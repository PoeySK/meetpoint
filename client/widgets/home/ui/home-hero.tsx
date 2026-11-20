import Link from "next/link";

export function HomeHero() {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="font-bold">MeetPoint</p>
        <Link className="py-2 text-sm font-semibold underline underline-offset-4" href="/join">
          방 코드로 입장하기
        </Link>
      </div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">모임 시간과 장소를 정해 보세요</h1>
      <p className="text-sm leading-6 text-slate-600">방을 만들고 후보를 올리면 초대받은 사람이 의견을 남길 수 있어요.</p>
    </header>
  );
}
