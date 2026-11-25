import type { DecisionPayload } from "@/entities/decision";

export function DecisionSchedule({ candidate, emphasized = false }: {
  candidate: DecisionPayload["candidate"];
  emphasized?: boolean;
}) {
  const { startsAt, endsAt, timezone } = candidate.time;
  const dateTime = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });

  return (
    <dl className={`grid gap-x-6 [overflow-wrap:anywhere] sm:grid-cols-2 ${emphasized ? "gap-y-5" : "gap-y-3"}`}>
      <div>
        <dt className="text-xs font-semibold text-slate-600">모임 일시</dt>
        <dd className={`mt-1 font-semibold text-slate-950 ${emphasized ? "text-base leading-6 sm:text-lg" : "text-sm leading-5"}`}>
          <time className="block" dateTime={startsAt}>시작: {dateTime.format(new Date(startsAt))}</time>
          <time className="block" dateTime={endsAt}>종료: {dateTime.format(new Date(endsAt))}</time>
          <span className="mt-0.5 block text-xs font-normal text-slate-600">
            {timezone === "Asia/Seoul" ? "한국 시간 (Asia/Seoul)" : timezone}
          </span>
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold text-slate-600">장소</dt>
        <dd className="mt-1 text-sm leading-5 text-slate-700">
          <span className={`block font-semibold text-slate-950 ${emphasized ? "mb-1 text-lg leading-6 sm:text-xl" : "text-base"}`}>{candidate.place.name}</span>
          {candidate.place.address}
        </dd>
      </div>
      <div className={`flex flex-wrap items-baseline gap-x-2 sm:col-span-2 ${emphasized ? "border-t border-stone-200 pt-3" : ""}`}>
        <dt className="text-xs font-semibold text-slate-600">1인 예상 비용</dt>
        <dd className="text-sm font-semibold text-slate-950">
          {candidate.estimatedCostPerPersonKrw.toLocaleString("ko-KR")}원
        </dd>
      </div>
    </dl>
  );
}
