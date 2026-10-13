import type { CandidateRecord } from './candidate';

// 장소 식별자가 없어 이름·주소 변경은 오탈자도 보수적으로 재확인한다.
export function requiresResponseReconfirmation(
  previous: Pick<
    CandidateRecord,
    'time' | 'place' | 'tags' | 'estimatedCostPerPersonKrw'
  >,
  next: Pick<
    CandidateRecord,
    'time' | 'place' | 'tags' | 'estimatedCostPerPersonKrw'
  >
): boolean {
  const tags = (values: string[]) =>
    JSON.stringify(
      [...new Set(values.map((tag) => tag.trim().toUpperCase()))].sort()
    );
  return (
    Date.parse(previous.time.startsAt) !== Date.parse(next.time.startsAt) ||
    Date.parse(previous.time.endsAt) !== Date.parse(next.time.endsAt) ||
    previous.place.name.trim() !== next.place.name.trim() ||
    previous.place.address.trim() !== next.place.address.trim() ||
    previous.estimatedCostPerPersonKrw !== next.estimatedCostPerPersonKrw ||
    tags(previous.tags) !== tags(next.tags)
  );
}
