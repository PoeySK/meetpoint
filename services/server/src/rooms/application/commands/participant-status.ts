import type { CandidateRecord } from '../../domain/candidate/candidate';
import {
  ParticipantResponseStatus,
  type ParticipantResponseRecord,
} from '../../domain/participant-response/participant-response';
import { ParticipantStatus } from '../../domain/participant/participant';

export function resolveParticipantStatus(
  participantId: string,
  activeCandidates: CandidateRecord[],
  responses: ParticipantResponseRecord[]
): ParticipantStatus {
  if (
    activeCandidates.length > 0 &&
    activeCandidates.every((candidate) =>
      responses.some(
        (response) =>
          response.participantId === participantId &&
          response.candidateId === candidate.id &&
          response.status === ParticipantResponseStatus.SUBMITTED
      )
    )
  ) {
    return ParticipantStatus.RESPONDED;
  }

  return ParticipantStatus.JOINED;
}
