export function HomeHero() {
  return (
    <section className="space-y-6 px-1 sm:px-4 lg:pr-12">
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        MeetPoint
      </div>
      <div className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Make the first move
        </p>
        <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          모임의 시작점을
          <br />
          가볍게 만들어 보세요
        </h1>
        <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
          방을 만들고 초대 링크를 공유하면, 모두의 시간과 장소를 함께 맞춰갈 수
          있습니다.
        </p>
      </div>
      <div className="grid max-w-xl gap-3 text-sm text-slate-600 sm:grid-cols-3">
        <p className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <span className="mb-1 block font-semibold text-slate-950">01</span>
          방 만들기
        </p>
        <p className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <span className="mb-1 block font-semibold text-slate-950">02</span>
          초대하기
        </p>
        <p className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <span className="mb-1 block font-semibold text-slate-950">03</span>
          함께 기다리기
        </p>
      </div>
    </section>
  );
}
