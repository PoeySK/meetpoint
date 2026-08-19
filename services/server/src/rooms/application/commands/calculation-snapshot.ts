import type { CandidateRecord } from '../../domain/candidate/candidate';
import type { ParticipantRecord } from '../../domain/participant/participant';
import type { ParticipantResponseRecord } from '../../domain/participant-response/participant-response';
import type { ScoreResultCoverage } from '../../domain/calculation/score-result';
import type { RoomRecord } from '../../domain/room/room-status';
import {
  isCandidateResponseForSnapshot,
  type SolverSnapshot,
} from '../ports/solver-contract';

export function createSolverSnapshot(
  requestId: string,
  room: RoomRecord,
  participants: ParticipantRecord[],
  candidates: CandidateRecord[],
  responses: ParticipantResponseRecord[],
  policyVersion: string,
  scoringProfile: string
): SolverSnapshot {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  return {
    requestId,
    policyVersion,
    scoringProfile,
    roomId: room.id,
    participants: participants.map((participant) => ({
      participantId: participant.id,
      responses: responses
        .filter((response) =>
          isCandidateResponseForSnapshot(response, participant.id, candidateIds)
        )
        .map((response) => ({
          candidateId: response.candidateId,
          availabilityStatus: response.availabilityStatus,
          travelBurden: response.travelBurden,
          note: response.note,
        })),
    })),
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.id,
      displayOrder: candidate.displayOrder,
      time: candidate.time,
      place: candidate.place,
      estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
      tags: [...candidate.tags],
    })),
  };
}

export function createInitialCoverage(
  snapshot: SolverSnapshot
): ScoreResultCoverage {
  const submittedResponses = snapshot.participants.reduce(
    (count, participant) => count + participant.responses.length,
    0
  );

  return {
    respondedParticipants: snapshot.participants.filter(
      (participant) => participant.responses.length > 0
    ).length,
    totalParticipants: snapshot.participants.length,
    submittedResponses,
    expectedResponses:
      snapshot.participants.length * snapshot.candidates.length,
  };
}
