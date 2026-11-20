import type { DecisionPayload } from "@/entities/decision";

export function DecisionSchedule({ candidate }: { candidate: DecisionPayload["candidate"] }) {
  const { startsAt, endsAt, timezone } = candidate.time;
  const dateTime = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });

  return (
    <dl className="grid gap-x-6 gap-y-3 [overflow-wrap:anywhere] sm:grid-cols-2">
      <div>
        <dt className="text-xs font-semibold text-slate-600">모임 일시</dt>
        <dd className="mt-1 text-sm font-semibold leading-5 text-slate-950">
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
          <span className="block text-base font-semibold text-slate-950">{candidate.place.name}</span>
          {candidate.place.address}
        </dd>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 sm:col-span-2">
        <dt className="text-xs font-semibold text-slate-600">1인 예상 비용</dt>
        <dd className="text-sm font-semibold text-slate-950">
          {candidate.estimatedCostPerPersonKrw.toLocaleString("ko-KR")}원
        </dd>
      </div>
    </dl>
  );
}
