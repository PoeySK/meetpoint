import { CreateRoomForm } from "@/features/create-room";
import Link from "next/link";

export function HomeWidget() {
  return (
    <div className="mp-page bg-[#f8f6f1] font-sans text-stone-950">
      <header className="border-b border-stone-200/80 bg-[#fdfcf9]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:max-w-7xl lg:px-8">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-stone-900 text-white">
              <span className="relative size-4 rounded-[3px] border border-current before:absolute before:inset-x-0 before:top-1 before:border-t before:border-current after:absolute after:right-0.5 after:bottom-0.5 after:size-1 after:rounded-[1px] after:bg-current" />
            </span>
            <div>
              <span className="block text-lg font-extrabold leading-5 tracking-tight">MeetPoint</span>
              <p className="mt-0.5 text-xs leading-4 text-stone-600 lg:hidden">같이 골라 봐요</p>
            </div>
          </div>
          <nav aria-label="홈 메뉴" className="hidden items-center lg:flex">
            <Link className="mp-button mp-button-secondary inline-flex min-h-11 items-center gap-2 rounded-lg" href="/join">
              방 코드로 입장하기 <span aria-hidden="true">→</span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-3 pb-6 pt-4 sm:px-6 lg:max-w-7xl lg:px-8 lg:pb-14 lg:pt-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.7fr)] lg:overflow-hidden lg:rounded-xl lg:border lg:border-stone-200 lg:bg-[#fffdfa] lg:shadow-[0_14px_36px_-24px_#44302350]">
          <div className="space-y-3 lg:col-start-2 lg:row-start-1 lg:self-center">
            <CreateRoomForm />
            <div className="flex flex-wrap items-center justify-between gap-x-3 rounded-lg border border-stone-200 bg-white/75 px-3 text-sm text-stone-600 sm:px-4 lg:hidden">
              <p>이미 초대받았나요?</p>
              <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-stone-900 hover:text-stone-600" href="/join">
                <span className="underline underline-offset-4">방 코드로 입장하기</span>
                <span aria-hidden="true" className="text-stone-500">→</span>
              </Link>
            </div>
          </div>
          <section
            aria-labelledby="home-intro-heading"
            className="relative isolate hidden overflow-hidden bg-[#211a15] text-white lg:col-start-1 lg:row-start-1 lg:flex lg:min-h-[30rem] lg:items-end"
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 -z-10 aspect-[16/11] bg-cover bg-[center_38%] lg:bg-[url('/home/meetpoint-table.webp')] after:absolute after:inset-0 after:bg-linear-to-t after:from-[#211a15] after:via-[#211a15]/60 after:via-38% after:to-transparent after:to-72%"
            />
            <div className="w-full p-8 xl:p-11">
              <h2 className="break-keep text-[clamp(2.5rem,4vw,3.75rem)] font-extrabold leading-[1.12] tracking-tight" id="home-intro-heading">
                우리한테 뭐가 좋을까?
              </h2>
              <p className="mt-4 max-w-md break-keep text-base leading-7 text-stone-100">
                각자 원하는 걸 모아, 같이 골라 봐요.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
