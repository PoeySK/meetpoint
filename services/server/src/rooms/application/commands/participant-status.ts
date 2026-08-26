import type { CandidateRecord } from '../../domain/candidate/candidate';
import type { ParticipantConditionRecord } from '../../domain/participant-condition/participant-condition';
import {
  ParticipantResponseStatus,
  type ParticipantResponseRecord,
} from '../../domain/participant-response/participant-response';
import { ParticipantStatus } from '../../domain/participant/participant';

export function resolveParticipantStatus(
  condition: ParticipantConditionRecord | null,
  activeCandidates: CandidateRecord[],
  responses: ParticipantResponseRecord[]
): ParticipantStatus {
  if (
    condition &&
    activeCandidates.length > 0 &&
    activeCandidates.every((candidate) =>
      responses.some(
        (response) =>
          response.participantId === condition.participantId &&
          response.candidateId === candidate.id &&
          response.status === ParticipantResponseStatus.SUBMITTED &&
          response.updatedAt.getTime() >= condition.updatedAt.getTime()
      )
    )
  ) {
    return ParticipantStatus.RESPONDED;
  }

  return ParticipantStatus.JOINED;
}

export function candidateFitsAvailabilityWindow(
  candidate: CandidateRecord,
  condition: ParticipantConditionRecord
): boolean {
  const candidateStart = new Date(candidate.time.startsAt).getTime();
  const candidateEnd = new Date(candidate.time.endsAt).getTime();

  return condition.availabilityWindows.some((window) => {
    const windowStart = new Date(window.startsAt).getTime();
    const windowEnd = new Date(window.endsAt).getTime();
    return candidateStart >= windowStart && candidateEnd <= windowEnd;
  });
}
