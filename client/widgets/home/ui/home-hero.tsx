export function HomeHero() {
  return (
    <section className="space-y-5 px-1 sm:px-2 lg:pr-10">
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        MeetPoint
      </div>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          친구들과 약속을 시작해 보세요
        </p>
        <h1 className="max-w-xl text-3xl font-semibold leading-[1.15] tracking-tight sm:text-5xl">
          모임의 시작점을
          <br />
          가볍게 만들어 보세요
        </h1>
        <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
          방을 만들고 초대 링크를 공유하면, 모두의 시간과 장소를 함께 맞춰갈 수
          있습니다.
        </p>
      </div>
      <div className="grid max-w-xl gap-2 text-xs text-slate-600 sm:grid-cols-3">
        <p className="rounded-xl border border-slate-200/80 bg-white/65 p-3">
          <span className="mb-1 block text-[11px] font-semibold text-emerald-700">01</span>
          방 만들기
        </p>
        <p className="rounded-xl border border-slate-200/80 bg-white/65 p-3">
          <span className="mb-1 block text-[11px] font-semibold text-emerald-700">02</span>
          초대하기
        </p>
        <p className="rounded-xl border border-slate-200/80 bg-white/65 p-3">
          <span className="mb-1 block text-[11px] font-semibold text-emerald-700">03</span>
          의견 모으기
        </p>
      </div>
    </section>
  );
}
